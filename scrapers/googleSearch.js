'use strict';

/**
 * Google Search Scraper
 *
 * Extracts local business leads from Google Search results via two passes:
 *   1. Local Pack  — the 3-card / map box at the top of results (richest data)
 *   2. Organic     — ranked business website links; visits each to pull contact info
 *
 * Complements googleMaps.js — finds different businesses since Maps and Search
 * don't always overlap in their first-page results.
 */

const browserPool  = require('../core/browser');
const stealth      = require('../stealth');
const { parseHTML } = require('../parser');
const logger       = require('../utils/logger');

// ── Selectors ─────────────────────────────────────────────────────────────────

// Local Pack (the map+cards block)
const LOCAL_PACK = {
  cards:   '[data-cid], .rllt__link, [jscontroller="AtSb"], .VkpGBb',
  name:    '.dbg0pd, .OSrXXb, .qBF1Pd, h3',
  phone:   '[data-dtype="d3ph"], .rllt__details span[aria-label]',
  website: 'a[data-cid][href], a[href*="//"][data-ved]',
  address: '.rllt__details div, .LrzXr',
  rating:  'span[aria-label*="star"], .Aq14fc',
};

// Organic results — business website links
const ORGANIC = {
  results: '#search .g, #rso .g',
  link:    'a[href^="http"]:not([href*="google"]):not([href*="youtube"])',
  title:   'h3',
};

// ── Main entry point ──────────────────────────────────────────────────────────

async function searchGoogle(options = {}) {
  const {
    location,
    category,
    maxResults = 20,
    proxy      = null,
    cookies    = null,
    memory     = null,   // ScrapeMemory instance for cursor tracking
  } = options;

  if (!location || !category) throw new Error('location and category are required');

  const query      = `${category} in ${location}`;
  const cursor     = memory?.getCursor('google_search', location, category);
  const startIndex = cursor?.start || 0;
  const url        = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&start=${startIndex}`;

  const cfg     = stealth.getConfig();
  const context = await browserPool.createContext({ proxy, cookies, cfg });
  const page    = await context.newPage();
  const leads   = [];

  try {
    await stealth.applyToPage(page);

    await page.route('**/*', route => {
      const t = route.request().resourceType();
      if (['image', 'media'].includes(t)) return route.abort();
      return route.continue();
    });

    logger.info(`[GSearch] Searching: "${query}"`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await stealth.randomDelay(1500, 2500);

    // ── Pass 1: Local Pack ────────────────────────────────────────────────────
    const packLeads = await scrapeLocalPack(page, category, location);
    leads.push(...packLeads);
    logger.info(`[GSearch] Local pack: ${packLeads.length} businesses`);

    // ── Pass 2: Organic website results ───────────────────────────────────────
    if (leads.length < maxResults) {
      const organicUrls = await collectOrganicUrls(page, maxResults - leads.length);
      logger.info(`[GSearch] Visiting ${organicUrls.length} organic websites`);

      for (const { url: siteUrl, title } of organicUrls) {
        if (leads.length >= maxResults) break;
        try {
          const lead = await scrapeWebsite(page, siteUrl, title, category, location);
          if (lead) leads.push(lead);
          await stealth.randomDelay(600, 1200);
        } catch (err) {
          logger.debug(`[GSearch] Site failed: ${err.message}`);
        }
      }
    }

    logger.info(`[GSearch] Total: ${leads.length} leads (start=${startIndex})`);

    if (memory) {
      if (leads.length === 0) {
        memory.exhaustCursor('google_search', location, category);
      } else {
        memory.saveCursor('google_search', location, category, { start: startIndex + 20 });
      }
    }

    const savedCookies = await context.cookies();
    return { leads, reviewers: [], cookies: savedCookies };

  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ── Local Pack extraction ─────────────────────────────────────────────────────

async function scrapeLocalPack(page, category, location) {
  const leads = [];

  try {
    // Try clicking "More places" to expand if present
    const moreBtn = page.locator('a:has-text("More places"), a:has-text("more places")').first();
    if (await moreBtn.count() > 0) {
      // Don't click — just scrape what's visible to avoid navigation
    }

    const cards = await page.locator(LOCAL_PACK.cards).all();

    for (const card of cards.slice(0, 10)) {
      try {
        const name = await _txt(card, LOCAL_PACK.name);
        if (!name || name.length < 2) continue;

        const phone   = cleanPhone(await _txt(card, LOCAL_PACK.phone));
        const address = await _txt(card, LOCAL_PACK.address);
        const ratingRaw = await _txt(card, LOCAL_PACK.rating);
        const rating  = ratingRaw.match(/[\d.]+/)?.[0] || '';

        // Try to get website link
        let website = '';
        try {
          const links = await card.locator('a[href^="http"]').all();
          for (const l of links) {
            const href = (await l.getAttribute('href') || '').trim();
            if (href && !href.includes('google') && !href.includes('maps.google')) {
              website = href;
              break;
            }
          }
        } catch {}

        leads.push({
          name,
          category,
          phone,
          email:        '',
          website,
          address,
          rating,
          review_count: '',
          hours:        '',
          source:       'Google Search',
          maps_url:     '',
          has_website:  website ? 'Yes' : 'No',
        });
      } catch {}
    }
  } catch (err) {
    logger.debug(`[GSearch] Local pack extraction failed: ${err.message}`);
  }

  return leads;
}

// ── Organic results collection ────────────────────────────────────────────────

async function collectOrganicUrls(page, limit) {
  const urls  = [];
  const seen  = new Set();

  // Skip these domains — they're directories, not business sites
  const SKIP = ['yelp.com', 'yellowpages.com', 'google.com', 'facebook.com',
                'bbb.org', 'houzz.com', 'angi.com', 'homeadvisor.com',
                'thumbtack.com', 'nextdoor.com', 'linkedin.com', 'instagram.com',
                'twitter.com', 'youtube.com', 'wikipedia.org', 'reddit.com'];

  try {
    const results = await page.locator(ORGANIC.results).all();

    for (const result of results) {
      if (urls.length >= limit) break;
      try {
        const link  = result.locator(ORGANIC.link).first();
        const title = await _txt(result, ORGANIC.title);
        if (!title || await link.count() === 0) continue;

        const href = (await link.getAttribute('href') || '').trim();
        if (!href || seen.has(href)) continue;

        const domain = new URL(href).hostname.replace('www.', '');
        if (SKIP.some(s => domain.includes(s))) continue;

        seen.add(href);
        urls.push({ url: href, title });
      } catch {}
    }
  } catch {}

  return urls;
}

// ── Visit business website and extract contact info ───────────────────────────

async function scrapeWebsite(page, url, title, category, location) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await stealth.randomDelay(500, 1000);

  const html   = await page.content();
  const parsed = parseHTML(html, url);

  const phone = parsed.phones?.[0] || '';
  const email = parsed.emails?.[0] || '';

  // Skip if we can't find any contact info — likely not a local business page
  if (!phone && !email && !parsed.address) return null;

  // Skip if the business is obviously not in the right location
  if (location && parsed.address) {
    const loc = location.toLowerCase();
    const addr = parsed.address.toLowerCase();
    const cityPart = loc.split(',')[0].trim();
    // Allow if location matches or address is missing (might be on contact page)
    if (addr && !addr.includes(cityPart) && cityPart.length > 3) {
      // Don't hard-reject — address parsing is imprecise
    }
  }

  return {
    name:         parsed.title || title || new URL(url).hostname.replace('www.', ''),
    category,
    phone,
    email,
    website:      url,
    address:      parsed.address || '',
    rating:       '',
    review_count: '',
    hours:        parsed.hours || '',
    source:       'Google Search',
    maps_url:     '',
    has_website:  'Yes',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _txt(el, selector) {
  for (const sel of selector.split(',').map(s => s.trim())) {
    try {
      const loc = el.locator(sel).first();
      if (await loc.count() > 0) {
        const t = ((await loc.textContent()) || '').trim();
        if (t) return t;
      }
    } catch {}
  }
  return '';
}

function cleanPhone(raw) {
  const match = raw.match(/[\d\s\(\)\-\+\.]{7,}/);
  return match ? match[0].trim() : '';
}

module.exports = { searchGoogle };
