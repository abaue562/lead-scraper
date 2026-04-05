'use strict';

const express = require('express');
const { addJob, addBulk, waitForJob, getJob, getStats } = require('../queue');
const ProxyManager = require('../proxy');
const metrics      = require('../utils/metrics');
const logger       = require('../utils/logger');
const config       = require('../config');

const router = express.Router();

// ── GET /health ───────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
  });
});

// ── GET /search?q=...&region=...&async=true ───────────────────────────────────
//
// Synchronous (default): waits for result, returns JSON
// Async:                 returns { jobId } immediately

router.get('/search', async (req, res) => {
  const { q, url, region, async: isAsync } = req.query;

  if (!q && !url) {
    return res.status(400).json({ error: 'Provide q= (query) or url= parameter' });
  }

  try {
    const job = await addJob({ query: q, url, region });

    if (isAsync === 'true') {
      return res.json({ jobId: job.id, status: 'queued', query: q || url });
    }

    // Synchronous wait
    const result = await waitForJob(job.id, config.api.timeout);
    return res.json(result);

  } catch (err) {
    logger.error(`/search error: ${err.message}`);
    return res.status(err.message.includes('timed out') ? 504 : 500).json({
      query:   q || url,
      results: [],
      source:  'browser',
      success: false,
      error:   err.message,
    });
  }
});

// ── POST /jobs — batch scraping ───────────────────────────────────────────────
//
// Body: { jobs: [{ query?, url?, region?, priority? }] }
// Returns: { queued, jobIds }

router.post('/jobs', async (req, res) => {
  const { jobs } = req.body;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'Body must include non-empty jobs array' });
  }

  if (jobs.length > 500) {
    return res.status(400).json({ error: 'Max 500 jobs per batch request' });
  }

  // Validate each job
  for (const j of jobs) {
    if (!j.query && !j.url) {
      return res.status(400).json({ error: 'Each job must have query or url' });
    }
  }

  try {
    const queued = await addBulk(jobs);
    return res.status(202).json({
      queued: queued.length,
      jobIds: queued.map(j => j.id),
    });
  } catch (err) {
    logger.error(`/jobs batch error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id — job status + result ───────────────────────────────────────

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: `Job ${req.params.id} not found` });
    }

    const state    = await job.getState();
    const progress = job.progress || 0;

    if (state === 'completed') {
      const result = job.returnvalue;
      return res.json({
        id: job.id,
        state,
        result: typeof result === 'string' ? JSON.parse(result) : result,
      });
    }

    if (state === 'failed') {
      return res.json({
        id:     job.id,
        state,
        error:  job.failedReason,
        attempts: job.attemptsMade,
      });
    }

    return res.json({ id: job.id, state, progress });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id/wait — long-poll until complete ─────────────────────────────

router.get('/jobs/:id/wait', async (req, res) => {
  const timeout = Math.min(parseInt(req.query.timeout || '60000', 10), 120000);
  try {
    const result = await waitForJob(req.params.id, timeout);
    return res.json(result);
  } catch (err) {
    return res.status(err.message.includes('timed out') ? 504 : 500).json({
      error: err.message,
    });
  }
});

// ── GET /queue/stats ──────────────────────────────────────────────────────────

router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await getStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /metrics ──────────────────────────────────────────────────────────────

router.get('/metrics', (req, res) => {
  const snap = metrics.getSnapshot();
  return res.json(snap);
});

// ── GET /proxies ──────────────────────────────────────────────────────────────

router.get('/proxies', (req, res) => {
  const pm = new ProxyManager(config.proxies);
  return res.json({
    count: pm.count,
    proxies: pm.getStats(),
  });
});


// ── GET /leads/recent — pull all leads from recently completed jobs ───────────
// Used by the dashboard to sync results from autorun / background jobs.
// ?since=<jobId>  — only return jobs completed after this ID (for pagination)
// ?limit=<n>      — max jobs to scan (default 200)

router.get('/leads/recent', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '200', 10), 500);
  const since  = parseInt(req.query.since || '0', 10);

  try {
    const { getQueue } = require('../queue');
    const queue  = getQueue();
    const jobs   = await queue.getCompleted(0, limit - 1);

    const allLeads     = [];
    const allReviewers = [];
    let   maxId        = since;

    for (const job of jobs) {
      const id = parseInt(job.id, 10);
      if (id <= since) continue; // already seen
      if (id > maxId) maxId = id;

      const result = job.returnvalue;
      if (!result) continue;

      const r = typeof result === 'string' ? JSON.parse(result) : result;
      if (r.leads?.length)     allLeads.push(...r.leads);
      if (r.reviewers?.length) allReviewers.push(...r.reviewers);
    }

    return res.json({
      leads:     allLeads,
      reviewers: allReviewers,
      count:     allLeads.length,
      maxJobId:  maxId,
      scanned:   jobs.length,
    });
  } catch (err) {
    logger.error(`/leads/recent error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /leads — structured lead scraping (primary endpoint) ─────────────────
//
// Body: { location, category, source?, maxResults?, maxReviews?, region?, async? }
// Sources: google_maps | yellow_pages | yelp | leads (multi) | scrapingdog | serpapi
//
// Returns: { leads[], reviewers[], source, success, elapsed }

router.post('/leads', async (req, res) => {
  const {
    location,
    category,
    source     = 'google_maps',
    maxResults = 20,
    maxReviews = 0,
    region     = null,
    coordinates = null,
    async: isAsync,
  } = req.body;

  if (!location || !category) {
    return res.status(400).json({ error: 'location and category are required' });
  }

  try {
    const job = await addJob({
      type: source,
      location,
      category,
      maxResults: parseInt(maxResults, 10),
      maxReviews: parseInt(maxReviews, 10),
      region,
      coordinates,
    });

    if (isAsync === true || req.query.async === 'true') {
      return res.json({ jobId: job.id, status: 'queued', source, query: `${category} in ${location}` });
    }

    const result = await waitForJob(job.id, config.api.timeout);
    return res.json(result);

  } catch (err) {
    logger.error(`/leads error: ${err.message}`);
    return res.status(500).json({
      leads: [], reviewers: [], source,
      success: false, error: err.message,
    });
  }
});

// ── POST /grid — city-wide sweep using GPS coordinate grid ───────────────────
//
// Breaks the city into a grid and queues one job per cell.
// Each cell can return up to 120 results.
// Returns: { gridPlan, jobIds, estimatedLeads }

router.post('/grid', async (req, res) => {
  const {
    location,
    category,
    source      = 'google_maps',
    cellSize    = 0.05,
    maxCells    = 100,
    maxPerCell  = 20,
    maxReviews  = 0,
  } = req.body;

  if (!location || !category) {
    return res.status(400).json({ error: 'location and category are required' });
  }

  try {
    const { buildGridPlan, gridToJobs } = require('../utils/gridTiler');

    const plan = await buildGridPlan(location, category, { cellSize, maxCells });
    const jobs = gridToJobs(plan.cells, category, location, source, {
      maxResultsPerCell: maxPerCell,
      maxReviews,
    });

    const queued = await addBulk(jobs);

    return res.json({
      query:          `${category} in ${location}`,
      source,
      gridPlan: {
        cells:        plan.totalCells,
        cellSizeDeg:  cellSize,
        estimatedMax: plan.estimatedMax,
        bounds:       plan.bounds,
      },
      queued:   queued.length,
      jobIds:   queued.map(j => j.id),
      message:  `Poll GET /jobs/:id for each job, or GET /queue/stats to monitor progress`,
    });

  } catch (err) {
    logger.error(`/grid error: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /grid/estimate — preview grid without queuing ──────────────────────────

router.get('/grid/estimate', async (req, res) => {
  const { location, cellSize = 0.05, maxCells = 200 } = req.query;

  if (!location) {
    return res.status(400).json({ error: 'location required' });
  }

  try {
    const { buildGridPlan, estimateThroughput } = require('../utils/gridTiler');
    const plan    = await buildGridPlan(location, 'test', { cellSize: parseFloat(cellSize), maxCells: parseInt(maxCells) });
    const speed1  = estimateThroughput(1, 20);
    const speed5  = estimateThroughput(5, 30);

    return res.json({
      location,
      cells:          plan.totalCells,
      cellSizeDeg:    parseFloat(cellSize),
      estimatedMax:   plan.estimatedMax,
      bounds:         plan.bounds,
      throughput: {
        '1_worker_20_concurrency':  speed1,
        '5_workers_30_concurrency': speed5,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// ── POST /admin/config — update runtime config from dashboard ─────────────────
// Updates API keys, proxies, concurrency in memory without restart.

router.post('/admin/config', (req, res) => {
  const { scrapingdog, serpapi, captchaKey, captchaService, nopechaKey, flareSolverrUrl, enableAudio, audioBackend, proxies, concurrency, maxRetries } = req.body;
  const cfg = require('../config');

  if (scrapingdog      !== undefined) cfg.apis.scrapingdog         = scrapingdog;
  if (serpapi          !== undefined) cfg.apis.serpapi             = serpapi;
  if (captchaKey       !== undefined) cfg.captcha.apiKey           = captchaKey;
  if (captchaService   !== undefined) cfg.captcha.service          = captchaService;
  if (nopechaKey       !== undefined) cfg.captcha.nopechaKey       = nopechaKey;
  if (flareSolverrUrl  !== undefined) cfg.captcha.flareSolverrUrl  = flareSolverrUrl;
  if (enableAudio      !== undefined) cfg.captcha.enableAudio      = enableAudio;
  if (audioBackend     !== undefined) cfg.captcha.audioBackend     = audioBackend;
  if (concurrency      !== undefined) cfg.worker.concurrency       = parseInt(concurrency, 10);
  if (maxRetries       !== undefined) cfg.scraper.maxRetries       = parseInt(maxRetries, 10);

  // Reinitialise proxy manager with new proxy list
  if (proxies !== undefined) {
    const list = proxies.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
    cfg.proxies = list;
    const ProxyManager = require('../proxy');
    const pm = new ProxyManager(list);
    logger.info(`[Config] Proxies updated: ${list.length} entries`);
  }

  logger.info('[Config] Runtime config updated via dashboard');
  res.json({ success: true, applied: Object.keys(req.body) });
});

// ── GET /admin/config — read current runtime config (keys masked) ─────────────

router.get('/admin/config', (req, res) => {
  const cfg = require('../config');
  const mask = v => v ? v.slice(0,4) + "…" + v.slice(-4) : "";
  res.json({
    scrapingdog:    cfg.apis?.scrapingdog   ? mask(cfg.apis.scrapingdog)   : "",
    serpapi:        cfg.apis?.serpapi       ? mask(cfg.apis.serpapi)       : "",
    captchaService: cfg.captcha?.service    || "2captcha",
    captchaKey:     cfg.captcha?.apiKey     ? mask(cfg.captcha.apiKey)     : "",
    proxyCount:     (cfg.proxies||[]).length,
    concurrency:    cfg.worker?.concurrency || 20,
    maxRetries:     cfg.scraper?.maxRetries || 3,
  });
});


// ── Outreach endpoints ────────────────────────────────────────────────────────

// POST /outreach/enrich — find emails for leads missing them
router.post('/outreach/enrich', async (req, res) => {
  const { leads = [], hunterKey, apolloKey, snovKey } = req.body;
  if (!leads.length) return res.status(400).json({ error: 'leads array required' });
  try {
    const { EmailEnricher } = require('../enrichment/email');
    const enricher = new EmailEnricher({ hunterKey, apolloKey, snovKey });
    const enriched = await enricher.enrichBatch(leads);
    const found    = enriched.filter(l => l.email).length - leads.filter(l => l.email).length;
    return res.json({ leads: enriched, newEmailsFound: found, stats: enricher.getStats() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /outreach/templates — list available templates
router.get('/outreach/templates', (req, res) => {
  const { TemplateEngine } = require('../outreach/templates');
  const engine = new TemplateEngine();
  res.json({ templates: engine.listAll() });
});

// POST /outreach/preview — preview a rendered template
router.post('/outreach/preview', (req, res) => {
  const { templateId, channel = 'email', lead, sender } = req.body;
  try {
    const { TemplateEngine } = require('../outreach/templates');
    const engine   = new TemplateEngine();
    const rendered = lead
      ? engine.render(templateId, channel, lead, sender || {})
      : engine.preview(templateId, channel);
    return res.json(rendered);
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// POST /outreach/campaigns — create a campaign
router.post('/outreach/campaigns', (req, res) => {
  const { name, leads, emailTemplate, smsTemplate, channels } = req.body;
  if (!name || !leads?.length) return res.status(400).json({ error: 'name and leads required' });
  try {
    const { CampaignManager } = require('../outreach/campaign');
    const cfg = require('../config');
    const mgr = new CampaignManager({
      mailerConfig:   cfg.outreach?.mailer   || {},
      smsConfig:      cfg.outreach?.sms      || {},
      enricherConfig: cfg.outreach?.enricher || {},
      senderInfo:     cfg.outreach?.sender   || {},
    });
    const campaign = mgr.createCampaign(name, leads, { emailTemplate, smsTemplate, channels });
    return res.json({ id: campaign.id, name: campaign.name, stats: campaign.stats });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /outreach/campaigns — list all campaigns
router.get('/outreach/campaigns', (req, res) => {
  try {
    const { CampaignManager } = require('../outreach/campaign');
    const mgr = new CampaignManager();
    return res.json({ campaigns: mgr.listCampaigns() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /outreach/campaigns/:id/run — execute a campaign step
router.post('/outreach/campaigns/:id/run', async (req, res) => {
  const { step = 0, dryRun = false } = req.body;
  try {
    const { CampaignManager } = require('../outreach/campaign');
    const cfg = require('../config');
    const mgr = new CampaignManager({
      mailerConfig:  cfg.outreach?.mailer  || {},
      smsConfig:     cfg.outreach?.sms     || {},
      senderInfo:    cfg.outreach?.sender  || {},
    });
    const results = await mgr.runCampaign(req.params.id, { step, dryRun });
    return res.json(results);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /outreach/campaigns/:id/stats
router.get('/outreach/campaigns/:id/stats', (req, res) => {
  try {
    const { CampaignManager } = require('../outreach/campaign');
    const mgr   = new CampaignManager();
    const stats = mgr.getCampaignStats(req.params.id);
    return res.json(stats);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /outreach/test — test mailer connection
router.post('/outreach/test', async (req, res) => {
  try {
    const { Mailer } = require('../outreach/mailer');
    const mailer = new Mailer(req.body);
    const result = await mailer.testConnection();
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});


// ── Integration endpoints ────────────────────────────────────────────────────

// POST /integrations/score — score and sort leads
router.post('/integrations/score', (req, res) => {
  const { leads = [] } = req.body;
  if (!leads.length) return res.status(400).json({ error: 'leads array required' });
  try {
    const { scoreLeads, getScoreStats } = require('../enrichment/scorer');
    const scored = scoreLeads(leads);
    return res.json({ leads: scored, stats: getScoreStats(scored) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /integrations/hubspot — push leads to HubSpot
router.post('/integrations/hubspot', async (req, res) => {
  const { leads = [], accessToken, createDeal = false } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
  if (!leads.length) return res.status(400).json({ error: 'leads array required' });
  try {
    const { HubSpotIntegration } = require('../integrations/hubspot');
    const hs      = new HubSpotIntegration(accessToken);
    const results = await hs.pushBatch(leads, { createDeal });
    return res.json({ results, stats: hs.getStats() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /integrations/hubspot/test
router.post('/integrations/hubspot/test', async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
  try {
    const { HubSpotIntegration } = require('../integrations/hubspot');
    const result = await new HubSpotIntegration(accessToken).testConnection();
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /integrations/gohighlevel — push leads to GHL
router.post('/integrations/gohighlevel', async (req, res) => {
  const { leads = [], apiKey, locationId, createOpportunity = false, pipelineId } = req.body;
  if (!apiKey || !locationId) return res.status(400).json({ error: 'apiKey and locationId required' });
  if (!leads.length) return res.status(400).json({ error: 'leads array required' });
  try {
    const { GoHighLevelIntegration } = require('../integrations/gohighlevel');
    const ghl = new GoHighLevelIntegration(apiKey, locationId);
    const stats = await ghl.pushBatch(leads, { createOpportunity, pipelineId });
    return res.json({ stats });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// POST /integrations/gohighlevel/test
router.post('/integrations/gohighlevel/test', async (req, res) => {
  const { apiKey, locationId } = req.body;
  if (!apiKey || !locationId) return res.status(400).json({ error: 'apiKey and locationId required' });
  try {
    const { GoHighLevelIntegration } = require('../integrations/hubspot');
    const result = await new GoHighLevelIntegration(apiKey, locationId).testConnection();
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── GET /leads/enriched — serve enriched_leads.json written by enrich_emails.js ─

router.get('/leads/enriched', (_req, res) => {
  const fs   = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '../data/enriched_leads.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'enriched_leads.json not found — run: node scripts/enrich_emails.js' });
  }
  try {
    const leads = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json({ leads, total: leads.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
