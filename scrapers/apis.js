'use strict';

/**
 * Paid API Scrapers — Scrapingdog & SerpAPI
 *
 * These bypass the browser entirely. A single HTTP request returns
 * clean structured JSON from their infrastructure. Use when:
 *   - You have API credits and need maximum speed/reliability
 *   - Browser is getting blocked and proxies are exhausted
 *   - You need 10k+ requests/hour without managing infrastructure
 *
 * Benchmark (50-call test):
 *   Scrapingdog : 100% success, 3.05s avg, $0.00033/req
 *   SerpAPI     : 100% success, 3.86s avg, $0.00916/req
 *   Browser     : ~85% success, 8–20s avg, $0 (server cost only)
 */

const axios  = require('axios');
const logger = require('../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(raw = '') {
  const digits = raw.replace(/\D/g, '');
  const d = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : raw.trim();
}

function normaliseResult(raw, category, source) {
  return {
    name:         raw.title || raw.name || '',
    category,
    has_website:  (raw.website || raw.links?.website) ? 'Yes' : 'No',
    phone:        formatPhone(raw.phone || raw.phone_number || ''),
    email:        '',
    website:      raw.website || raw.links?.website || '',
    address:      raw.address || raw.full_address || '',
    rating:       String(raw.rating || raw.reviews?.rating || ''),
    review_count: String(raw.reviews?.total || raw.user_ratings_total || ''),
    hours:        raw.hours?.schedule ? JSON.stringify(raw.hours.schedule) : '',
    source,
    maps_url:     raw.place_url || raw.maps_url || `https://www.google.com/maps/place/?q=${encodeURIComponent(raw.title || '')}`,
  };
}

// ── Scrapingdog ───────────────────────────────────────────────────────────────
// Docs: https://www.scrapingdog.com/google-maps
// Free: 1,000 credits/month   Paid: from $0.00033/req

async function searchScrapingdog(options = {}) {
  const {
    location,
    category,
    apiKey,
    maxResults  = 20,
    coordinates = null,   // { lat, lng } for grid-based search
  } = options;

  if (!apiKey) {
    logger.warn('[Scrapingdog] No API key configured');
    return { leads: [], reviewers: [] };
  }

  const query = coordinates
    ? `${category} @${coordinates.lat},${coordinates.lng}`
    : `${category} in ${location}`;

  logger.info(`[Scrapingdog] Searching: "${query}"`);
  const leads = [];

  try {
    const resp = await axios.get('https://api.scrapingdog.com/google_maps', {
      params: {
        api_key: apiKey,
        query,
        type:    'search',
      },
      timeout: 30000,
    });

    const results = resp.data?.local_results || resp.data?.results || [];

    for (const item of results.slice(0, maxResults)) {
      leads.push(normaliseResult(item, category, 'Scrapingdog'));
    }

    logger.info(`[Scrapingdog] Found ${leads.length} results`);

  } catch (err) {
    logger.error(`[Scrapingdog] Error: ${err.message}`);
    if (err.response?.status === 402) {
      logger.warn('[Scrapingdog] Out of credits — switch to browser scraping');
    }
  }

  return { leads, reviewers: [] };
}

// ── SerpAPI ───────────────────────────────────────────────────────────────────
// Docs: https://serpapi.com/google-maps-api
// Free: 100 searches/month    Paid: from $0.00916/req

async function searchSerpAPI(options = {}) {
  const {
    location,
    category,
    apiKey,
    maxResults  = 20,
    coordinates = null,
    pageToken   = null,   // for pagination
  } = options;

  if (!apiKey) {
    logger.warn('[SerpAPI] No API key configured');
    return { leads: [], reviewers: [], nextPageToken: null };
  }

  const params = {
    api_key: apiKey,
    engine:  'google_maps',
    type:    'search',
    q:       `${category} in ${location}`,
    num:     Math.min(maxResults, 20),
  };

  if (coordinates) {
    params.ll = `@${coordinates.lat},${coordinates.lng},14z`;
    delete params.q;
    params.q = category;
  }

  if (pageToken) {
    params.next_page_token = pageToken;
  }

  logger.info(`[SerpAPI] Searching: "${params.q}" in "${location}"`);
  const leads = [];

  try {
    const resp = await axios.get('https://serpapi.com/search', { params, timeout: 30000 });
    const items = resp.data?.local_results || [];

    for (const item of items.slice(0, maxResults)) {
      leads.push({
        name:         item.title || '',
        category,
        has_website:  item.website ? 'Yes' : 'No',
        phone:        formatPhone(item.phone || ''),
        email:        '',
        website:      item.website || '',
        address:      item.address || '',
        rating:       String(item.rating || ''),
        review_count: String(item.reviews || ''),
        hours:        item.hours || '',
        source:       'SerpAPI',
        maps_url:     item.place_url || '',
      });
    }

    logger.info(`[SerpAPI] Found ${leads.length} results`);

    return {
      leads,
      reviewers:     [],
      nextPageToken: resp.data?.serpapi_pagination?.next_page_token || null,
    };

  } catch (err) {
    logger.error(`[SerpAPI] Error: ${err.message}`);
    if (err.response?.status === 429) {
      logger.warn('[SerpAPI] Rate limited');
    }
  }

  return { leads, reviewers: [], nextPageToken: null };
}

/**
 * Paginate through ALL SerpAPI results for a query (up to maxResults).
 * SerpAPI returns 20 per page; this loops until we hit maxResults or run out.
 */
async function searchSerpAPIAll(options = {}) {
  const { maxResults = 60, ...rest } = options;
  const allLeads = [];
  let pageToken = null;

  do {
    const { leads, nextPageToken } = await searchSerpAPI({
      ...rest,
      maxResults: Math.min(20, maxResults - allLeads.length),
      pageToken,
    });

    allLeads.push(...leads);
    pageToken = nextPageToken;

    if (allLeads.length >= maxResults || !pageToken) break;
    await new Promise(r => setTimeout(r, 500));

  } while (pageToken);

  return { leads: allLeads.slice(0, maxResults), reviewers: [] };
}

module.exports = { searchScrapingdog, searchSerpAPI, searchSerpAPIAll, normaliseResult };
