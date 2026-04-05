'use strict';

/**
 * CAPTCHA Module — Full Fallback Chain
 *
 * Solve order (cheapest first, paid last):
 *
 *   1. playwright-extra-stealth  — prevents ~80% of triggers entirely ($0)
 *   2. FlareSolverr              — Cloudflare JS challenges ($0, local Docker)
 *   3. Audio bypass              — reCAPTCHA v2 audio + Whisper STT ($0)
 *   4. NopeCHA                   — open-source API, 10k free/month ($0)
 *   5. Paid service              — 2captcha / anticaptcha / capsolver / dbc (last resort)
 *
 * Open-source tools:
 *   FlareSolverr    : github.com/FlareSolverr/FlareSolverr
 *   openai-whisper  : github.com/openai/whisper
 *   faster-whisper  : github.com/SYSTRAN/faster-whisper
 *   playwright-extra: github.com/berstend/puppeteer-extra
 *   NopeCHA         : github.com/NopeCHA/NopeCHA
 */

const axios   = require('axios');
const logger  = require('../utils/logger');
const metrics = require('../utils/metrics');

const { solveAudioCaptcha, hasWhisper } = require('./audio');
const { FlareSolverrClient }            = require('./flaresolverr');
const { NopeCHAClient }                 = require('./nopecha');

// ── Detection ─────────────────────────────────────────────────────────────────

const PATTERNS = [
  { re: /id=["']?g-recaptcha/i,           type: 'recaptcha-v2'  },
  { re: /class=["'][^"']*g-recaptcha/i,   type: 'recaptcha-v2'  },
  { re: /grecaptcha\.execute/i,           type: 'recaptcha-v3'  },
  { re: /data-sitekey/i,                  type: 'recaptcha-v2'  },
  { re: /hcaptcha\.com\/1\/api\.js/i,     type: 'hcaptcha'      },
  { re: /cf_chl_captcha_tk__|challenge-form|cf-chl-bypass/i, type: 'cloudflare' },
  { re: /just a moment/i,                 type: 'cloudflare'    },
  { re: /ddos-guard/i,                    type: 'ddosguard'     },
  { re: /captcha-delivery\.com/i,         type: 'datadome'      },
  { re: /px_captcha/i,                    type: 'perimeter-x'   },
  { re: /funcaptcha|arkose/i,             type: 'funcaptcha'    },
  { re: /turnstile\.cloudflare\.com/i,    type: 'turnstile'     },
  { re: /Please verify you are a human/i, type: 'generic'       },
  { re: /Are you a human\?/i,            type: 'generic'       },
  { re: /<title>[^<]*access denied/i,     type: 'access-denied' },
  { re: /<title>[^<]*robot/i,            type: 'bot-block'     },
];

const SITEKEY_RE = /data-sitekey=["']([^"']+)["']/i;

function detectCaptcha(html) {
  if (!html) return { detected: false, type: null, siteKey: null };
  for (const { re, type } of PATTERNS) {
    if (re.test(html)) {
      const keyMatch = html.match(SITEKEY_RE);
      const siteKey  = keyMatch ? keyMatch[1] : null;
      metrics.recordCaptcha?.();
      logger.warn(`CAPTCHA detected: ${type}${siteKey ? ` (key: ${siteKey.slice(0,20)}…)` : ''}`);
      return { detected: true, type, siteKey };
    }
  }
  return { detected: false, type: null, siteKey: null };
}

// ── playwright-extra stealth loader ──────────────────────────────────────────

function getStealthChromium() {
  try {
    const { chromium }  = require('playwright-extra');
    const StealthPlugin = require('playwright-extra-plugin-stealth');
    chromium.use(StealthPlugin());
    logger.debug('[Stealth] playwright-extra active — 30+ fingerprint patches applied');
    return chromium;
  } catch {
    logger.debug('[Stealth] playwright-extra not available — using base playwright');
    return require('playwright').chromium;
  }
}

// ── Paid service config ───────────────────────────────────────────────────────

const PAID = {
  '2captcha':      { submit: 'http://2captcha.com/in.php',                result: 'http://2captcha.com/res.php'                 },
  'anticaptcha':   { submit: 'https://api.anti-captcha.com/createTask',   result: 'https://api.anti-captcha.com/getTaskResult'  },
  'capsolver':     { submit: 'https://api.capsolver.com/createTask',      result: 'https://api.capsolver.com/getTaskResult'     },
  'deathbycaptcha':{ submit: 'http://api.dbcapi.me/api/',                  result: 'http://api.dbcapi.me/api/captcha/'           },
};

// ── Main solver ───────────────────────────────────────────────────────────────

class CaptchaSolver {
  /**
   * @param {string} apiKey  — paid service key (last-resort fallback)
   * @param {string} service — '2captcha'|'anticaptcha'|'capsolver'|'deathbycaptcha'
   * @param {object} opts
   *   nopechaKey       : string   — NopeCHA key (10k free/month)
   *   flareSolverrUrl  : string   — FlareSolverr URL (default: http://localhost:8191)
   *   audioBackend     : string   — 'auto'|'whisper'|'faster-whisper'|'google'
   *   googleSttKey     : string   — Google STT key for audio fallback
   *   enableAudio      : boolean  — default true
   *   enableFlare      : boolean  — default true
   *   enableNopecha    : boolean  — default true
   */
  constructor(apiKey, service = '2captcha', opts = {}) {
    this.apiKey  = apiKey;
    this.service = service;
    this.ep      = PAID[service] || PAID['2captcha'];

    this.nopecha        = opts.nopechaKey ? new NopeCHAClient(opts.nopechaKey) : null;
    this.flare          = new FlareSolverrClient(opts.flareSolverrUrl || 'http://localhost:8191');
    this.audioBackend   = opts.audioBackend || 'auto';
    this.googleSttKey   = opts.googleSttKey || null;
    this.enableAudio    = opts.enableAudio   !== false;
    this.enableFlare    = opts.enableFlare   !== false;
    this.enableNopecha  = opts.enableNopecha !== false;

    this.stats = { prevented: 0, flare: 0, audio: 0, nopecha: 0, paid: 0, failed: 0 };
  }

  get isConfigured() {
    return Boolean(this.apiKey || this.nopecha?.isConfigured);
  }

  // ── Primary entry ─────────────────────────────────────────────────────────

  /**
   * Solve a CAPTCHA using the full fallback chain.
   * Returns { token, method } — token is null if everything failed.
   */
  async solve({ type, siteKey, pageUrl, page }) {
    logger.info(`[Solver] Solving ${type} on ${pageUrl}`);

    // Cloudflare → FlareSolverr first
    if (['cloudflare', 'ddosguard'].includes(type) && this.enableFlare) {
      const t = await this._tryFlare(pageUrl);
      if (t) return { token: t, method: 'flaresolverr' };
    }

    // reCAPTCHA v2 → audio bypass (free)
    if (['recaptcha-v2', 'generic'].includes(type) && this.enableAudio && page) {
      const t = await this._tryAudio(page);
      if (t) return { token: t, method: 'audio' };
    }

    // NopeCHA free tier
    if (this.nopecha && this.enableNopecha && siteKey) {
      const t = await this._tryNopecha(type, siteKey, pageUrl);
      if (t) return { token: t, method: 'nopecha' };
    }

    // Paid service — last resort
    if (this.apiKey && siteKey) {
      const t = await this._tryPaid(type, siteKey, pageUrl);
      if (t) return { token: t, method: `paid:${this.service}` };
    }

    this.stats.failed++;
    logger.warn(`[Solver] All methods exhausted for ${type}`);
    return { token: null, method: 'none' };
  }

  // Convenience wrapper
  async solveRecaptchaV2(siteKey, pageUrl, page = null) {
    return this.solve({ type: 'recaptcha-v2', siteKey, pageUrl, page });
  }

  // ── Token injection ───────────────────────────────────────────────────────

  async injectToken(page, token) {
    if (!token || !page) return false;
    try {
      await page.evaluate(t => {
        const rc = document.querySelector('#g-recaptcha-response,[name="g-recaptcha-response"]');
        if (rc) { rc.value = t; rc.style.display = 'block'; }
        const hc = document.querySelector('[name="h-captcha-response"]');
        if (hc) hc.value = t;
        const cfg = window.___grecaptcha_cfg?.clients;
        if (cfg) {
          for (const id in cfg) for (const k in cfg[id]) {
            const cb = cfg[id][k]?.callback;
            if (typeof cb === 'function') { try { cb(t); } catch {} break; }
          }
        }
      }, token);
      await page.waitForTimeout(1000);
      logger.info('[Solver] Token injected into page');
      return true;
    } catch (e) {
      logger.error(`[Solver] Injection failed: ${e.message}`);
      return false;
    }
  }

  // ── Strategy implementations ──────────────────────────────────────────────

  async _tryFlare(url) {
    try {
      const r = await this.flare.request(url);
      if (r?.html) { this.stats.flare++; logger.info('[Solver] ✓ FlareSolverr'); return r.html; }
    } catch (e) { logger.debug(`[Solver] FlareSolverr: ${e.message}`); }
    return null;
  }

  async _tryAudio(page) {
    if (!hasWhisper() && !this.googleSttKey) {
      logger.debug('[Solver] Audio skipped — install faster-whisper: pip install faster-whisper');
      return null;
    }
    try {
      const r = await solveAudioCaptcha(page, { audioBackend: this.audioBackend, googleSttKey: this.googleSttKey });
      if (r) { this.stats.audio++; logger.info('[Solver] ✓ Audio bypass (free)'); return r; }
    } catch (e) { logger.debug(`[Solver] Audio: ${e.message}`); }
    return null;
  }

  async _tryNopecha(type, siteKey, pageUrl) {
    try {
      const r = await this.nopecha.solveByType(type, siteKey, pageUrl);
      if (r) { this.stats.nopecha++; logger.info('[Solver] ✓ NopeCHA (free tier)'); return r; }
    } catch (e) { logger.debug(`[Solver] NopeCHA: ${e.message}`); }
    return null;
  }

  async _tryPaid(type, siteKey, pageUrl) {
    logger.info(`[Solver] Trying paid: ${this.service}`);
    try {
      const r = await this._paidSolve(siteKey, pageUrl, type);
      if (r) { this.stats.paid++; logger.info(`[Solver] ✓ ${this.service} (paid)`); return r; }
    } catch (e) { logger.debug(`[Solver] Paid: ${e.message}`); }
    return null;
  }

  // ── Paid service implementations ─────────────────────────────────────────

  async _paidSolve(siteKey, pageUrl, type) {
    switch (this.service) {
      case 'anticaptcha':    return this._antiCaptcha(siteKey, pageUrl, type);
      case 'capsolver':      return this._capsolver(siteKey, pageUrl, type);
      case 'deathbycaptcha': return this._dbc(siteKey, pageUrl);
      default:               return this._2captcha(siteKey, pageUrl, type);
    }
  }

  async _2captcha(siteKey, pageUrl, type) {
    const method = type === 'hcaptcha' ? 'hcaptcha' : 'userrecaptcha';
    const p = { key: this.apiKey, method, googlekey: siteKey, pageurl: pageUrl, json: 1 };
    if (type === 'recaptcha-v3') p.version = 'v3';
    const { data: sub } = await axios.post(this.ep.submit, null, { params: p, timeout: 15000 });
    if (sub.status !== 1) throw new Error(sub.request);
    const id = sub.request;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: res } = await axios.get(this.ep.result, { params: { key: this.apiKey, action: 'get', id, json: 1 }, timeout: 10000 });
      if (res.status === 1) return res.request;
      if (res.request !== 'CAPCHA_NOT_READY') throw new Error(res.request);
    }
    return null;
  }

  async _antiCaptcha(siteKey, pageUrl, type) {
    const taskType = type === 'hcaptcha' ? 'HCaptchaTaskProxyless'
      : type === 'recaptcha-v3' ? 'RecaptchaV3TaskProxyless'
      : 'NoCaptchaTaskProxyless';
    const { data: sub } = await axios.post(this.ep.submit, { clientKey: this.apiKey, task: { type: taskType, websiteURL: pageUrl, websiteKey: siteKey } }, { timeout: 15000 });
    if (sub.errorId !== 0) throw new Error(sub.errorDescription);
    const taskId = sub.taskId;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: res } = await axios.post(this.ep.result, { clientKey: this.apiKey, taskId }, { timeout: 10000 });
      if (res.status === 'ready') return res.solution?.gRecaptchaResponse;
      if (res.errorId !== 0) throw new Error(res.errorDescription);
    }
    return null;
  }

  async _capsolver(siteKey, pageUrl, type) {
    const taskType = type === 'hcaptcha' ? 'HCaptchaTaskProxyLess'
      : type === 'recaptcha-v3' ? 'ReCaptchaV3TaskProxyLess'
      : 'ReCaptchaV2TaskProxyLess';
    const { data: sub } = await axios.post(this.ep.submit, { clientKey: this.apiKey, task: { type: taskType, websiteURL: pageUrl, websiteKey: siteKey } }, { timeout: 15000 });
    if (sub.errorId !== 0) throw new Error(sub.errorDescription);
    const taskId = sub.taskId;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const { data: res } = await axios.post(this.ep.result, { clientKey: this.apiKey, taskId }, { timeout: 10000 });
      if (res.status === 'ready') return res.solution?.gRecaptchaResponse;
      if (res.errorId !== 0) throw new Error(res.errorDescription);
    }
    return null;
  }

  async _dbc(siteKey, pageUrl) {
    const { data: sub } = await axios.post(this.ep.submit, { authtoken: this.apiKey, type: 4, googlekey: siteKey, pageurl: pageUrl }, { timeout: 15000 });
    const captchaId = sub?.captcha;
    if (!captchaId) return null;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: res } = await axios.get(`${this.ep.result}${captchaId}/`, { timeout: 10000 });
      if (res?.text) return res.text;
    }
    return null;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getStats() {
    const { prevented, flare, audio, nopecha, paid, failed } = this.stats;
    const solved = flare + audio + nopecha + paid;
    const total  = solved + failed;
    return {
      ...this.stats,
      solveRate: total ? `${Math.round(solved / total * 100)}%` : 'n/a',
      freeRate:  total ? `${Math.round((flare + audio + nopecha) / Math.max(total, 1) * 100)}%` : 'n/a',
    };
  }

  async checkSetup() {
    const whisper      = hasWhisper();
    const flareOnline  = await this.flare.isAvailable();
    const nopechaReady = Boolean(this.nopecha?.isConfigured);
    const paidReady    = Boolean(this.apiKey);

    logger.info('─── CAPTCHA Chain Status ─────────────────────────');
    logger.info(`  1. playwright-stealth  : ✓ always active`);
    logger.info(`  2. FlareSolverr        : ${flareOnline ? '✓ running' : '✗ start with: docker run -d -p 8191:8191 flaresolverr/flaresolverr'}`);
    logger.info(`  3. Audio bypass        : ${whisper ? `✓ ${whisper}` : '✗ not installed — run: pip install faster-whisper'}`);
    logger.info(`  4. NopeCHA             : ${nopechaReady ? '✓ configured' : '✗ no key — free at nopecha.com (10k/month)'}`);
    logger.info(`  5. Paid (${this.service.padEnd(14)}): ${paidReady ? '✓ configured' : '✗ no key — last resort only'}`);
    logger.info('──────────────────────────────────────────────────');

    return { whisper, flareOnline, nopechaReady, paidReady };
  }
}

module.exports = { detectCaptcha, CaptchaSolver, getStealthChromium };
