'use strict';

const logger  = require('../utils/logger');
const metrics = require('../utils/metrics');

/**
 * ProxyManager — rotating proxy pool with geo-targeting, failure tracking,
 * and automatic temporary blacklisting of bad proxies.
 *
 * Proxy formats accepted (comma-separated string or array):
 *   http://user:pass@host:port
 *   host:port:user:pass
 *   host:port:user:pass:region   (region = us-east, us-west, uk, etc.)
 *   { server, username, password, region }  (object)
 */
class ProxyManager {
  constructor(proxies = []) {
    this._pool = (Array.isArray(proxies) ? proxies : [proxies])
      .map(p => this._normalise(p))
      .filter(Boolean)
      .map(p => ({
        ...p,
        failures:         0,
        successes:        0,
        lastUsed:         0,
        blacklistedUntil: 0,
      }));

    this._rr = 0;   // round-robin cursor

    if (this._pool.length > 0) {
      logger.info(`ProxyManager: loaded ${this._pool.length} proxies`);
    } else {
      logger.info('ProxyManager: no proxies configured — direct connections');
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  get count() { return this._pool.length; }
  get hasProxies() { return this._pool.length > 0; }

  /**
   * Get the next available proxy, optionally filtered by region.
   * Uses round-robin across healthy proxies; falls back to least-recently-used
   * blacklisted proxy if all are blacklisted.
   *
   * @param {string|null} region  - e.g. 'us-east', 'us-west', 'uk'
   * @returns proxy object or null
   */
  getProxy(region = null) {
    if (!this.hasProxies) return null;

    const now       = Date.now();
    const available = this._pool.filter(p => p.blacklistedUntil < now);

    let candidates = available;

    // Regional filtering
    if (region) {
      const regional = available.filter(p =>
        p.region && (p.region === region || p.region.startsWith(region))
      );
      if (regional.length > 0) candidates = regional;
    }

    // Fallback: all proxies blacklisted → clear the oldest
    if (candidates.length === 0) {
      const oldest = [...this._pool].sort((a, b) => a.blacklistedUntil - b.blacklistedUntil)[0];
      oldest.blacklistedUntil = 0;
      oldest.failures         = 0;
      candidates              = [oldest];
      logger.warn('All proxies blacklisted — resetting oldest');
    }

    // Sort: fewest failures first, then least recently used
    candidates.sort((a, b) =>
      a.failures - b.failures || a.lastUsed - b.lastUsed
    );

    const proxy     = candidates[0];
    proxy.lastUsed  = now;

    metrics.recordProxyRotation();
    logger.debug(`Proxy selected: ${proxy.server} [region:${proxy.region || 'any'}, failures:${proxy.failures}]`);

    return proxy;
  }

  /**
   * Mark a proxy as successful — reduces its failure weight.
   */
  markSuccess(proxy) {
    const p = this._find(proxy);
    if (p) {
      p.failures  = Math.max(0, p.failures - 1);
      p.successes++;
    }
  }

  /**
   * Mark a proxy as failed.
   * After 3 consecutive failures it's temporarily blacklisted.
   *
   * @param {object} proxy
   * @param {number} blacklistMs  - how long to blacklist (default 5 min)
   */
  markFailure(proxy, blacklistMs = 5 * 60 * 1000) {
    const p = this._find(proxy);
    if (!p) return;

    p.failures++;
    metrics.recordProxyFailure();

    if (p.failures >= 3) {
      p.blacklistedUntil = Date.now() + blacklistMs;
      metrics.recordProxyBlacklist();
      logger.warn(`Proxy blacklisted for ${blacklistMs / 1000}s: ${p.server}`);
    }
  }

  /** Return stats for all proxies (useful for /metrics endpoint). */
  getStats() {
    const now = Date.now();
    return this._pool.map(p => ({
      server:     p.server,
      region:     p.region || null,
      failures:   p.failures,
      successes:  p.successes,
      blacklisted: p.blacklistedUntil > now,
      blacklistedUntil: p.blacklistedUntil > now
        ? new Date(p.blacklistedUntil).toISOString()
        : null,
    }));
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _normalise(raw) {
    if (!raw) return null;

    // Already an object
    if (typeof raw === 'object' && raw.server) {
      return {
        server:   raw.server,
        username: raw.username || null,
        password: raw.password || null,
        region:   raw.region   || null,
      };
    }

    const str = String(raw).trim();
    if (!str) return null;

    // http(s)://user:pass@host:port
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        const u = new URL(str);
        return {
          server:   `${u.protocol}//${u.hostname}:${u.port}`,
          username: u.username || null,
          password: u.password || null,
          region:   null,
        };
      } catch { return null; }
    }

    // host:port:user:pass[:region]
    const parts = str.split(':');
    if (parts.length >= 2) {
      return {
        server:   `http://${parts[0]}:${parts[1]}`,
        username: parts[2] || null,
        password: parts[3] || null,
        region:   parts[4] || null,
      };
    }

    logger.warn(`Could not parse proxy string: ${str}`);
    return null;
  }

  _find(proxy) {
    if (!proxy) return null;
    return this._pool.find(p => p.server === proxy.server) || null;
  }
}

module.exports = ProxyManager;
