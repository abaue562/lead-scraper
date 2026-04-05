'use strict';

const browserPool = require('../core/browser');
const stealth     = require('../stealth');
const { parseHTML } = require('../parser');
const logger      = require('../utils/logger');

/**
 * Yellow Pages Scraper
 * Scrapes yellowpages.com search results via our stealth browser.
 * No API key required.
 */
async function searchYellowPages(options = {}) {
  const {
    location,
    category,
    maxResults = 20,
    proxy      = null,
    cookies    = null,
    memory     = null,   // ScrapeMemory instance for cursor tracking
  } = options;

  const sq     = encodeURIComponent(category);
  const lq     = encodeURIComponent(location);
  const cursor  = memory?.getCursor('yellowpages', location, category);
  const pageNum = cursor?.page || 1;
  const url     = `https://www.yellowpages.com/search?search_terms=${sq}&geo_location_terms=${lq}&page=${pageNum}`;

  const cfg     = stealth.getConfig();
  const context = await browserPool.createContext({ proxy, cookies, cfg });
  const page    = await context.newPage();
  const leads   = [];

  try {
    await stealth.applyToPage(page);
    await page.route('**/*', route => {
      const t = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(t)) return route.abort();
      return route.continue();
    });

    logger.info(`[YP] Searching: "${category}" in "${location}"`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stealth.randomDelay(1500, 2500);

    const html = await page.content();
    const parsed = parseHTML(html, url);

    // Extract structured listings from YP's result cards
    const cards = await page.locator('.result.srp-listing').all();
    const toProcess = cards.slice(0, maxResults);

    for (const card of toProcess) {
      try {
        const name    = await _txt(card, '.business-name span, .business-name a');
        if (!name) continue;

        const phone   = await _txt(card, '.phones.phone, .phone');
        const street  = await _txt(card, '.street-address');
        const city    = await _txt(card, '.locality');
        const address = [street, city].filter(Boolean).join(', ');
        const website = await _href(card, 'a.track-visit-website');
        const cats    = await _txt(card, '.categories a');

        leads.push({
          name,
          category,
          business_type: cats,
          phone,
          email:        '',
          website,
          address,
          rating:       '',
          review_count: '',
          hours:        '',
          source:       'Yellow Pages',
          maps_url:     '',
        });
      } catch {}
    }

    // If structured extraction yielded nothing, fall back to parser
    if (leads.length === 0 && parsed.links?.length > 0) {
      logger.warn('[YP] Structured extraction failed — check selectors');
    }

    logger.info(`[YP] Found ${leads.length} results (page ${pageNum})`);

    if (memory) {
      if (leads.length === 0) {
        memory.exhaustCursor('yellowpages', location, category);
      } else {
        memory.saveCursor('yellowpages', location, category, { page: pageNum + 1 });
      }
    }

    return { leads, cookies: await context.cookies() };

  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function _txt(el, selector) {
  try {
    const loc = el.locator(selector).first();
    if (await loc.count() > 0) return ((await loc.textContent()) || '').trim();
  } catch {}
  return '';
}

async function _href(el, selector) {
  try {
    const loc = el.locator(selector).first();
    if (await loc.count() > 0) return ((await loc.getAttribute('href')) || '').trim();
  } catch {}
  return '';
}

module.exports = { searchYellowPages };
