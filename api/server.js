'use strict';

require('dotenv').config();

const express = require('express');
const routes  = require('./routes');
const logger  = require('../utils/logger');
const config  = require('../config');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// ── CORS — allow the LeadGen dashboard (artifact or localhost) to connect ─────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID
app.use((req, _res, next) => {
  req.id = Math.random().toString(36).slice(2, 10);
  next();
});

// Per-IP rate limiting (simple in-memory, swap for Redis-based in production)
const _windows = new Map();

app.use((req, res, next) => {
  const ip      = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const now     = Date.now();
  const winMs   = 60_000;
  const max     = config.api.rateLimit;

  let entry = _windows.get(ip) || { count: 0, resetAt: now + winMs };
  if (now > entry.resetAt) entry = { count: 0, resetAt: now + winMs };
  entry.count++;
  _windows.set(ip, entry);

  res.setHeader('X-RateLimit-Limit',     max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
  res.setHeader('X-RateLimit-Reset',     new Date(entry.resetAt).toISOString());

  if (entry.count > max) {
    return res.status(429).json({ error: 'Too many requests — slow down' });
  }
  next();
});

// HTTP request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms) [${req.id}]`);
  });
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-Request-Id',           req.id);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/', routes);

// 404
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    endpoints: [
      'GET  /health',
      'GET  /search?q=...&region=...&async=true',
      'POST /jobs           { jobs: [...] }',
      'GET  /jobs/:id',
      'GET  /jobs/:id/wait',
      'GET  /queue/stats',
      'GET  /metrics',
      'GET  /proxies',
    ],
  });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error [${req.id}]: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = config.api.port;

app.listen(PORT, () => {
  logger.info(`LeadGen Scraper API listening on http://localhost:${PORT}`);
  logger.info(`Rate limit: ${config.api.rateLimit} req/min`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM — API shutting down');
  process.exit(0);
});

module.exports = app;
