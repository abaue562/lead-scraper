'use strict';

/**
 * NopeCHA Client
 *
 * NopeCHA is an open-source CAPTCHA solver with a generous free tier.
 *
 * Free tier: 10,000 solves / month
 * Paid:      from $0.0001/solve (cheapest of all services)
 * GitHub:    https://github.com/NopeCHA/NopeCHA
 * Signup:    https://nopecha.com
 *
 * Supports:
 *   - reCAPTCHA v2 and v3
 *   - hCaptcha
 *   - Turnstile (Cloudflare)
 *   - FunCaptcha / Arkose
 *   - Image/text CAPTCHAs
 *   - AWS WAF CAPTCHA
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const BASE   = 'https://api.nopecha.com';
const TYPES  = {
  'recaptcha-v2':  'recaptcha2',
  'recaptcha-v3':  'recaptcha3',
  'hcaptcha':      'hcaptcha',
  'cloudflare':    'turnstile',
  'funcaptcha':    'funcaptcha',
  'image':         'image',
  'text':          'textcaptcha',
};

class NopeCHAClient {
  /**
   * @param {string} apiKey - NopeCHA API key
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  get isConfigured() { return Boolean(this.apiKey); }

  // ── Check balance ────────────────────────────────────────────────────────
  async getBalance() {
    try {
      const r = await axios.get(`${BASE}/status`, {
        params: { key: this.apiKey },
        timeout: 5000,
      });
      return r.data;
    } catch { return null; }
  }

  // ── Solve reCAPTCHA v2/v3 ────────────────────────────────────────────────
  async solveRecaptcha(siteKey, pageUrl, version = 'v2') {
    if (!this.isConfigured) return null;

    const type = version === 'v3' ? 'recaptcha3' : 'recaptcha2';
    return this._solve({ type, sitekey: siteKey, url: pageUrl });
  }

  // ── Solve hCaptcha ───────────────────────────────────────────────────────
  async solveHCaptcha(siteKey, pageUrl) {
    if (!this.isConfigured) return null;
    return this._solve({ type: 'hcaptcha', sitekey: siteKey, url: pageUrl });
  }

  // ── Solve Cloudflare Turnstile ────────────────────────────────────────────
  async solveTurnstile(siteKey, pageUrl) {
    if (!this.isConfigured) return null;
    return this._solve({ type: 'turnstile', sitekey: siteKey, url: pageUrl });
  }

  // ── Generic solve by detected type ──────────────────────────────────────
  async solveByType(detectedType, siteKey, pageUrl) {
    if (!this.isConfigured) return null;

    const type = TYPES[detectedType];
    if (!type) {
      logger.warn(`[NopeCHA] No mapping for type: ${detectedType}`);
      return null;
    }

    return this._solve({ type, sitekey: siteKey, url: pageUrl });
  }

  // ── Internal: submit + poll ──────────────────────────────────────────────
  async _solve(params) {
    const start = Date.now();
    logger.info(`[NopeCHA] Solving ${params.type} for ${params.url}`);

    try {
      // Submit task
      const submitResp = await axios.post(BASE, {
        key:     this.apiKey,
        ...params,
      }, { timeout: 15000 });

      if (submitResp.data?.error) {
        logger.warn(`[NopeCHA] Submit error: ${submitResp.data.error}`);
        if (submitResp.data.error === 'MISSING_APIKEY') return null;
        if (submitResp.data.error === 'QUOTA_EXCEEDED') {
          logger.warn('[NopeCHA] Monthly free quota exceeded — switch to paid or use fallback');
          return null;
        }
        return null;
      }

      const taskId = submitResp.data?.id;
      if (!taskId) return null;

      logger.debug(`[NopeCHA] Task ID: ${taskId}`);

      // Poll for result — NopeCHA is fast, usually 8–20s
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const pollResp = await axios.get(BASE, {
          params: { key: this.apiKey, id: taskId },
          timeout: 10000,
        });

        if (pollResp.data?.error) {
          if (pollResp.data.error === 'TASK_PROCESSING') continue;
          logger.warn(`[NopeCHA] Poll error: ${pollResp.data.error}`);
          return null;
        }

        const token = pollResp.data?.data?.[0];
        if (token) {
          const elapsed = Math.round((Date.now() - start) / 1000);
          logger.info(`[NopeCHA] Solved in ${elapsed}s`);
          return token;
        }
      }

      logger.warn('[NopeCHA] Timeout after 90s');
      return null;

    } catch (err) {
      logger.error(`[NopeCHA] Error: ${err.message}`);
      return null;
    }
  }
}

module.exports = { NopeCHAClient };
