'use strict';

/**
 * ScrapeMemory
 *
 * Persistent cross-session memory for the scraper. Prevents re-scraping
 * work that's already been done, enabling incremental runs that pick up
 * where the previous session left off.
 *
 * Two storage tiers:
 *   Redis  — business URL sets (fast O(1) lookup, survives restarts)
 *   JSON   — combo-level state (human-readable, easy to inspect/reset)
 *
 * Usage:
 *   const mem = new ScrapeMemory(redisConnection);
 *   await mem.load();
 *
 *   // In autorun — skip combos already done
 *   if (mem.comboIsDone('Vancouver, BC', 'plumber')) continue;
 *   mem.recordCombo('Vancouver, BC', 'plumber', { jobId, resultCount });
 *   await mem.save();
 *
 *   // In googleMaps — skip already-scraped place URLs
 *   const fresh = await mem.filterNewUrls(urls);   // removes known URLs
 *   await mem.recordUrls(urls);                    // mark as scraped
 */

const fs   = require('fs');
const path = require('path');

const STATE_FILE   = path.join(__dirname, '../data/scrape_state.json');
const REDIS_KEY    = 'scraped:maps_urls';
const MIN_RESULTS  = 10;   // combo is "done" if it yielded at least this many results

class ScrapeMemory {
  constructor(redis = null, config = {}) {
    this._redis   = redis;
    this._config  = config;   // { staleDays? } — controls cell/cursor freshness
    this._combos  = {};       // "city|category" → { firstRun, lastRun, totalResults, runCount, cells? }
    this._cursors = {};       // "source|city|category" → { offset?, page?, start?, lastRun, exhausted? }
    this._loaded  = false;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        this._combos  = data.combos  || {};
        this._cursors = data.cursors || {};
        this._loaded  = true;
        return true;
      }
    } catch (err) {
      console.warn(`[ScrapeMemory] Could not load state file: ${err.message}`);
    }
    this._loaded = true;
    return false;
  }

  save() {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        combos:  this._combos,
        cursors: this._cursors,
      }, null, 2));
    } catch (err) {
      console.warn(`[ScrapeMemory] Could not save state: ${err.message}`);
    }
  }

  // ── Combo-level memory (city × category) ────────────────────────────────────

  _comboKey(city, category) {
    return `${city}|${category}`;
  }

  /**
   * Returns true if this combo was already scraped with enough results.
   * If cells are being tracked, returns true only when ALL cells are done.
   * Falls back to result-count logic when no cells have been tracked yet.
   */
  comboIsDone(city, category) {
    const key  = this._comboKey(city, category);
    const info = this._combos[key];
    if (!info) return false;

    // Cell-level tracking: all cells must be done
    if (info.cells && Object.keys(info.cells).length > 0) {
      const cellValues = Object.values(info.cells);
      return cellValues.length > 0 && cellValues.every(c => c.done === true);
    }

    // Legacy fallback: result-count threshold
    return info.totalResults >= MIN_RESULTS;
  }

  /**
   * Returns combo info — how many results, when it was last run, etc.
   */
  getComboInfo(city, category) {
    return this._combos[this._comboKey(city, category)] || null;
  }

  /**
   * Record that a combo was scraped.
   * @param {string} city
   * @param {string} category
   * @param {{ resultCount: number, jobId?: string }} info
   */
  recordCombo(city, category, { resultCount = 0, jobId = null } = {}) {
    const key  = this._comboKey(city, category);
    const now  = new Date().toISOString();
    const prev = this._combos[key];
    this._combos[key] = {
      firstRun:     prev?.firstRun || now,
      lastRun:      now,
      totalResults: (prev?.totalResults || 0) + resultCount,
      runCount:     (prev?.runCount    || 0) + 1,
      lastJobId:    jobId,
    };
  }

  // ── Cell-level memory (lat/lng grid cells within a city) ────────────────────

  /**
   * Returns true if this specific grid cell has already been scraped.
   * Respects staleDays config — if cell is older than staleDays, returns false.
   */
  cellIsDone(city, category, cellKey) {
    const key  = this._comboKey(city, category);
    const info = this._combos[key];
    if (!info?.cells?.[cellKey]) return false;

    const cell = info.cells[cellKey];
    if (!cell.done) return false;

    // Staleness check
    const staleDays = this._config?.staleDays;
    if (staleDays && cell.date) {
      const cellDate  = new Date(cell.date);
      const ageMs     = Date.now() - cellDate.getTime();
      const ageDays   = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > staleDays) return false;
    }

    return true;
  }

  /**
   * Record that a grid cell was scraped.
   */
  recordCell(city, category, cellKey, { resultCount = 0 } = {}) {
    const key  = this._comboKey(city, category);
    const now  = new Date().toISOString();
    const prev = this._combos[key];

    // Ensure the combo entry exists
    if (!prev) {
      this._combos[key] = {
        firstRun:     now,
        lastRun:      now,
        totalResults: resultCount,
        runCount:     1,
        cells:        {},
      };
    } else {
      this._combos[key].lastRun      = now;
      this._combos[key].totalResults = (prev.totalResults || 0) + resultCount;
      this._combos[key].cells        = prev.cells || {};
    }

    this._combos[key].cells[cellKey] = {
      done:    true,
      results: resultCount,
      date:    now.slice(0, 10),
    };
  }

  /**
   * Given the full cell array for a city+category, return only uncompleted cells.
   */
  getPendingCells(city, category, allCells) {
    return allCells.filter(cell => !this.cellIsDone(city, category, cell.key));
  }

  /**
   * Returns 0-100 coverage percentage for this combo's cells.
   */
  getCoveragePercent(city, category, totalCells) {
    if (!totalCells || totalCells === 0) return 0;
    const key  = this._comboKey(city, category);
    const info = this._combos[key];
    if (!info?.cells) return 0;
    const done = Object.values(info.cells).filter(c => c.done).length;
    return Math.round((done / totalCells) * 100);
  }

  /**
   * Aggregate cell stats across all tracked combos.
   * @returns {{ totalCombos, totalCells, doneCells, coveragePercent }}
   */
  cellStats() {
    let totalCells = 0;
    let doneCells  = 0;
    const totalCombos = Object.keys(this._combos).length;

    for (const info of Object.values(this._combos)) {
      if (info.cells) {
        const cellValues = Object.values(info.cells);
        totalCells += cellValues.length;
        doneCells  += cellValues.filter(c => c.done).length;
      }
    }

    const coveragePercent = totalCells > 0
      ? Math.round((doneCells / totalCells) * 100)
      : 0;

    return { totalCombos, totalCells, doneCells, coveragePercent };
  }

  /**
   * Force-reset a combo so it will be re-scraped next run.
   */
  resetCombo(city, category) {
    delete this._combos[this._comboKey(city, category)];
    this.save();
  }

  /**
   * Reset all combos (full re-scrape on next run).
   */
  resetAll() {
    this._combos = {};
    this.save();
  }

  /**
   * Summary of combo state.
   */
  comboStats() {
    const all   = Object.values(this._combos);
    const done  = all.filter(c => c.totalResults >= MIN_RESULTS).length;
    const total = all.length;
    const leads = all.reduce((s, c) => s + (c.totalResults || 0), 0);
    return { total, done, leads };
  }

  // ── Cursor tracking (pagination state per source) ───────────────────────────
  // Lets scrapers resume from the exact page/offset where they left off.
  // Each source uses its own cursor field:
  //   Yelp         → offset  (start=0, 10, 20 …)
  //   Yellow Pages → page    (page=1, 2, 3 …)
  //   Google Search→ start   (start=0, 10, 20 …)

  _cursorKey(source, city, category) {
    return `${source}|${city}|${category}`;
  }

  /**
   * Get the saved cursor for a source+combo.
   * Returns null if no cursor saved yet (start from beginning).
   * Returns null if cursor is exhausted (no more pages).
   * Returns null if cursor is stale (older than staleDays).
   */
  getCursor(source, city, category) {
    const key    = this._cursorKey(source, city, category);
    const cursor = this._cursors[key];
    if (!cursor) return null;
    if (cursor.exhausted) return null;

    // Freshness check — stale cursor means the source may have new listings
    const staleDays = this._config?.staleDays;
    if (staleDays && cursor.lastRun) {
      const ageDays = (Date.now() - new Date(cursor.lastRun).getTime()) / 86400000;
      if (ageDays > staleDays) {
        // Reset cursor so we re-scrape from the beginning with fresh eyes
        delete this._cursors[key];
        return null;
      }
    }

    return cursor;
  }

  /**
   * Save pagination cursor after a scrape run.
   * @param {string} source  'yelp' | 'yellowpages' | 'google_search'
   * @param {string} city
   * @param {string} category
   * @param {object} data    { offset?, page?, start?, exhausted? }
   */
  saveCursor(source, city, category, data = {}) {
    const key = this._cursorKey(source, city, category);
    this._cursors[key] = {
      ...data,
      lastRun: new Date().toISOString(),
    };
  }

  /**
   * Mark a source+combo as exhausted — no more pages available.
   * Next run will reset to page 1 (fresh search after TTL expires).
   */
  exhaustCursor(source, city, category) {
    const key = this._cursorKey(source, city, category);
    const existing = this._cursors[key] || {};
    this._cursors[key] = { ...existing, exhausted: true, exhaustedAt: new Date().toISOString() };
  }

  /**
   * Clear cursor — force re-scrape from page 1 next run.
   */
  clearCursor(source, city, category) {
    delete this._cursors[this._cursorKey(source, city, category)];
  }

  /**
   * Summary of cursor state across all sources.
   */
  cursorStats() {
    const all       = Object.entries(this._cursors);
    const active    = all.filter(([, c]) => !c.exhausted).length;
    const exhausted = all.filter(([, c]) => c.exhausted).length;
    return { total: all.length, active, exhausted };
  }

  // ── URL-level memory (individual Maps business pages) ────────────────────────
  // Stored in Redis — fast O(1) lookup, shared across all worker processes.

  /**
   * Given an array of Maps business URLs, return only the ones not yet scraped.
   */
  async filterNewUrls(urls) {
    if (!this._redis || !urls?.length) return urls;
    try {
      const pipeline = this._redis.pipeline();
      for (const url of urls) pipeline.sismember(REDIS_KEY, this._normaliseUrl(url));
      const results = await pipeline.exec();
      return urls.filter((_, i) => results[i][1] === 0);
    } catch {
      return urls;  // Redis error — fall back to no filtering
    }
  }

  /**
   * Mark URLs as scraped in Redis.
   */
  async recordUrls(urls) {
    if (!this._redis || !urls?.length) return;
    try {
      const normalised = urls.map(u => this._normaliseUrl(u));
      await this._redis.sadd(REDIS_KEY, ...normalised);
    } catch {}
  }

  /**
   * How many unique URLs have been scraped.
   */
  async urlCount() {
    if (!this._redis) return 0;
    try { return await this._redis.scard(REDIS_KEY); } catch { return 0; }
  }

  _normaliseUrl(url) {
    // Strip dynamic params from Maps URLs so canonical form is stable
    try {
      const u = new URL(url);
      // Keep path only — query params on Maps URLs change between sessions
      return u.hostname + u.pathname;
    } catch {
      return url;
    }
  }

  // ── Convenience: full status dump ───────────────────────────────────────────

  async status() {
    const combo  = this.comboStats();
    const urlCnt = await this.urlCount();
    return {
      combos:  combo,
      urls:    urlCnt,
      stateFile: STATE_FILE,
    };
  }
}

module.exports = ScrapeMemory;
