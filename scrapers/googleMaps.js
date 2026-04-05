'use strict';

/**
 * Google Maps Dedicated Scraper
 *
 * Extracts business listings directly from Google Maps by:
 *   1. Navigating to a search URL
 *   2. Collecting all /maps/place/ links from the results feed
 *   3. Visiting each business page to extract full contact data
 *   4. Optionally scraping reviewer profiles from the Reviews tab
 *
 * No API key required. Uses our browser pool + stealth layer.
 */

const browserPool  = require('../core/browser');
const stealth      = require('../stealth');
const logger       = require('../utils/logger');
const metrics      = require('../utils/metrics');
const { parseHTML } = require('../parser');

// ── Selectors — ordered by reliability ───────────────────────────────────────

const SEL = {
  feed:       '[role="feed"]',
  placeLinks: 'a[href*="/maps/place/"]',

  // Business detail panel
  name:    ['h1.DUwDvf', 'h1[class*="fontHeadline"]', 'h1'],
  phone:   ['[aria-label^="Phone:"]', '[aria-label^="Telephone:"]', '[data-item-id*="phone"]'],
  website: ['a[data-tooltip="Open website"]', 'a[aria-label*="website" i]', 'a[data-item-id="authority"]'],
  address: ['[aria-label^="Address:"]', 'button[data-tooltip="Copy address"]', '[data-item-id="address"]'],
  rating:  ['[aria-label*=" stars"]', '[aria-label*="star" i][role="img"]', '.fontDisplayLarge'],
  category:['button[jsaction*="pane.rating.category"]', '[jsaction*="category"]', '.DkEaL'],
  hours:   ['.t39EBf', '[aria-label*="hours" i]', '.o0Svhf'],

  // Reviews tab
  reviewTabs:    ['button[aria-label*="reviews" i]', '[role="tab"][aria-label*="review" i]'],
  reviewCards:   '[data-review-id]',
  reviewerName:  ['.d4r55', '.DU9Pgb', '.X43Kjb'],
  reviewerProfile: ['a[href*="/contrib/"]', 'a[href*="maps/contrib"]'],
  reviewerStats: ['.RfnDt', '.e2moi', '.F9iiv'],
  reviewRating:  ['[aria-label*="Rated"]', '[aria-label*="stars" i]'],
  reviewText:    ['.wiI7pd', '.MyEned', '.Jtu6Td'],
  reviewDate:    ['.rsqaWe', '.xRkPPb'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Google Consent page handler ───────────────────────────────────────────────
// VPS IPs in EU/non-US regions hit consent.google.com before Maps loads.
// Click "Accept all" to proceed automatically.
async function handleConsentPage(page) {
  try {
    if (!page.url().includes('consent.google.com')) return;
    logger.info('[GMaps] Consent page detected — accepting...');
    // Try multiple selectors for the accept button across locales
    const selectors = [
      'button[aria-label*="Accept all" i]',
      'button[aria-label*="Alle akzeptieren" i]',   // German
      'button[aria-label*="Accepter tout" i]',       // French
      'form[action*="save"] button',
      '#L2AGLb',                                      // legacy consent button
      'button.tHlp8d',
    ];
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel);
        if (await btn.count() > 0) {
          await btn.first().click();
          await page.waitForURL('**/maps/**', { timeout: 8000 }).catch(() => {});
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          logger.info('[GMaps] Consent accepted — continuing');
          return;
        }
      } catch {}
    }
    // Fallback: if still on consent, navigate directly to maps
    logger.warn('[GMaps] Could not click consent button — navigating directly');
    const continueUrl = new URL(page.url()).searchParams.get('continue');
    if (continueUrl) await page.goto(decodeURIComponent(continueUrl), { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {}
}

async function txt(locator, defaultVal = '') {
  try {
    const count = await locator.count();
    if (count > 0) return (await locator.first().textContent() || '').trim();
  } catch {}
  return defaultVal;
}

async function attr(locator, attribute, defaultVal = '') {
  try {
    const count = await locator.count();
    if (count > 0) return (await locator.first().getAttribute(attribute) || '').trim();
  } catch {}
  return defaultVal;
}

async function trySelectors(page, selectors, method = 'text') {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.count() > 0) {
        const val = method === 'text'
          ? (await loc.first().textContent() || '').trim()
          : (await loc.first().getAttribute(method) || '').trim();
        if (val) return val;
      }
    } catch {}
  }
  return '';
}

async function trySelectorsOnElement(el, selectors) {
  for (const sel of selectors) {
    try {
      const loc = el.locator(sel);
      if (await loc.count() > 0) {
        const val = (await loc.first().textContent() || '').trim();
        if (val) return val;
      }
    } catch {}
  }
  return '';
}

// ── Main search function ──────────────────────────────────────────────────────

/**
 * Search Google Maps and return structured business leads.
 *
 * @param {object} options
 *   location    – e.g. "Austin, TX"
 *   category    – e.g. "plumber"
 *   maxResults  – how many businesses to return (default 20)
 *   maxReviews  – reviewers to scrape per business (0 = skip)
 *   proxy       – proxy config
 *
 * @returns {{ leads: Lead[], reviewers: Reviewer[] }}
 */
async function searchGoogleMaps(options = {}) {
  const {
    location,
    category,
    maxResults  = 20,
    maxReviews  = 0,
    proxy       = null,
    cookies     = null,
    memory      = null,   // ScrapeMemory instance — skips already-scraped URLs
    cell        = null,   // { key, lat, lng, zoom } — if provided, search this specific grid cell
    job         = null,   // BullMQ job — used to save resume checkpoints between retry attempts
  } = options;

  if (!location || !category) {
    throw new Error('location and category are required');
  }

  let url;
  if (cell?.lat && cell?.lng) {
    // Cell-scoped search — biases results to this geographic area
    url = `https://www.google.com/maps/search/${encodeURIComponent(category)}/@${cell.lat},${cell.lng},${cell.zoom || 14}z/`;
    logger.info(`[GMaps] Cell search: "${category}" @ ${cell.lat},${cell.lng} zoom:${cell.zoom || 14}`);
  } else {
    const query = `${category} near ${location}`;
    url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;
    logger.info(`[GMaps] City search: "${query}"`);
  }

  const cfg     = stealth.getConfig();
  const context = await browserPool.createContext({ proxy, cookies, cfg });
  const page    = await context.newPage();

  const leads     = [];
  const reviewers = [];

  try {
    await stealth.applyToPage(page);

    // Block heavy resources for speed
    await page.route('**/*', route => {
      const t = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(t)) return route.abort();
      return route.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await handleConsentPage(page);
    await stealth.randomDelay(2000, 3500);

    // ── Collect business URLs from feed ────────────────────────────────────
    // Collect 3× maxResults so after deduping already-seen businesses there
    // are still fresh ones left — enables additive re-scanning of same city/category.
    let businessUrls = await collectBusinessUrls(page, maxResults * 3);
    logger.info(`[GMaps] Collected ${businessUrls.length} listing URLs`);

    // Filter out URLs already scraped in a previous session
    if (memory) {
      const before = businessUrls.length;
      businessUrls = await memory.filterNewUrls(businessUrls);
      if (before !== businessUrls.length)
        logger.info(`[GMaps] Memory: skipping ${before - businessUrls.length} already-scraped businesses`);
    }

    // Mark all collected URLs as scraped before visiting (so concurrent workers don't double-dip)
    if (memory) await memory.recordUrls(businessUrls);

    // ── Resume checkpoint — skip URLs already visited in a previous failed attempt ──
    // BullMQ retries the whole job on crash; _checkpoint persists across attempts via job.updateData()
    const prevCheckpoint = new Set(job?.data?._checkpoint || []);
    if (prevCheckpoint.size > 0) {
      const before = businessUrls.length;
      businessUrls = businessUrls.filter(u => !prevCheckpoint.has(u));
      logger.info(`[GMaps] Checkpoint: resuming from attempt ${job.attemptsMade} — skipping ${before - businessUrls.length} already-visited`);
    }

    // ── Visit each business ────────────────────────────────────────────────
    for (let i = 0; i < businessUrls.length; i++) {
      try {
        logger.debug(`[GMaps] Scraping business ${i + 1}/${businessUrls.length}`);
        const lead = await scrapeBusiness(page, businessUrls[i], category);

        if (lead) {
          leads.push(lead);

          // Optional reviewer scraping
          if (maxReviews > 0 && lead.maps_url) {
            const revs = await scrapeReviewers(page, lead, maxReviews);
            reviewers.push(...revs);
          }
        }

        // Save checkpoint after each successful visit so a crash here resumes from next URL
        if (job) {
          const visited = [...(job.data._checkpoint || []), businessUrls[i]];
          await job.updateData({ ...job.data, _checkpoint: visited }).catch(() => {});
        }

        await stealth.randomDelay(800, 1800);
      } catch (err) {
        logger.warn(`[GMaps] Business ${i + 1} failed: ${err.message}`);
      }
    }

    // Save cookies for future requests
    const savedCookies = await context.cookies();
    metrics.recordSuccess(0, 'google-maps');

    return { leads, reviewers, cookies: savedCookies };

  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ── Collect business listing URLs ─────────────────────────────────────────────

async function collectBusinessUrls(page, maxResults) {
  const seen = new Set();
  let   scrollAttempts = 0;
  const MAX_SCROLLS    = 25;

  while (seen.size < maxResults && scrollAttempts < MAX_SCROLLS) {
    const links = await page.locator(SEL.placeLinks).all();
    for (const link of links) {
      const href = await attr(link, 'href');
      if (href && href.includes('/maps/place/') && !seen.has(href)) {
        seen.add(href);
      }
    }

    if (seen.size >= maxResults) break;

    // Scroll the results feed
    const feed = page.locator(SEL.feed).first();
    const hasFeed = await feed.count() > 0;

    if (hasFeed) {
      await feed.evaluate(el => el.scrollBy(0, 800));
    } else {
      await page.evaluate(() => window.scrollBy(0, 800));
    }

    await stealth.randomDelay(800, 1500);
    scrollAttempts++;
  }

  return [...seen].slice(0, maxResults);
}

// ── Scrape individual business page ──────────────────────────────────────────

async function scrapeBusiness(page, url, category) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await stealth.randomDelay(1000, 2000);

  // Name
  const name = await trySelectors(page, SEL.name);
  if (!name) return null;

  // Phone — extract from aria-label, validate it looks like a real number
  const phoneRaw = await trySelectors(page, SEL.phone, 'aria-label');
  const phoneCleaned = phoneRaw.replace(/^(Phone|Telephone|Telefon|Téléphone|Telefono):\s*/i, '').trim();
  const phoneDigits  = phoneCleaned.replace(/\D/g, '');
  // Must have 7-15 digits and not be a rating/review artifact
  const phone = (phoneDigits.length >= 7 && phoneDigits.length <= 15 &&
                 !/star|review|rating/i.test(phoneCleaned))
    ? phoneCleaned : '';

  // Website — skip google.com links
  let website = '';
  for (const sel of SEL.website) {
    const href = await attr(page.locator(sel).first(), 'href');
    if (href && !href.includes('google.com') && href.startsWith('http')) {
      website = href;
      break;
    }
  }

  // Address
  const addrRaw = await trySelectors(page, SEL.address, 'aria-label');
  const address = addrRaw.replace(/^(Address|Adresse|Dirección|Indirizzo):\s*/i, '').trim();

  // Rating
  let rating = '';
  for (const sel of SEL.rating) {
    const ariaLabel = await attr(page.locator(sel).first(), 'aria-label');
    const m = ariaLabel.match(/([\d.]+)/);
    if (m) { rating = m[1]; break; }
    if (!ariaLabel) {
      const t = await txt(page.locator(sel).first());
      const tm = t.match(/([\d.]+)/);
      if (tm) { rating = tm[1]; break; }
    }
  }

  // Category (business type from Google's own label)
  const businessType = await trySelectors(page, SEL.category);

  // Hours
  const hours = await trySelectors(page, SEL.hours);

  // Review count
  let reviewCount = '';
  const rcAria = await attr(page.locator('[aria-label*="review" i]').first(), 'aria-label');
  const rcMatch = rcAria.match(/(\d[\d,]*)/);
  if (rcMatch) reviewCount = rcMatch[1];

  // Email — visit the business website if available and extract from HTML
  let email = '';
  if (website) {
    try {
      await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 12000 });
      const html = await page.content();
      const parsed = parseHTML(html, website);
      email = parsed.emails?.[0] || '';
      // Navigate back to Maps URL so subsequent logic (reviewers etc.) still works
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {
      // Website unreachable — skip silently
    }
  }

  return {
    name,
    category:      category,
    business_type: businessType,
    phone,
    email,
    website,
    address,
    rating,
    review_count:  reviewCount,
    hours,
    source:        'Google Maps',
    maps_url:      page.url(),
  };
}

// ── Scrape reviewer profiles ──────────────────────────────────────────────────

async function scrapeReviewers(page, lead, maxReviews) {
  const reviewers = [];

  try {
    // Navigate to business page
    if (page.url() !== lead.maps_url) {
      await page.goto(lead.maps_url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await stealth.randomDelay(1500, 2500);
    }

    // Click Reviews tab
    let tabClicked = false;
    for (const sel of SEL.reviewTabs) {
      const tab = page.locator(sel).first();
      if (await tab.count() > 0) {
        await tab.click();
        await stealth.randomDelay(1800, 2800);
        tabClicked = true;
        break;
      }
    }

    if (!tabClicked) {
      // Try tabs by text
      const tabs = await page.locator('[role="tab"]').all();
      for (const tab of tabs) {
        const label = ((await tab.getAttribute('aria-label')) || '').toLowerCase();
        const text  = ((await tab.textContent()) || '').toLowerCase();
        if (label.includes('review') || text.includes('review')) {
          await tab.click();
          await stealth.randomDelay(1800, 2500);
          break;
        }
      }
    }

    // Optionally sort by Newest
    try {
      const sortBtn = page.locator('[aria-label*="Sort reviews" i], [aria-label*="sort" i]').first();
      if (await sortBtn.count() > 0) {
        await sortBtn.click();
        await stealth.randomDelay(500, 800);
        const newestOpt = page.locator('[data-index="1"], [role="menuitem"]').first();
        if (await newestOpt.count() > 0) {
          await newestOpt.click();
          await stealth.randomDelay(800, 1200);
        }
      }
    } catch {}

    // Scroll and collect
    const seenIds  = new Set();
    let noNewCount = 0;
    let scrollIter = 0;

    while (reviewers.length < maxReviews && scrollIter < 30) {
      const cards = await page.locator(SEL.reviewCards).all();
      const prev  = reviewers.length;

      for (const card of cards) {
        const reviewId = await attr(card, 'data-review-id');
        if (seenIds.has(reviewId) && reviewId) continue;
        seenIds.add(reviewId || `_${seenIds.size}`);

        const reviewer = await extractReviewer(card, lead);
        if (reviewer) reviewers.push(reviewer);
        if (reviewers.length >= maxReviews) break;
      }

      if (reviewers.length >= maxReviews) break;

      // Check if we got new ones
      if (reviewers.length === prev) {
        noNewCount++;
        if (noNewCount >= 4) break;
      } else {
        noNewCount = 0;
      }

      // Scroll review panel
      let scrolled = false;
      for (const psel of ['.m6QErb.DxyBCb', '.m6QErb[aria-label]', '.m6QErb']) {
        const panel = page.locator(psel).first();
        if (await panel.count() > 0) {
          await panel.evaluate(el => el.scrollTop += 1200);
          scrolled = true;
          break;
        }
      }
      if (!scrolled) await page.evaluate(() => window.scrollBy(0, 800));

      await stealth.randomDelay(1200, 2000);
      scrollIter++;
    }

  } catch (err) {
    logger.warn(`[GMaps] Reviewer scrape failed (${lead.name}): ${err.message}`);
  }

  return reviewers.slice(0, maxReviews);
}

async function extractReviewer(card, lead) {
  try {
    const name = await trySelectorsOnElement(card, SEL.reviewerName);
    if (!name) return null;

    // Profile URL
    let profileUrl = '';
    for (const sel of SEL.reviewerProfile) {
      const href = await attr(card.locator(sel).first(), 'href');
      if (href) {
        profileUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
        break;
      }
    }

    // Stats line: "Local Guide · Level 5 · 312 reviews"
    const statsLine = await trySelectorsOnElement(card, SEL.reviewerStats);
    const isLocalGuide  = /local guide/i.test(statsLine);
    const levelMatch    = statsLine.match(/[Ll]evel\s*(\d+)/);
    const localGuideLevel = levelMatch ? `Level ${levelMatch[1]}` : (isLocalGuide ? 'Local Guide' : '');
    const countMatch    = statsLine.match(/(\d[\d,]*)\s+review/i);
    const reviewCount   = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0;

    // Rating given
    let ratingGiven = '';
    for (const sel of SEL.reviewRating) {
      const aria = await attr(card.locator(sel).first(), 'aria-label');
      const m = aria.match(/([\d.]+)/);
      if (m) { ratingGiven = m[1]; break; }
    }

    // Expand truncated review text
    try {
      const btns = await card.locator('button').all();
      for (const btn of btns) {
        const t = ((await btn.textContent()) || '').toLowerCase();
        if (t.includes('more')) { await btn.click(); await stealth.randomDelay(200, 400); break; }
      }
    } catch {}

    const reviewText = await trySelectorsOnElement(card, SEL.reviewText);
    const reviewDate = await trySelectorsOnElement(card, SEL.reviewDate);

    return {
      reviewer_name:         name,
      reviewer_profile_url:  profileUrl,
      reviewer_review_count: reviewCount,
      is_local_guide:        isLocalGuide ? 'Yes' : 'No',
      local_guide_level:     localGuideLevel,
      rating_given:          ratingGiven,
      review_text:           reviewText.slice(0, 500),
      review_date:           reviewDate,
      business_name:         lead.name,
      business_category:     lead.category,
      business_address:      lead.address,
    };
  } catch {
    return null;
  }
}

module.exports = { searchGoogleMaps };
