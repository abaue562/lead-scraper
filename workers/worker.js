'use strict';

require('dotenv').config();

const { Worker }              = require('bullmq');
const pLimit                  = require('p-limit').default ?? require('p-limit');
const { processJob, flushMemory } = require('../queue/processor');
const { getConnection }       = require('../queue');
const browserPool             = require('../core/browser');
const logger                  = require('../utils/logger');
const config                  = require('../config');

// ── Per-worker concurrency control ───────────────────────────────────────────
const concurrency = config.worker.concurrency;
const limit       = pLimit(concurrency);

// ── Error classification ──────────────────────────────────────────────────────

const HARD_ERRORS = [
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_CLOSED',
  'NOT_FOUND',
  'net::ERR_ABORTED',
];

const PROXY_ERRORS = [
  'RATE_LIMITED',
  'FORBIDDEN',
  'TIMEOUT',
  'net::ERR_PROXY',
  'ECONNREFUSED',
];

function isHardFailure(msg)  { return HARD_ERRORS.some(e => msg.includes(e));  }
function needsProxyRotation(msg) { return PROXY_ERRORS.some(e => msg.includes(e)); }

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookies(url) {
  try {
    const domain = new URL(url).hostname;
    return cookieJar.get(domain) || null;
  } catch { return null; }
}

function saveCookies(url, cookies) {
  if (!cookies?.length) return;
  try {
    const domain = new URL(url).hostname;
    cookieJar.set(domain, cookies);
  } catch {}
}

// ── Smart scraper — one job, up to N retries ─────────────────────────────────

async function smartScrape(jobData, job) {
  const { url, query, region } = jobData;
  const targetUrl = url || buildMapsUrl(query);

  metrics.incrementActive();

  let   proxy     = proxyManager.hasProxies ? proxyManager.getProxy(region) : null;
  let   lastError = null;
  const maxTries  = config.queue.maxRetries + 1;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    await job.updateProgress(Math.round((attempt / maxTries) * 80));

    logger.info(`[Job ${job.id}] Attempt ${attempt}/${maxTries} → ${targetUrl}`);

    try {
      const savedCookies = getCookies(targetUrl);

      const result = await scrapeWithBrowser(targetUrl, {
        proxy,
        cookies: savedCookies,
        waitUntil: 'domcontentloaded',
        timeout:   config.scraper.timeout,
        actions:   async (page) => {
          // Light human simulation
          await stealth.randomDelay(300, 800);
          await stealth.humanMouseMove(page);
        },
      });

      // Persist cookies
      saveCookies(targetUrl, result.cookies);

      // CAPTCHA check
      const cap = detectCaptcha(result.html);
      if (cap.detected) {
        logger.warn(`[Job ${job.id}] CAPTCHA: ${cap.type}`);

        if (cap.siteKey && captchaSolver.isConfigured) {
          // Attempt to solve inline (not implemented for full browser flow here,
          // but token is returned and can be used on next retry)
          const token = await captchaSolver.solveRecaptchaV2(cap.siteKey, targetUrl);
          if (token) {
            logger.info(`[Job ${job.id}] CAPTCHA solved, retrying`);
          }
        }

        // Always rotate proxy after CAPTCHA
        if (proxy) proxyManager.markFailure(proxy);
        proxy = proxyManager.hasProxies ? proxyManager.getProxy(region) : null;

        // Backoff before retry
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }

      // Parse HTML
      const parsed = parseHTML(result.html, result.url);

      if (proxy) proxyManager.markSuccess(proxy);
      await job.updateProgress(100);
      metrics.decrementActive();

      return buildResponse({
        query:   query || targetUrl,
        url:     result.url,
        parsed,
        attempts: attempt,
        elapsed:  result.elapsed,
      });

    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      logger.warn(`[Job ${job.id}] Attempt ${attempt} failed: ${msg}`);

      if (isHardFailure(msg)) {
        logger.error(`[Job ${job.id}] Hard failure — aborting`);
        break;
      }

      if (proxy) proxyManager.markFailure(proxy);

      if (needsProxyRotation(msg) || attempt < maxTries) {
        proxy = proxyManager.hasProxies ? proxyManager.getProxy(region) : null;
      }

      // Exponential backoff: 2s, 4s, 8s…
      const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }

  metrics.decrementActive();
  throw lastError || new Error('All retry attempts exhausted');
}

// ── Response builder ──────────────────────────────────────────────────────────

function buildResponse({ query, url, parsed, attempts, elapsed }) {
  return {
    query,
    url,
    results: [{
      title:       parsed.title,
      description: parsed.description,
      emails:      parsed.emails,
      phones:      parsed.phones,
      address:     parsed.address,
      hours:       parsed.hours,
      socialLinks: parsed.socialLinks,
      rating:      parsed.rating,
      reviewCount: parsed.reviewCount,
      links:       parsed.links?.slice(0, 15),
      headings:    parsed.headings,
    }],
    source:   'browser',
    success:  true,
    attempts,
    elapsed,
    timestamp: new Date().toISOString(),
  };
}

function buildMapsUrl(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;
}

// ── Worker bootstrap ──────────────────────────────────────────────────────────

async function start() {
  logger.info(`Starting worker — concurrency: ${concurrency}`);

  // Warm up browser before accepting jobs
  await browserPool.getBrowser();
  logger.info('Browser warm-up complete');

  const worker = new Worker(
    'scrape',
    (job) => limit(() => processJob(job.data, job)),
    {
      connection:    getConnection(),
      concurrency,
      stalledInterval: config.worker.stallInterval,
      maxStalledCount: 2,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`[Job ${job.id}] ✓ Completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Job ${job?.id}] ✗ Failed: ${err.message}`);
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[Job ${jobId}] Stalled — will be retried`);
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — draining worker...`);
    await worker.close();
    await browserPool.close();
    flushMemory();   // persist cursor/cell state before exit
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  logger.info('Worker ready — consuming jobs from queue');
  return worker;
}

// Log browser pool stats every minute
setInterval(() => {
  const stats = browserPool.stats;
  logger.debug('Browser pool stats', stats);
}, 60000);

start().catch(err => {
  logger.error(`Worker failed to start: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
