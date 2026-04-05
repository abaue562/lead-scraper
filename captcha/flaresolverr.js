'use strict';

/**
 * FlareSolverr Client
 *
 * FlareSolverr is a free open-source proxy server that solves Cloudflare,
 * DDoS-Guard, and other browser challenge pages. It runs locally in Docker
 * and exposes a simple HTTP API.
 *
 * Start it once:
 *   docker run -d -p 8191:8191 --name flaresolverr \
 *     -e LOG_LEVEL=info \
 *     flaresolverr/flaresolverr:latest
 *
 * GitHub: https://github.com/FlareSolverr/FlareSolverr
 *
 * What it handles:
 *   - Cloudflare "Just a moment…" / JS challenge
 *   - Cloudflare Turnstile (partially)
 *   - DDoS-Guard
 *   - Distil Networks bot protection
 *
 * What it does NOT handle:
 *   - reCAPTCHA v2/v3 (use AudioSolver or paid service)
 *   - hCaptcha (use NopeCHA or paid service)
 */

const axios  = require('axios');
const logger = require('../utils/logger');

class FlareSolverrClient {
  /**
   * @param {string} baseUrl - FlareSolverr endpoint (default: http://localhost:8191)
   * @param {number} timeout - Page wait timeout in ms (default: 60000)
   */
  constructor(baseUrl = 'http://localhost:8191', timeout = 60000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    this._available = null;
  }

  // ── Availability check ───────────────────────────────────────────────────

  async isAvailable() {
    if (this._available !== null) return this._available;
    try {
      const r = await axios.get(`${this.baseUrl}/`, { timeout: 3000 });
      this._available = r.status === 200;
    } catch {
      this._available = false;
    }
    if (!this._available) {
      logger.debug('[FlareSolverr] Not running. Start with: docker run -d -p 8191:8191 flaresolverr/flaresolverr');
    }
    return this._available;
  }

  // ── Main request method ──────────────────────────────────────────────────

  /**
   * Fetch a URL through FlareSolverr, bypassing Cloudflare.
   *
   * @param {string} url  - URL to fetch
   * @param {object} opts
   *   method       - 'GET' | 'POST' (default 'GET')
   *   postData     - POST body if method is POST
   *   session      - Session ID (reuse cookies across requests)
   *   cookies      - array of {name, value} cookies to inject
   *
   * @returns {{ html: string, cookies: object[], userAgent: string } | null}
   */
  async request(url, opts = {}) {
    if (!await this.isAvailable()) return null;

    const { method = 'GET', postData = null, session = null, cookies = [] } = opts;

    const payload = {
      cmd:     method === 'POST' ? 'request.post' : 'request.get',
      url,
      maxTimeout: this.timeout,
    };

    if (session)  payload.session   = session;
    if (cookies.length) payload.cookies = cookies;
    if (postData) payload.postData  = postData;

    logger.info(`[FlareSolverr] Requesting: ${url.slice(0, 80)}`);
    const start = Date.now();

    try {
      const resp = await axios.post(`${this.baseUrl}/v1`, payload, {
        timeout: this.timeout + 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      if (resp.data?.status !== 'ok') {
        logger.warn(`[FlareSolverr] Non-OK status: ${resp.data?.message}`);
        return null;
      }

      const sol = resp.data.solution;
      const elapsed = Date.now() - start;
      logger.info(`[FlareSolverr] Bypassed in ${elapsed}ms, ${sol?.cookies?.length || 0} cookies returned`);

      return {
        html:      sol?.response || '',
        cookies:   sol?.cookies  || [],
        userAgent: sol?.userAgent || '',
        status:    sol?.status   || 200,
        url:       sol?.url      || url,
      };

    } catch (err) {
      logger.error(`[FlareSolverr] Request failed: ${err.message}`);
      return null;
    }
  }

  // ── Session management ───────────────────────────────────────────────────

  /**
   * Create a persistent browser session.
   * Reuse the session ID to carry cookies across multiple requests.
   */
  async createSession(sessionId) {
    if (!await this.isAvailable()) return null;
    try {
      const r = await axios.post(`${this.baseUrl}/v1`, {
        cmd: 'sessions.create', session: sessionId,
      }, { timeout: 10000 });
      if (r.data?.status === 'ok') {
        logger.debug(`[FlareSolverr] Session created: ${sessionId}`);
        return sessionId;
      }
    } catch (e) {
      logger.warn(`[FlareSolverr] Session create failed: ${e.message}`);
    }
    return null;
  }

  async destroySession(sessionId) {
    if (!await this.isAvailable()) return;
    try {
      await axios.post(`${this.baseUrl}/v1`, {
        cmd: 'sessions.destroy', session: sessionId,
      }, { timeout: 5000 });
    } catch {}
  }

  async listSessions() {
    if (!await this.isAvailable()) return [];
    try {
      const r = await axios.post(`${this.baseUrl}/v1`, { cmd: 'sessions.list' }, { timeout: 5000 });
      return r.data?.sessions || [];
    } catch { return []; }
  }
}

module.exports = { FlareSolverrClient };
