'use strict';

/**
 * In-process metrics tracker.
 * Tracks request rates, latency percentiles, success rates, and proxy health.
 * Resets every hour to show rolling window stats.
 */
class Metrics {
  constructor() {
    this._windowStart = Date.now();
    this._requests   = { total: 0, success: 0, failed: 0, captcha: 0 };
    this._active     = 0;
    this._times      = [];       // response time samples (ms), capped at 2000
    this._errors     = {};       // error message → count
    this._proxies    = { rotations: 0, failures: 0, blacklisted: 0 };
    this._sources    = {};       // source name → count

    // Auto-reset every hour
    this._timer = setInterval(() => this._hourlyReset(), 60 * 60 * 1000);
    if (this._timer.unref) this._timer.unref();
  }

  _hourlyReset() {
    this._windowStart = Date.now();
    this._requests    = { total: 0, success: 0, failed: 0, captcha: 0 };
    this._times       = [];
    this._errors      = {};
  }

  // ── Request tracking ────────────────────────────────────────────────────

  recordSuccess(elapsedMs, source = 'browser') {
    this._requests.total++;
    this._requests.success++;
    this._times.push(elapsedMs);
    if (this._times.length > 2000) this._times.shift();
    this._sources[source] = (this._sources[source] || 0) + 1;
  }

  recordFailure(errorMsg = 'unknown') {
    this._requests.total++;
    this._requests.failed++;
    const key = String(errorMsg).slice(0, 80);
    this._errors[key] = (this._errors[key] || 0) + 1;
  }

  recordCaptcha() {
    this._requests.captcha++;
  }

  incrementActive()  { this._active++; }
  decrementActive()  { this._active = Math.max(0, this._active - 1); }

  // ── Proxy tracking ──────────────────────────────────────────────────────

  recordProxyRotation()   { this._proxies.rotations++; }
  recordProxyFailure()    { this._proxies.failures++;  }
  recordProxyBlacklist()  { this._proxies.blacklisted++; }

  // ── Snapshot ────────────────────────────────────────────────────────────

  getSnapshot() {
    const { total, success, failed, captcha } = this._requests;
    const successRate = total > 0
      ? ((success / total) * 100).toFixed(1) + '%'
      : '0.0%';

    const sorted   = [...this._times].sort((a, b) => a - b);
    const p = (pct) => sorted[Math.floor(sorted.length * pct)] || 0;

    const uptimeSec  = Math.round((Date.now() - this._windowStart) / 1000);
    const rph        = uptimeSec > 0 ? Math.round((total / uptimeSec) * 3600) : 0;

    return {
      window:   `${Math.round(uptimeSec / 60)} min`,
      active:   this._active,
      requests: { total, success, failed, captcha },
      successRate,
      requestsPerHour: rph,
      latency: {
        avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        p50: p(0.50),
        p90: p(0.90),
        p95: p(0.95),
        p99: p(0.99),
      },
      proxies: this._proxies,
      sources: this._sources,
      topErrors: Object.entries(this._errors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([err, count]) => ({ err, count })),
    };
  }
}

module.exports = new Metrics();
