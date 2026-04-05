'use strict';

const { chromium }  = require('playwright');
const stealth       = require('../stealth');
const logger        = require('../utils/logger');
const config        = require('../config');

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  '--disable-infobars',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-translate',
  '--disable-sync',
  '--disable-background-networking',
  '--metrics-recording-only',
  '--no-report-upload',
  '--safebrowsing-disable-auto-update',
  '--window-size=1920,1080',
  '--ignore-certificate-errors',
];

class BrowserPool {
  constructor() {
    this._browser     = null;
    this._launching   = false;
    this._launchQueue = [];          // pending getBrowser() callers
    this._contextCount = 0;
    this._totalContexts = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get the shared browser instance, launching it if necessary.
   * Thread-safe: multiple simultaneous callers get the same instance.
   */
  async getBrowser() {
    if (this._browser?.isConnected()) return this._browser;

    if (this._launching) {
      // Queue up — wait for the in-progress launch
      return new Promise((resolve, reject) => {
        this._launchQueue.push({ resolve, reject });
      });
    }

    this._launching = true;
    try {
      this._browser = await this._launch();
      this._launchQueue.forEach(w => w.resolve(this._browser));
      return this._browser;
    } catch (err) {
      this._launchQueue.forEach(w => w.reject(err));
      throw err;
    } finally {
      this._launching = false;
      this._launchQueue = [];
    }
  }

  /**
   * Create a new isolated browser context for a single scrape job.
   * Each context has its own cookies, cache, and network settings.
   *
   * @param {object} opts
   *   proxy    – { server, username, password }
   *   cookies  – array of cookie objects to pre-load
   *   cfg      – stealth config (userAgent, viewport, timezoneId, locale)
   */
  async createContext(opts = {}) {
    const browser = await this.getBrowser();
    const { proxy, cookies, cfg } = opts;
    const stealthCfg = cfg || stealth.getConfig();

    const ctxOpts = {
      userAgent:          stealthCfg.userAgent,
      viewport:           stealthCfg.viewport,
      locale:             stealthCfg.locale || 'en-US',
      timezoneId:         stealthCfg.timezoneId || 'America/New_York',
      ignoreHTTPSErrors:  true,
      javaScriptEnabled:  true,
      // Mimic real screen
      screen: {
        width:  stealthCfg.viewport.width,
        height: stealthCfg.viewport.height,
      },
      colorScheme: 'light',
    };

    if (proxy?.server) {
      ctxOpts.proxy = {
        server:   proxy.server,
        username: proxy.username,
        password: proxy.password,
      };
    }

    const context = await browser.newContext(ctxOpts);

    // Inject stealth scripts into every page opened in this context
    await stealth.applyToContext(context);

    // Restore saved cookies
    if (cookies?.length) {
      await context.addCookies(cookies).catch(() => {});
    }

    this._contextCount++;
    this._totalContexts++;

    // Auto-cleanup on close
    context.on('close', () => { this._contextCount--; });

    return context;
  }

  /** Gracefully close the shared browser. */
  async close() {
    if (this._browser) {
      await this._browser.close().catch(() => {});
      this._browser = null;
    }
  }

  get stats() {
    return {
      connected:     this._browser?.isConnected() ?? false,
      activeContexts: this._contextCount,
      totalContexts:  this._totalContexts,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  async _launch() {
    logger.info('Launching Chromium browser...');
    const browser = await chromium.launch({
      headless: config.scraper.headless,
      args:     BROWSER_ARGS,
      ignoreHTTPSErrors: true,
    });

    browser.on('disconnected', () => {
      logger.warn('Browser disconnected — will relaunch on next request');
      this._browser = null;
    });

    logger.info('Browser ready');
    return browser;
  }
}

// One pool per worker process
module.exports = new BrowserPool();
