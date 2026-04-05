'use strict';

/**
 * SMS Outreach via Twilio
 *
 * Sends cold SMS messages to leads with phone numbers.
 *
 * Free trial: $15 credit (about 150 SMS)
 * Paid: ~$0.0075/message (US)
 *
 * IMPORTANT — legal requirements:
 *   - Always include opt-out instructions (STOP to unsubscribe)
 *   - Do not send before 8am or after 9pm in the recipient's timezone
 *   - Identify yourself in every message
 *   - The templates in templates.js already include these
 *
 * Sending limits to avoid carrier blocks:
 *   - Max 200 SMS/day per number when starting out
 *   - Spread sends across business hours (9am–7pm)
 *   - 1+ minute delay between messages (already enforced)
 */

const logger = require('../utils/logger');

const DEFAULT_DELAY_MS  = 90000;   // 90 seconds between SMS
const DEFAULT_DAILY_MAX = 75;      // conservative start

class SmsSender {
  /**
   * @param {object} config
   *   accountSid : string — Twilio Account SID
   *   authToken  : string — Twilio Auth Token
   *   fromNumber : string — Your Twilio number (+1XXXXXXXXXX)
   *   delayMs    : number — ms between sends (default 90000)
   *   dailyMax   : number — max SMS per day (default 75)
   */
  constructor(config = {}) {
    this.config   = config;
    this.delayMs  = config.delayMs  || DEFAULT_DELAY_MS;
    this.dailyMax = config.dailyMax || DEFAULT_DAILY_MAX;

    this._client    = null;
    this._sentToday = 0;
    this._lastReset = new Date().toDateString();
    this._lastSent  = 0;

    this.stats = { sent: 0, failed: 0, skipped: 0 };
  }

  get isConfigured() {
    return Boolean(this.config.accountSid && this.config.authToken && this.config.fromNumber);
  }

  _getClient() {
    if (this._client) return this._client;
    const twilio = require('twilio');
    this._client = twilio(this.config.accountSid, this.config.authToken);
    return this._client;
  }

  // ── Send single SMS ───────────────────────────────────────────────────────

  async send({ to, body, trackId }) {
    if (!this.isConfigured) return { success: false, error: 'Not configured' };

    const phone = normalisePhone(to);
    if (!phone) return { success: false, error: 'Invalid phone number' };

    this._resetDailyCounter();
    if (this._sentToday >= this.dailyMax) {
      this.stats.skipped++;
      return { success: false, error: 'DAILY_LIMIT_REACHED' };
    }

    // Check business hours (9am–7pm)
    const hour = new Date().getHours();
    if (hour < 9 || hour >= 19) {
      logger.warn(`[SMS] Outside business hours (${hour}:00) — skipping`);
      return { success: false, error: 'OUTSIDE_HOURS' };
    }

    // Throttle
    const timeSinceLast = Date.now() - this._lastSent;
    if (this._lastSent > 0 && timeSinceLast < this.delayMs) {
      await new Promise(r => setTimeout(r, this.delayMs - timeSinceLast));
    }

    try {
      const client  = this._getClient();
      const message = await client.messages.create({
        body,
        from: this.config.fromNumber,
        to:   phone,
        statusCallback: this.config.statusCallbackUrl,
      });

      this.stats.sent++;
      this._sentToday++;
      this._lastSent = Date.now();
      logger.info(`[SMS] ✓ Sent to ${phone} | SID: ${message.sid}`);
      return { success: true, sid: message.sid, status: message.status };

    } catch (err) {
      this.stats.failed++;
      logger.error(`[SMS] Failed to ${phone}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Batch send ────────────────────────────────────────────────────────────

  async sendBatch(leads, renderer, onProgress = null) {
    const withPhone = leads.filter(l => l.phone);
    logger.info(`[SMS] Starting batch: ${withPhone.length} leads with phone numbers`);
    const results = { sent: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < withPhone.length; i++) {
      const lead    = withPhone[i];
      const rendered = renderer(lead);

      const result = await this.send({
        to:      lead.phone,
        body:    rendered.body,
        trackId: lead.name,
      });

      if (result.success) results.sent++;
      else if (result.error === 'DAILY_LIMIT_REACHED') break;
      else if (result.error === 'OUTSIDE_HOURS') {
        logger.info('[SMS] Pausing until business hours');
        break;
      } else results.failed++;

      onProgress?.(i + 1, withPhone.length, result);
    }

    return results;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    return {
      ...this.stats,
      sentToday: this._sentToday,
      dailyMax:  this.dailyMax,
      remaining: Math.max(0, this.dailyMax - this._sentToday),
    };
  }

  _resetDailyCounter() {
    const today = new Date().toDateString();
    if (today !== this._lastReset) {
      this._sentToday = 0;
      this._lastReset = today;
    }
  }
}

function normalisePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

module.exports = { SmsSender };
