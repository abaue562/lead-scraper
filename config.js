'use strict';

require('dotenv').config();

// Parse proxy list from env
// Formats accepted (comma-separated):
//   http://user:pass@host:port
//   host:port:user:pass:region
//   { server, username, password, region }  (when loaded from JSON file)
function parseProxies(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  api: {
    port:      parseInt(process.env.PORT      || '3000',  10),
    rateLimit: parseInt(process.env.RATE_LIMIT || '200',  10),  // requests/min per IP
    timeout:   parseInt(process.env.API_TIMEOUT || '90000', 10), // ms to wait for job result
  },

  scraper: {
    headless:      process.env.HEADLESS !== 'false',
    timeout:       parseInt(process.env.SCRAPE_TIMEOUT    || '30000', 10),
    navTimeout:    parseInt(process.env.NAV_TIMEOUT        || '25000', 10),
    blockResources: process.env.BLOCK_RESOURCES !== 'false', // block images/css for speed
  },

  worker: {
    concurrency:   parseInt(process.env.WORKER_CONCURRENCY || '20', 10),
    stallInterval: parseInt(process.env.STALL_INTERVAL     || '30000', 10),
  },

  queue: {
    maxRetries:    parseInt(process.env.MAX_RETRIES        || '3', 10),
    backoffDelay:  parseInt(process.env.BACKOFF_DELAY      || '2000', 10),
    jobTimeout:    parseInt(process.env.JOB_TIMEOUT        || '120000', 10),
  },

  captcha: {
    apiKey:  process.env.CAPTCHA_API_KEY  || '',
    service: process.env.CAPTCHA_SERVICE  || '2captcha', // '2captcha' | 'anti-captcha'
  },

  proxies: parseProxies(process.env.PROXIES),

  // Optional paid API fallbacks (used only when free scraping fails repeatedly)
  apis: {
    scrapingdog: process.env.SCRAPINGDOG_API_KEY || '',
    serpapi:     process.env.SERPAPI_KEY          || '',
    scrapingbee: process.env.SCRAPINGBEE_KEY      || '',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir:   process.env.LOG_DIR   || './logs',
  },
};
