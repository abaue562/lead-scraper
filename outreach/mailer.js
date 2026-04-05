'use strict';

/**
 * Email Sender
 *
 * Supports:
 *   - SMTP (Gmail, Outlook, custom) via nodemailer
 *   - SendGrid API (recommended for volume)
 *
 * Features:
 *   - Per-message delay to avoid spam filters
 *   - Daily send limit enforcement
 *   - Bounce/unsubscribe tracking via reply detection
 *   - HTML + plain text dual format
 *
 * Recommended sending limits to stay out of spam:
 *   Gmail free:   150/day  (warm up: start at 20/day, +10/day each week)
 *   Gmail Workspace: 500/day
 *   SendGrid free: 100/day (no warmup needed)
 *   SendGrid paid: 40,000+/day
 */

const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');

const DEFAULT_DELAY_MS  = 60000;   // 1 minute between emails (safe default)
const DEFAULT_DAILY_MAX = 50;      // start conservative

class Mailer {
  /**
   * @param {object} config
   *   provider:   'smtp' | 'sendgrid'
   *
   *   SMTP config (provider = 'smtp'):
   *   host:       string   (e.g. 'smtp.gmail.com')
   *   port:       number   (e.g. 587)
   *   secure:     boolean  (true for port 465)
   *   user:       string   (your email address)
   *   pass:       string   (app password, NOT your login password)
   *
   *   SendGrid config (provider = 'sendgrid'):
   *   apiKey:     string
   *   fromEmail:  string
   *   fromName:   string
   *
   *   Limits:
   *   delayMs:    number   (ms between sends, default 60000)
   *   dailyMax:   number   (max emails per day, default 50)
   */
  constructor(config = {}) {
    this.config   = config;
    this.provider = config.provider || 'smtp';
    this.delayMs  = config.delayMs  || DEFAULT_DELAY_MS;
    this.dailyMax = config.dailyMax || DEFAULT_DAILY_MAX;

    this._transport = null;
    this._sentToday = 0;
    this._lastReset = new Date().toDateString();
    this._lastSent  = 0;

    this.stats = { sent: 0, failed: 0, skipped: 0 };
  }

  get isConfigured() {
    return this.provider === 'sendgrid'
      ? Boolean(this.config.apiKey)
      : Boolean(this.config.user && this.config.pass);
  }

  // ── Send a single email ───────────────────────────────────────────────────

  /**
   * Send one email.
   *
   * @param {object} msg
   *   to:       string | { name, email }
   *   subject:  string
   *   body:     string (plain text — auto-converts to HTML)
   *   replyTo:  string (optional)
   *   trackId:  string (optional identifier for tracking)
   *
   * @returns {{ success: boolean, messageId?: string, error?: string }}
   */
  async send(msg) {
    if (!this.isConfigured) {
      return { success: false, error: 'Mailer not configured' };
    }

    this._resetDailyCounter();
    if (this._sentToday >= this.dailyMax) {
      this.stats.skipped++;
      logger.warn(`[Mailer] Daily limit reached (${this.dailyMax}). Skipping.`);
      return { success: false, error: 'DAILY_LIMIT_REACHED' };
    }

    // Throttle
    const timeSinceLast = Date.now() - this._lastSent;
    if (this._lastSent > 0 && timeSinceLast < this.delayMs) {
      const wait = this.delayMs - timeSinceLast;
      logger.debug(`[Mailer] Throttling — waiting ${Math.round(wait / 1000)}s`);
      await new Promise(r => setTimeout(r, wait));
    }

    const toAddr   = typeof msg.to === 'string' ? msg.to : `${msg.to.name} <${msg.to.email}>`;
    const htmlBody = textToHtml(msg.body);

    try {
      let result;

      if (this.provider === 'sendgrid') {
        result = await this._sendViaSendGrid({ ...msg, to: toAddr, html: htmlBody });
      } else {
        result = await this._sendViaSmtp({ ...msg, to: toAddr, html: htmlBody });
      }

      this.stats.sent++;
      this._sentToday++;
      this._lastSent = Date.now();
      logger.info(`[Mailer] ✓ Sent to ${toAddr} | Subject: "${msg.subject}"`);
      return { success: true, ...result };

    } catch (err) {
      this.stats.failed++;
      logger.error(`[Mailer] Failed to send to ${toAddr}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Batch send with progress ──────────────────────────────────────────────

  /**
   * Send to a list of leads using a rendered template.
   *
   * @param {Array}    leads     — array of lead objects
   * @param {Function} renderer  — fn(lead) → { subject, body }
   * @param {Function} onProgress — optional callback(done, total, result)
   *
   * @returns {{ sent, failed, skipped }}
   */
  async sendBatch(leads, renderer, onProgress = null) {
    logger.info(`[Mailer] Starting batch send to ${leads.length} leads`);
    const results = { sent: 0, failed: 0, skipped: 0, results: [] };

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      if (!lead.email) {
        results.skipped++;
        onProgress?.(i + 1, leads.length, { skipped: true, reason: 'no_email' });
        continue;
      }

      try {
        const rendered = renderer(lead);
        const result   = await this.send({
          to:      { name: lead.name, email: lead.email },
          subject: rendered.subject,
          body:    rendered.body,
          trackId: lead.maps_url || lead.name,
        });

        results.results.push({ lead: lead.name, email: lead.email, ...result });
        if (result.success) results.sent++;
        else if (result.error === 'DAILY_LIMIT_REACHED') {
          logger.warn('[Mailer] Daily limit hit — stopping batch');
          break;
        } else results.failed++;

      } catch (err) {
        results.failed++;
        logger.error(`[Mailer] Batch error for ${lead.name}: ${err.message}`);
      }

      onProgress?.(i + 1, leads.length, results.results[results.results.length - 1]);
    }

    logger.info(`[Mailer] Batch complete: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`);
    return results;
  }

  // ── SMTP ──────────────────────────────────────────────────────────────────

  async _getTransport() {
    if (this._transport) return this._transport;

    const { host, port, secure, user, pass } = this.config;

    // Auto-detect common providers
    let transportConfig;
    if (!host || host.includes('gmail')) {
      transportConfig = {
        service: 'gmail',
        auth: { user, pass },
      };
    } else if (host.includes('outlook') || host.includes('hotmail')) {
      transportConfig = {
        service: 'hotmail',
        auth: { user, pass },
      };
    } else {
      transportConfig = {
        host, port: port || 587,
        secure: secure || false,
        auth: { user, pass },
      };
    }

    this._transport = nodemailer.createTransport(transportConfig);
    await this._transport.verify();
    logger.info(`[Mailer] SMTP transport ready (${host || 'gmail'})`);
    return this._transport;
  }

  async _sendViaSmtp({ to, subject, body, html, replyTo }) {
    const transport = await this._getTransport();
    const info = await transport.sendMail({
      from:    this.config.user,
      to,
      subject,
      text:    body,
      html,
      replyTo: replyTo || this.config.user,
    });
    return { messageId: info.messageId };
  }

  // ── SendGrid ──────────────────────────────────────────────────────────────

  async _sendViaSendGrid({ to, subject, body, html, replyTo }) {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(this.config.apiKey);

    const msg = {
      to,
      from:    { email: this.config.fromEmail, name: this.config.fromName || '' },
      subject,
      text:    body,
      html,
      replyTo: replyTo || this.config.fromEmail,
    };

    const [response] = await sgMail.send(msg);
    return { statusCode: response.statusCode };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _resetDailyCounter() {
    const today = new Date().toDateString();
    if (today !== this._lastReset) {
      this._sentToday = 0;
      this._lastReset = today;
    }
  }

  getStats() {
    return {
      ...this.stats,
      sentToday: this._sentToday,
      dailyMax:  this.dailyMax,
      remaining: Math.max(0, this.dailyMax - this._sentToday),
    };
  }

  // ── Test connection ───────────────────────────────────────────────────────

  async testConnection() {
    if (!this.isConfigured) return { ok: false, error: 'Not configured' };
    try {
      if (this.provider === 'smtp') {
        const t = await this._getTransport();
        await t.verify();
      }
      return { ok: true, provider: this.provider };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

// ── Plain text → basic HTML ───────────────────────────────────────────────────

function textToHtml(text) {
  if (!text) return '';
  return `<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
${text
  .split('\n\n')
  .map(para => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
  .join('\n')}
</body></html>`;
}

module.exports = { Mailer };
