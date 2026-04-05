'use strict';

/**
 * AutoRun — queues city × category grid jobs until target lead count is reached.
 *
 * Memory-aware: reads scrape_state.json on startup and skips combos that were
 * already successfully scraped. Each completed job updates the state file so
 * subsequent runs pick up only the gaps.
 *
 * Run: node scripts/autorun.js
 */

require('dotenv').config();

const { addBulk, getStats, getQueue, getConnection } = require('../queue');
const ScrapeMemory = require('../core/scrape_memory');
const GeoGrid      = require('../core/geo_grid');
const logger = require('../utils/logger');

// ── CONFIG ────────────────────────────────────────────────────────────────────

const TARGET      = parseInt(process.env.TARGET_LEADS  || '10000', 10);
const MAX_PER_JOB = parseInt(process.env.MAX_PER_JOB   || '20',    10);
const SOURCE      = process.env.SOURCE                 || 'leads';
const CHECK_EVERY = parseInt(process.env.CHECK_EVERY   || '15000',  10);

const CITIES = (process.env.CITIES || '').split(',').map(s => s.trim()).filter(Boolean);
const CATEGORIES = (process.env.CATEGORIES || '').split(',').map(s => s.trim()).filter(Boolean);

const DEFAULT_CITIES = [
  'Kelowna, BC', 'Vancouver, BC', 'Surrey, BC', 'Burnaby, BC', 'Richmond, BC',
  'Abbotsford, BC', 'Coquitlam, BC', 'Langley, BC', 'Kamloops, BC', 'Vernon, BC',
  'Penticton, BC', 'Prince George, BC', 'Nanaimo, BC', 'Victoria, BC', 'Chilliwack, BC',
  'Calgary, AB', 'Edmonton, AB', 'Red Deer, AB', 'Lethbridge, AB', 'Medicine Hat, AB',
  'Toronto, ON', 'Ottawa, ON', 'Mississauga, ON', 'Brampton, ON', 'Hamilton, ON',
  'London, ON', 'Markham, ON', 'Vaughan, ON', 'Kitchener, ON', 'Windsor, ON',
];

const DEFAULT_CATEGORIES = [
  // ── Trades & Home Services ─────────────────────────────────────────────────
  'dentist', 'plumber', 'electrician', 'HVAC contractor',
  'roofing contractor', 'landscaping', 'auto repair', 'mechanic',
  'cleaning service', 'pest control', 'attorney', 'accountant',
  'gym', 'restaurant', 'veterinarian', 'real estate agent',
  'handyman', 'junk removal', 'painter',
  'tree removal', 'stump grinding',
  'concrete contractor', 'fence installation', 'pressure washing',
  'septic tank service', 'well pump repair',
  'mobile welder', 'demolition contractor',
  'gutter installation', 'boat lift repair',
  'garage door repair', 'appliance repair', 'locksmith',
  'water damage restoration', 'fire damage restoration', 'mold remediation',

  // ── Automotive ────────────────────────────────────────────────────────────
  'mobile mechanic', 'mobile car detailer', 'roadside assistance',
  'used tire shop', 'auto body shop', 'window tinting',

  // ── Beauty & Wellness ─────────────────────────────────────────────────────
  'hair salon', 'nail salon', 'barber',
  'hair braider', 'eyelash technician', 'massage therapist',
  'makeup artist', 'personal trainer',
  'med spa', 'botox clinic', 'laser hair removal', 'cosmetic injector',

  // ── Rural & Agricultural ──────────────────────────────────────────────────
  'farrier', 'livestock services', 'land clearing',
  'firewood delivery', 'gravel delivery',

  // ── Events & Media ────────────────────────────────────────────────────────
  'DJ', 'party rentals', 'bounce house rental',
  'photographer', 'videographer',

  // ── Home & Property ───────────────────────────────────────────────────────
  'pool cleaning', 'dog daycare', 'babysitter',

  // ── Small business search qualifiers (find owner-operated shops) ──────────
  'repair LLC', 'mobile LLC',
];

const cities     = CITIES.length     ? CITIES     : DEFAULT_CITIES;
const categories = CATEGORIES.length ? CATEGORIES : DEFAULT_CATEGORIES;

// ── State ─────────────────────────────────────────────────────────────────────

let totalQueued = 0;
let stopped     = false;
let memory;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function queueCells(city, category) {
  const cells        = GeoGrid.generateCells(city);
  const pendingCells = memory.getPendingCells(city, category, cells);

  if (pendingCells.length === 0) {
    const pct = memory.getCoveragePercent(city, category, cells.length);
    logger.debug(`[AutoRun] Skip (${pct}% coverage complete) — ${category} in ${city}`);
    return 0;
  }

  const jobs = pendingCells.map(cell => ({
    type:       SOURCE === 'leads' ? 'leads' : SOURCE,
    location:   city,
    category,
    maxResults: MAX_PER_JOB,
    maxReviews: 0,
    cell:       { key: cell.key, lat: cell.lat, lng: cell.lng, zoom: cell.zoom },
  }));

  try {
    const added = await addBulk(jobs);
    totalQueued += added.length;
    logger.info(`[AutoRun] Queued ${added.length} cells — ${category} in ${city} (${pendingCells.length}/${cells.length} pending)`);
    return added.length;
  } catch (err) {
    logger.warn(`[AutoRun] Failed to queue cells for ${category} in ${city}: ${err.message}`);
    return 0;
  }
}

async function printStatus() {
  try {
    const stats    = await getStats();
    const est      = Math.round(stats.completed * MAX_PER_JOB * 0.6);
    const cellMem  = memory.cellStats();
    const coverage = cellMem.totalCells > 0
      ? `${cellMem.coveragePercent}% of ${cellMem.totalCells} cells`
      : 'no cell data yet';
    logger.info(
      `[AutoRun] Progress — cells_queued:${stats.waiting} active:${stats.active} ` +
      `done:${stats.completed} | ~${est} leads (target: ${TARGET}) | coverage: ${coverage}`
    );
    return { ...stats, estimatedLeads: est };
  } catch { return {}; }
}

// Watch for completed jobs and record them in memory
function watchCompletions() {
  const queue = getQueue();
  queue.on('completed', async (job, result) => {
    try {
      const { location, category, cell } = job.data;
      const count = result?.leads?.length || 0;
      if (location && category) {
        if (cell?.key) {
          memory.recordCell(location, category, cell.key, { resultCount: count });
        } else {
          memory.recordCombo(location, category, { resultCount: count, jobId: job.id });
        }
        memory.save();
        logger.debug(`[AutoRun] Memory updated: ${category} in ${location} cell=${cell?.key || 'n/a'} (+${count} results)`);
      }
    } catch {}
  });
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function run() {
  // Load persistent memory
  const redis = getConnection();
  memory = new ScrapeMemory(redis);
  const loaded = memory.load();

  const cellMem = memory.cellStats();
  logger.info(`[AutoRun] Memory: ${loaded ? 'loaded' : 'fresh start'} — ${cellMem.doneCells}/${cellMem.totalCells} cells done across ${cellMem.totalCombos} combos`);
  logger.info(`[AutoRun] Target: ${TARGET} leads`);
  logger.info(`[AutoRun] ${cities.length} cities × ${categories.length} categories = ${cities.length * categories.length} combos`);

  // Determine pending work across all city × category × cell combos
  let totalPendingCells = 0;
  for (const city of cities) {
    for (const cat of categories) {
      const cells   = GeoGrid.generateCells(city);
      const pending = memory.getPendingCells(city, cat, cells);
      totalPendingCells += pending.length;
    }
  }
  logger.info(`[AutoRun] Pending cells (not yet scraped): ${totalPendingCells}`);

  if (totalPendingCells === 0) {
    logger.info('[AutoRun] All cells already scraped. Nothing to queue.');
    logger.info('[AutoRun] To re-scrape everything: delete data/scrape_state.json');
    await shutdown();
    return;
  }

  // Watch completed jobs to update memory in real-time
  watchCompletions();

  // Queue all pending cells for each combo
  for (const city of cities) {
    if (stopped) break;
    for (const cat of categories) {
      if (stopped) break;
      await queueCells(city, cat);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  logger.info(`[AutoRun] Queued ${totalQueued} cell jobs. Monitoring…`);

  // Monitor until target reached
  const monitor = setInterval(async () => {
    const { estimatedLeads, active, waiting } = await printStatus();

    if (estimatedLeads >= TARGET) {
      logger.info(`[AutoRun] TARGET REACHED — ~${estimatedLeads} leads!`);
      clearInterval(monitor);
      await shutdown();
      process.exit(0);
    }

    if (active === 0 && waiting === 0) {
      logger.info('[AutoRun] Queue drained.');
      if (estimatedLeads < TARGET) {
        logger.warn(`[AutoRun] Only ~${estimatedLeads}/${TARGET} — add more cities to CITIES env var.`);
      }
      clearInterval(monitor);
      await shutdown();
      process.exit(estimatedLeads >= TARGET ? 0 : 1);
    }
  }, CHECK_EVERY);
}

async function shutdown() {
  try { const { shutdown: sd } = require('../queue'); await sd(); } catch {}
}

process.on('SIGINT',  () => { stopped = true; logger.info('[AutoRun] Stopping…'); process.exit(0); });
process.on('SIGTERM', () => { stopped = true; process.exit(0); });

run().catch(err => {
  logger.error(`[AutoRun] Fatal: ${err.message}`);
  process.exit(1);
});
