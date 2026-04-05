'use strict';

const browserPool = require('../core/browser');
const stealth     = require('../stealth');
const logger      = require('../utils/logger');

/**
 * Yelp Scraper — browser-based, no API key needed.
 * Uses stealth layer to avoid bot detection.
 */

const YELP_CATEGORY_MAP = {
  'dentist':           'dentists',
  'plumber':           'plumbing',
  'nail salon':        'nailetech',
  'electrician':       'electricians',
  'restaurant':        'restaurants',
  'HVAC contractor':   'hvac',
  'roofing contractor':'roofing',
  'landscaping':       'landscaping',
  'auto repair':       'autorepair',
  'hair salon':        'salons',
  'real estate agent': 'realestateagents',
  'gym':               'gyms',
  'cleaning service':  'homecleaning',
  'pest control':      'pestcontrol',
  'attorney':          'lawyers',
  'accountant':        'accountants',
  'veterinarian':      'veterinarians',
  'mechanic':          'auto',
  'coffee shop':       'coffee',
  'bakery':            'bakeries',
  'florist':           'florists',
  'moving company':    'movers',
  'massage therapist': 'massage',
  'yoga studio':       'yoga',
};

async function searchYelp(options = {}) {
  const {
    location,
    category,
    maxResults = 20,
    proxy      = null,
    cookies    = null,
    memory     = null,   // ScrapeMemory instance for cursor tracking
  } = options;

  const term   = YELP_CATEGORY_MAP[category?.toLowerCase()] || category;
  const cursor = memory?.getCursor('yelp', location, category);
  const offset = cursor?.offset || 0;
  const url    = `https://www.yelp.com/search?find_desc=${encodeURIComponent(term)}&find_loc=${encodeURIComponent(location)}&start=${offset}`;

  const cfg     = stealth.getConfig();
  const context = await browserPool.createContext({ proxy, cookies, cfg });
  const page    = await context.newPage();
  const leads   = [];

  try {
    await stealth.applyToPage(page);
    await page.route('**/*', route => {
      const t   = route.request().resourceType();
      const url = route.request().url();
      if (['image', 'stylesheet', 'font', 'media'].includes(t)) return route.abort();
      if (url.includes('pixel') || url.includes('analytics')) return route.abort();
      return route.continue();
    });

    logger.info(`[Yelp] Searching: "${term}" near "${location}"`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await stealth.randomDelay(2000, 3500);

    // Check for CAPTCHA / block
    const content = await page.content();
    if (content.includes('Access to this page has been denied') || content.includes('Are you human')) {
      logger.warn('[Yelp] Blocked — rotating proxy on next attempt');
      return { leads: [], cookies: [] };
    }

    // Extract business cards
    // Yelp uses React, so we wait for dynamic content
    await page.waitForSelector('[data-testid="serp-ia-card"], .businessName, .css-1m051bw', {
      timeout: 10000,
    }).catch(() => {});

    const cardSelectors = [
      '[data-testid="serp-ia-card"]',
      '.businessName',
      'h3.y-css-hgpxpq',
      '.css-1m051bw',
    ];

    for (const sel of cardSelectors) {
      const cards = await page.locator(sel).all();
      if (cards.length > 0) {
        logger.debug(`[Yelp] Found ${cards.length} cards with selector: ${sel}`);
        for (const card of cards.slice(0, maxResults)) {
          try {
            const lead = await extractYelpCard(card, category);
            if (lead) leads.push(lead);
          } catch {}
        }
        break;
      }
    }

    // If card extraction failed, try JSON-LD structured data
    if (leads.length === 0) {
      const jsonLdLeads = await extractJsonLd(page, category, maxResults);
      leads.push(...jsonLdLeads);
    }

    logger.info(`[Yelp] Found ${leads.length} results (offset was ${offset})`);

    if (memory) {
      if (leads.length === 0) {
        // No results at this offset — source is exhausted
        memory.exhaustCursor('yelp', location, category);
      } else {
        // Advance cursor to next page for future runs
        memory.saveCursor('yelp', location, category, { offset: offset + maxResults });
      }
    }

    return { leads, cookies: await context.cookies() };

  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function extractYelpCard(card, category) {
  const name = await _txt(card, 'a.businessName, h3 a, .css-1422juy a');
  if (!name) return null;

  const phone   = await _txt(card, 'p.phone, [class*="phone" i]');
  const address = await _txt(card, 'address, [class*="address" i], .css-e81eai');
  const rating  = await _attr(card, '[aria-label*="star" i]', 'aria-label').then(a => {
    const m = (a || '').match(/([\d.]+)/);
    return m ? m[1] : '';
  });
  const reviewCount = await _txt(card, '[class*="reviewCount" i], .css-chan6m');
  const href    = await _attr(card, 'a.businessName, h3 a', 'href');
  const website = href ? `https://www.yelp.com${href}` : '';

  return {
    name,
    category,
    phone,
    email:        '',
    website,
    address,
    rating:       rating.replace(/\s*stars?/i, ''),
    review_count: reviewCount.replace(/[^\d]/g, ''),
    source:       'Yelp',
    maps_url:     '',
  };
}

async function extractJsonLd(page, category, max) {
  try {
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    const leads = [];
    for (const script of scripts) {
      try {
        const json = JSON.parse((await script.textContent() || '').trim());
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (!item['@type'] || !item.name) continue;
          leads.push({
            name:         item.name,
            category,
            phone:        item.telephone || '',
            email:        item.email || '',
            website:      item.url || '',
            address:      formatSchemaAddress(item.address),
            rating:       item.aggregateRating?.ratingValue?.toString() || '',
            review_count: item.aggregateRating?.reviewCount?.toString() || '',
            source:       'Yelp',
            maps_url:     '',
          });
          if (leads.length >= max) break;
        }
      } catch {}
    }
    return leads;
  } catch {
    return [];
  }
}

function formatSchemaAddress(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  return [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
  ].filter(Boolean).join(', ');
}

async function _txt(el, selector) {
  try {
    const loc = el.locator(selector).first();
    if (await loc.count() > 0) return ((await loc.textContent()) || '').trim();
  } catch {}
  return '';
}

async function _attr(el, selector, attribute) {
  try {
    const loc = el.locator(selector).first();
    if (await loc.count() > 0) return ((await loc.getAttribute(attribute)) || '').trim();
  } catch {}
  return '';
}

module.exports = { searchYelp };
