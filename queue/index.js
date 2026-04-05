'use strict';

const { Queue, QueueEvents, Job } = require('bullmq');
const Redis  = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let _connection;
let _queue;
let _events;

// ── Redis connection (shared across queue + workers) ─────────────────────────

function getConnection() {
  if (!_connection) {
    _connection = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,    // Required by BullMQ
      enableReadyCheck:     false,
      lazyConnect:          true,
    });
    _connection.on('error',   err => logger.error(`Redis error: ${err.message}`));
    _connection.on('connect', ()  => logger.debug('Redis connected'));
  }
  return _connection;
}

// ── Queue ────────────────────────────────────────────────────────────────────

function getQueue() {
  if (!_queue) {
    _queue = new Queue('scrape', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts:         config.queue.maxRetries,
        backoff:          { type: 'exponential', delay: config.queue.backoffDelay },
        removeOnComplete: { count: 2000, age: 60 * 60 },    // keep 1hr
        removeOnFail:     { count: 500,  age: 24 * 60 * 60 },
        timeout:          config.queue.jobTimeout,
      },
    });
    logger.info('BullMQ scrape queue initialised');
  }
  return _queue;
}

// ── Queue Events (for awaiting job completion) ────────────────────────────────

function getQueueEvents() {
  if (!_events) {
    _events = new QueueEvents('scrape', { connection: getConnection() });
  }
  return _events;
}

// ── Public helpers ───────────────────────────────────────────────────────────

/**
 * Add a single scrape job to the queue.
 *
 * @param {object} data  - { url?, query?, region?, priority? }
 * @returns BullMQ Job
 */
async function addJob(data) {
  const queue = getQueue();
  const job   = await queue.add('scrape', data, {
    priority: data.priority || 0,
  });
  logger.debug(`Job ${job.id} queued: ${data.url || data.query}`);
  return job;
}

/**
 * Add multiple jobs atomically (bulk).
 * @param {Array} jobs  - array of data objects
 * @returns array of Jobs
 */
async function addBulk(jobs) {
  const queue = getQueue();
  return queue.addBulk(
    jobs.map(data => ({
      name: 'scrape',
      data,
      opts: { priority: data.priority || 0 },
    }))
  );
}

/**
 * Wait for a specific job to complete or fail.
 * Resolves with the result, rejects on failure.
 *
 * @param {string} jobId
 * @param {number} timeoutMs
 */
function waitForJob(jobId, timeoutMs = config.api.timeout) {
  return new Promise((resolve, reject) => {
    const events = getQueueEvents();
    let   timer;

    const onComplete = ({ jobId: id, returnvalue }) => {
      if (id !== jobId) return;
      cleanup();
      try {
        resolve(typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue);
      } catch {
        resolve(returnvalue);
      }
    };

    const onFailed = ({ jobId: id, failedReason }) => {
      if (id !== jobId) return;
      cleanup();
      reject(new Error(failedReason || 'Job failed'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      events.off('completed', onComplete);
      events.off('failed',    onFailed);
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    events.on('completed', onComplete);
    events.on('failed',    onFailed);
  });
}

/**
 * Fetch a job by ID and return its current state + data.
 */
async function getJob(jobId) {
  const queue = getQueue();
  return Job.fromId(queue, jobId);
}

/**
 * Queue size snapshot.
 */
async function getStats() {
  const queue = getQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

/**
 * Gracefully shut down queue connections.
 */
async function shutdown() {
  if (_queue)      { await _queue.close();   _queue    = null; }
  if (_events)     { await _events.close();  _events   = null; }
  if (_connection) { await _connection.quit(); _connection = null; }
}

module.exports = {
  getConnection,
  getQueue,
  addJob,
  addBulk,
  waitForJob,
  getJob,
  getStats,
  shutdown,
};
