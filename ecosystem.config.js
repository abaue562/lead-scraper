/**
 * PM2 Ecosystem Config
 *
 * Manages all processes on a single machine or across multiple.
 *
 * Usage:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --env production
 *
 *   pm2 status          — see all processes
 *   pm2 logs            — tail all logs
 *   pm2 monit           — live dashboard
 *   pm2 reload all      — zero-downtime reload
 *   pm2 delete all      — stop everything
 *
 * Scale workers:
 *   pm2 scale worker +3         — add 3 more workers
 *   pm2 scale worker 10         — set to exactly 10 workers
 */

module.exports = {
  apps: [
    // ── API Server (1 instance, or cluster mode for multi-core) ────────────
    // ── API Server ─────────────────────────────────────────────────────────
    {
      name:        'leadscan-api',
      script:      './api/server.js',
      cwd:         '/opt/leadscan',
      instances:   1,
      exec_mode:   'fork',
      watch:       false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV:   'production',
        PORT:       3002,
        REDIS_URL:  'redis://localhost:6379',
        LOG_LEVEL:  'info',
        HEADLESS:   'true',
      },
      error_file:  '/var/log/leadscan/api-error.log',
      out_file:    '/var/log/leadscan/api-out.log',
      merge_logs:  true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ── Worker (Playwright browser + queue consumer) ────────────────────────
    {
      name:        'leadscan-worker',
      script:      './workers/worker.js',
      cwd:         '/opt/leadscan',
      instances:   3,
      exec_mode:   'fork',
      watch:       false,
      max_memory_restart: '1500M',
      kill_timeout: 15000,
      env_production: {
        NODE_ENV:            'production',
        REDIS_URL:           'redis://localhost:6379',
        WORKER_CONCURRENCY:  5,
        LOG_LEVEL:           'info',
        HEADLESS:            'true',
        BLOCK_RESOURCES:     'true',
        STALE_DAYS:          '45',
      },
      error_file:  '/var/log/leadscan/worker-error.log',
      out_file:    '/var/log/leadscan/worker-out.log',
      merge_logs:  true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
