'use strict';

const browserPool = require('./browser');
const stealth     = require('../stealth');
const logger      = require('../utils/logger');
const metrics     = require('../utils/metrics');
const config      = require('../config');

// Resource types to block for speed (saves ~60% of bandwidth)
const BLOCKED_TYPES = new Set([
  'image', 'stylesheet', 'font', 'media',
  'imageset', 'texttrack', 'object', 'beacon',
]);

// Domains that can be blocked entirely (telemetry, ads)
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'fbcdn.net', 'twitter.com', 'ads.', 'analytics.',
  'hotjar.com', 'intercom.io', 'zopim.com', 'livechat',
];

function shouldBlock(url, resourceType) {
  if (BLOCKED_TYPES.has(resourceType)) return true;
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) return true;
  return false;
}

/**
 * Core scrape function.
 *
 * @param {string} url            - Target URL
 * @param {object} options
 *   proxy     – proxy config object { server, username, password }
 *   cookies   – array of cookies to pre-load
 *   waitUntil – Playwright wait strategy (default: 'domcontentloaded')
 *   timeout   – navigation timeout ms
 *   actions   – async fn(page) for post-load interactions (scroll, click etc)
 *   screenshot – capture screenshot on success (for debugging)
 *
 * @returns {{ html, url, status, cookies, elapsed, screenshot }}
 */
async function scrapeWithBrowser(url, options = {}) {
  const {
    proxy      = null,
    cookies    = null,
    waitUntil  = 'domcontentloaded',
    timeout    = config.scraper.timeout,
    actions    = null,
    screenshot = false,
    blockResources = config.scraper.blockResources,
  } = options;

  const cfg       = stealth.getConfig();   // fresh random config per request
  const startTime = Date.now();
  let   context   = null;
  let   page      = null;

  try {
    context = await browserPool.createContext({ proxy, cookies, cfg });
    page    = await context.newPage();

    // Apply page-level stealth
    await stealth.applyToPage(page);

    // Resource blocking (performance optimisation)
    if (blockResources) {
      await page.route('**/*', route => {
        const req = route.request();
        if (shouldBlock(req.url(), req.resourceType())) {
          return route.abort();
        }
        return route.continue();
      });
    }

    // Navigate
    const response = await page.goto(url, {
      waitUntil,
      timeout,
    });

    const status = response?.status() ?? 0;

    // Hard HTTP errors
    if (status === 429) throw new Error('RATE_LIMITED');
    if (status === 403) throw new Error('FORBIDDEN');
    if (status === 404) throw new Error('NOT_FOUND');

    // Small random delay — looks more human
    await stealth.randomDelay(300, 1200);

    // Optional post-load actions (scroll, click "load more" etc.)
    if (typeof actions === 'function') {
      await actions(page);
    }

    const html      = await page.content();
    const finalUrl  = page.url();
    const elapsed   = Date.now() - startTime;

    // Persist cookies for domain reuse
    const savedCookies = await context.cookies();

    let screenshotData = null;
    if (screenshot) {
      screenshotData = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
    }

    metrics.recordSuccess(elapsed, 'playwright');
    logger.debug(`Scraped ${url} → ${status} (${elapsed}ms)`);

    return {
      html,
      url:        finalUrl,
      status,
      cookies:    savedCookies,
      elapsed,
      screenshot: screenshotData,
    };

  } catch (err) {
    const elapsed = Date.now() - startTime;
    metrics.recordFailure(err.message);
    logger.debug(`Scrape failed [${elapsed}ms] ${url}: ${err.message}`);
    throw err;

  } finally {
    if (page)    await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

module.exports = { scrapeWithBrowser };
