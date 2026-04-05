'use strict';

/**
 * Smart Job Processor / Dispatcher
 *
 * Routes each job to the correct scraper based on job type.
 * Handles the full cycle: scrape → parse → enrich → return result.
 *
 * Job types:
 *   google_maps  → scrapers/googleMaps.js   (preferred, richest data)
 *   yellow_pages → scrapers/yellowPages.js
 *   yelp         → scrapers/yelp.js
 *   url          → core/scraper.js + parser (generic URL scrape)
 *   leads        → multi-source lead sweep (all 3 sources, merged)
 */

const { searchGoogleMaps }              = require('../scrapers/googleMaps');
const { searchGoogle }                  = require('../scrapers/googleSearch');
const { searchScrapingdog, searchSerpAPIAll } = require('../scrapers/apis');
const { searchYellowPages } = require('../scrapers/yellowPages');
const { searchYelp }        = require('../scrapers/yelp');
const { scrapeWithBrowser } = require('../core/scraper');
const { parseHTML }         = require('../parser');
const { detectCaptcha }     = require('../captcha');
const ProxyManager          = require('../proxy');
const ScrapeMemory          = require('../core/scrape_memory');
const logger                = require('../utils/logger');
const config                = require('../config');
const metrics               = require('../utils/metrics');

const proxyManager = new ProxyManager(config.proxies);

// Shared memory instance — loaded once, used across all jobs in this worker process
const { getConnection } = require('../queue');
const STALE_DAYS  = parseInt(process.env.STALE_DAYS || '45', 10);
const scrapeMemory = new ScrapeMemory(getConnection(), { staleDays: STALE_DAYS });
scrapeMemory.load();
logger.info(`[Processor] ScrapeMemory loaded — staleDays:${STALE_DAYS}`);

// Cookie jar shared across jobs (domain → cookies[])
const cookieJar = new Map();

function getCookies(url) {
  try { return cookieJar.get(new URL(url).hostname) || null; } catch { return null; }
}
function saveCookies(url, cookies) {
  if (!cookies?.length) return;
  try { cookieJar.set(new URL(url).hostname, cookies); } catch {}
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Process one job from the queue.
 * Called by the worker for every dequeued job.
 *
 * @param {object} jobData
 * @param {object} job     - BullMQ job object (for progress updates)
 */
async function processJob(jobData, job) {
  const {
    type       = 'google_maps',   // job type
    query,
    url,
    location,
    category,
    region,
    maxResults  = 20,
    maxReviews  = 0,
    coordinates = null,
    cell        = null,
  } = jobData;

  const proxy = proxyManager.hasProxies ? proxyManager.getProxy(region) : null;

  await job?.updateProgress(10);
  metrics.incrementActive();

  const start = Date.now();

  // ── Memory check: reload state from disk so we always have latest ────────────
  scrapeMemory.load();

  // Memory is used for dedup only (filterNewUrls via Redis) — never block re-scans.
  // Each scan scrolls Maps further and skips already-visited URLs, adding new leads.

  try {
    let result;

    switch (type) {
      case 'google_maps':
        result = await dispatchGoogleMaps({ location, category, maxResults, maxReviews, proxy, coordinates, memory: scrapeMemory, cell, job });
        break;

      case 'google_search':
        result = await dispatchGoogleSearch({ location, category, maxResults, proxy, memory: scrapeMemory });
        break;

      case 'yellow_pages':
        result = await dispatchYellowPages({ location, category, maxResults, proxy, memory: scrapeMemory });
        break;

      case 'yelp':
        result = await dispatchYelp({ location, category, maxResults, proxy, memory: scrapeMemory });
        break;

      case 'scrapingdog':
        result = await dispatchScrapingdog({ location, category, maxResults, proxy, coordinates });
        break;

      case 'serpapi':
        result = await dispatchSerpAPI({ location, category, maxResults, coordinates });
        break;

      case 'leads':
        // Multi-source sweep — fires all scrapers and merges
        result = await dispatchMultiSource({ location, category, maxResults, maxReviews, proxy, memory: scrapeMemory, cell, job });
        break;

      case 'url':
      default:
        result = await dispatchUrl({ url: url || query, proxy });
        break;
    }

    await job?.updateProgress(100);
    metrics.decrementActive();
    metrics.recordSuccess(Date.now() - start, type);

    if (proxy) proxyManager.markSuccess(proxy);
    if (result.cookies) saveCookies(url || location || '', result.cookies);

    // ── Record in memory — always save, even on 0 results (captures cursor exhaustion) ──
    if (location && category) {
      const count = result.leads?.length || 0;
      if (jobData.cell?.key) {
        scrapeMemory.recordCell(location, category, jobData.cell.key, { resultCount: count });
      } else if (count > 0) {
        scrapeMemory.recordCombo(location, category, { resultCount: count, jobId: job?.id });
      }
      scrapeMemory.save();   // always flush — captures cursor exhaustion from 0-result jobs
    }

    return {
      ...result,
      success:   true,
      type,
      elapsed:   Date.now() - start,
      timestamp: new Date().toISOString(),
    };

  } catch (err) {
    metrics.decrementActive();
    metrics.recordFailure(err.message);
    if (proxy) proxyManager.markFailure(proxy);
    throw err;
  }
}

// ── Source dispatchers ────────────────────────────────────────────────────────

async function dispatchGoogleMaps({ location, category, maxResults, maxReviews, proxy, memory, cell, job }) {
  if (!location || !category) throw new Error('location and category required for google_maps job');

  const { leads, reviewers, cookies } = await searchGoogleMaps({
    location,
    category,
    maxResults,
    maxReviews,
    proxy,
    cookies: getCookies('https://www.google.com'),
    memory,
    cell,
    job,
  });

  return {
    query:     `${category} in ${location}`,
    source:    'google_maps',
    leads:     normaliseLeads(leads, location),
    reviewers: normaliseReviewers(reviewers),
    cookies,
  };
}

async function dispatchGoogleSearch({ location, category, maxResults, proxy, memory }) {
  if (!location || !category) throw new Error('location and category required for google_search job');
  const { leads, cookies } = await searchGoogle({
    location, category, maxResults, proxy, memory,
    cookies: getCookies('https://www.google.com'),
  });
  return {
    query:     `${category} in ${location}`,
    source:    'google_search',
    leads:     normaliseLeads(leads, location),
    reviewers: [],
    cookies,
  };
}

async function dispatchYellowPages({ location, category, maxResults, proxy, memory }) {
  if (!location || !category) throw new Error('location and category required for yellow_pages job');

  const { leads, cookies } = await searchYellowPages({
    location, category, maxResults, proxy, memory,
    cookies: getCookies('https://www.yellowpages.com'),
  });

  return {
    query:  `${category} in ${location}`,
    source: 'yellow_pages',
    leads:  normaliseLeads(leads, location),
    reviewers: [],
    cookies,
  };
}

async function dispatchYelp({ location, category, maxResults, proxy, memory }) {
  if (!location || !category) throw new Error('location and category required for yelp job');

  const { leads, cookies } = await searchYelp({
    location, category, maxResults, proxy, memory,
    cookies: getCookies('https://www.yelp.com'),
  });

  return {
    query:  `${category} in ${location}`,
    source: 'yelp',
    leads:  normaliseLeads(leads, location),
    reviewers: [],
    cookies,
  };
}

async function dispatchScrapingdog({ location, category, maxResults, proxy, coordinates }) {
  if (!config.apis.scrapingdog) throw new Error('SCRAPINGDOG_API_KEY not configured');
  const { leads, cookies } = await searchScrapingdog({
    location, category, apiKey: config.apis.scrapingdog, maxResults, coordinates,
  });
  return {
    query:  `${category} in ${location}`,
    source: 'scrapingdog',
    leads:  normaliseLeads(leads, location),
    reviewers: [],
    cookies,
  };
}

async function dispatchSerpAPI({ location, category, maxResults, coordinates }) {
  if (!config.apis.serpapi) throw new Error('SERPAPI_KEY not configured');
  const { leads } = await searchSerpAPIAll({
    location, category, apiKey: config.apis.serpapi, maxResults, coordinates,
  });
  return {
    query:  `${category} in ${location}`,
    source: 'serpapi',
    leads:  normaliseLeads(leads, location),
    reviewers: [],
    cookies: null,
  };
}

async function dispatchMultiSource({ location, category, maxResults, maxReviews, proxy, memory, cell, job }) {
  logger.info(`[Dispatcher] Multi-source sweep: "${category}" in "${location}"`);

  // Run all sources concurrently — each gets full maxResults, dedup handles overlaps
  const [gmaps, gsearch, yp, yelp] = await Promise.allSettled([
    dispatchGoogleMaps({ location, category, maxResults, maxReviews, proxy, memory, cell, job }),
    dispatchGoogleSearch({ location, category, maxResults, proxy, memory }),
    dispatchYellowPages({ location, category, maxResults, proxy, memory }),
    dispatchYelp({ location, category, maxResults, proxy, memory }),
  ]);

  const allLeads     = [];
  const allReviewers = [];

  for (const r of [gmaps, gsearch, yp, yelp]) {
    if (r.status === 'fulfilled') {
      allLeads.push(...(r.value.leads || []));
      allReviewers.push(...(r.value.reviewers || []));
    } else {
      logger.warn(`[Dispatcher] Source failed: ${r.reason?.message}`);
    }
  }

  // Deduplicate by phone + name
  const deduped = deduplicateLeads(allLeads, location);

  return {
    query:     `${category} in ${location}`,
    source:    'multi_source',
    leads:     deduped,
    reviewers: deduplicateReviewers(allReviewers),
    cookies:   null,
  };
}

async function dispatchUrl({ url, proxy }) {
  if (!url) throw new Error('url required for url job');

  const result = await scrapeWithBrowser(url, {
    proxy,
    cookies:   getCookies(url),
    waitUntil: 'domcontentloaded',
    timeout:   config.scraper.timeout,
  });

  const cap = detectCaptcha(result.html);
  if (cap.detected) throw new Error(`CAPTCHA_DETECTED:${cap.type}`);

  const parsed = parseHTML(result.html, result.url);
  saveCookies(url, result.cookies);

  return {
    query:     url,
    url:       result.url,
    source:    'browser',
    leads: [{
      name:        parsed.title,
      phone:       parsed.phones?.[0] || '',
      email:       parsed.emails?.[0] || '',
      website:     result.url,
      address:     parsed.address,
      hours:       parsed.hours,
      socialLinks: parsed.socialLinks,
      rating:      parsed.rating,
      review_count: parsed.reviewCount,
      has_website:  'Yes',
    }],
    reviewers:  [],
    cookies:    result.cookies,
    parsed,                     // full parsed data also available
  };
}

// ── Country / province filtering ──────────────────────────────────────────────

// Canadian province codes we're targeting
const CA_PROVINCES = new Set(['BC','AB','ON','QC','MB','SK','NS','NB','NL','PE','YT','NT','NU']);

// US state abbreviations — used to detect cross-border bleed
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

/**
 * Given an address string, return the 2-letter state/province code if detectable.
 * Handles: "123 Main, Vancouver, BC V5K 1A1, Canada"  → "BC"
 *          "456 Elm, Blaine, WA 98230, USA"           → "WA"
 */
function addressRegion(address = '') {
  // Match ", XX " or ", XX," patterns (2 uppercase letters = province/state)
  const matches = address.match(/,\s*([A-Z]{2})[\s,]/g) || [];
  for (const m of matches) {
    const code = m.replace(/[,\s]/g, '');
    if (CA_PROVINCES.has(code) || US_STATES.has(code)) return code;
  }
  // Also try end of string: "... BC V5K 1A1"
  const end = address.match(/\b([A-Z]{2})\b/g) || [];
  for (const code of end.reverse()) {
    if (CA_PROVINCES.has(code) || US_STATES.has(code)) return code;
  }
  return null;
}


// ── Normalisation ─────────────────────────────────────────────────────────────

// Strip non-English/locale garbage from hours strings and shorten to first 120 chars
function cleanHours(h) {
  if (!h) return '';
  // Remove unicode private-use chars (e.g. \ue14d separators Google injects)
  h = h.replace(/[\ue000-\uf8ff]/g, ' ');
  // Remove "Suggest new hours" / locale variants
  h = h.replace(/suggest new hours/gi, '').replace(/neue öffnungszeiten vorschlagen/gi, '').trim();
  // Trim to reasonable length
  return h.slice(0, 150).trim();
}

function normaliseLeads(leads = [], location = '') {
  void location; // kept for signature compatibility — country tagging uses addressRegion directly
  return leads.map(l => {
    const region  = addressRegion(l.address || '');
    const country = US_STATES.has(region) ? 'US' : CA_PROVINCES.has(region) ? 'CA' : '';
    return {
      name:         l.name         || '',
      category:     l.category     || '',
      has_website:  l.website ? 'Yes' : 'No',
      phone:        l.phone        || '',
      email:        l.email        || '',
      website:      l.website      || '',
      address:      l.address      || '',
      rating:       l.rating       || '',
      review_count: l.review_count || '',
      hours:        cleanHours(l.hours || ''),
      source:       l.source       || 'unknown',
      maps_url:     l.maps_url     || '',
      country,                        // 'CA', 'US', or '' — used by dashboard country toggle
    };
  });
}

function normaliseReviewers(reviewers = []) {
  return reviewers.map(r => ({
    reviewer_name:          r.reviewer_name          || '',
    reviewer_profile_url:   r.reviewer_profile_url   || '',
    reviewer_review_count:  r.reviewer_review_count  || 0,
    is_local_guide:         r.is_local_guide          || 'No',
    local_guide_level:      r.local_guide_level       || '',
    rating_given:           r.rating_given            || '',
    review_text:            r.review_text             || '',
    review_date:            r.review_date             || '',
    business_name:          r.business_name           || '',
    business_category:      r.business_category       || '',
    business_address:       r.business_address        || '',
  }));
}

function deduplicateLeads(leads, location = '') {
  const seen = new Map();
  for (const lead of leads) {
    const digits = (lead.phone || '').replace(/\D/g, '');
    const key    = digits.length >= 7 ? digits : lead.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, lead);
    } else {
      // Merge — fill in missing fields
      const ex = seen.get(key);
      for (const f of ['phone', 'email', 'website', 'address', 'hours', 'rating']) {
        if (!ex[f] && lead[f]) ex[f] = lead[f];
      }
    }
  }
  return normaliseLeads([...seen.values()], location);
}

function deduplicateReviewers(reviewers) {
  const seen = new Set();
  return reviewers.filter(r => {
    const key = `${r.reviewer_name}|${r.business_name}|${r.review_date}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Called by worker on SIGINT/SIGTERM to flush any in-memory cursor/cell state to disk
function flushMemory() {
  scrapeMemory.save();
}

module.exports = { processJob, flushMemory };
