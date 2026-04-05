'use strict';

/**
 * Campaign Manager
 *
 * Ties together enrichment + email + SMS into named campaigns.
 * Tracks status per lead: pending → sent → opened → replied → converted
 *
 * Also handles:
 *   - Automatic follow-up sequencing (Day 1 → Day 3 → Day 7)
 *   - Unsubscribe/opt-out list
 *   - Campaign-level stats
 *   - Persistence via JSON file (no database needed)
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');
const { EmailEnricher } = require('../enrichment/email');
const { Mailer }        = require('./mailer');
const { SmsSender }     = require('./sms');
const { TemplateEngine } = require('./templates');

const DATA_DIR = path.join(__dirname, '..', 'data');

class CampaignManager {
  /**
   * @param {object} config
   *   mailerConfig:    object — passed to Mailer constructor
   *   smsConfig:       object — passed to SmsSender constructor
   *   enricherConfig:  object — passed to EmailEnricher constructor
   *   senderInfo:      { name, company, phone, email } — your identity in templates
   *   dataDir:         string — where to persist campaigns (default: ./data)
   */
  constructor(config = {}) {
    this.mailer     = new Mailer(config.mailerConfig    || {});
    this.sms        = new SmsSender(config.smsConfig    || {});
    this.enricher   = new EmailEnricher(config.enricherConfig || {});
    this.templates  = new TemplateEngine();
    this.sender     = config.senderInfo || {};
    this.dataDir    = config.dataDir || DATA_DIR;
    this.optOuts    = new Set();

    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    this._loadOptOuts();
  }

  // ── Create / load a campaign ──────────────────────────────────────────────

  /**
   * Create a new campaign from a leads array.
   *
   * @param {string} name       — campaign name
   * @param {Array}  leads      — array of lead objects
   * @param {object} opts
   *   emailTemplate: string   — template ID for emails
   *   smsTemplate:   string   — template ID for SMS (optional)
   *   channels:      ['email', 'sms'] — which channels to use
   *   sequence:      [{day: 0, template: '...'}, {day: 3, template: 'follow_up'}, ...]
   *
   * @returns {Campaign} campaign object
   */
  createCampaign(name, leads, opts = {}) {
    const id = `campaign_${Date.now()}`;
    const campaign = {
      id,
      name,
      createdAt:     new Date().toISOString(),
      channels:      opts.channels      || ['email'],
      emailTemplate: opts.emailTemplate || 'no_website_outreach',
      smsTemplate:   opts.smsTemplate   || 'no_website_intro',
      sequence:      opts.sequence      || [
        { day: 0, channel: 'email', template: opts.emailTemplate || 'no_website_outreach' },
        { day: 3, channel: 'email', template: 'follow_up' },
      ],
      leads: leads.map(lead => ({
        ...lead,
        _status:    'pending',  // pending → sent → opened → replied → converted → optout
        _sentAt:    null,
        _step:      0,          // which step in sequence
        _lastTouch: null,
        _notes:     '',
      })),
      stats: {
        total:      leads.length,
        pending:    leads.length,
        enriched:   0,
        sent:       0,
        failed:     0,
        opened:     0,
        replied:    0,
        converted:  0,
        optout:     0,
      },
    };

    this._saveCampaign(campaign);
    logger.info(`[Campaign] Created "${name}" with ${leads.length} leads`);
    return campaign;
  }

  loadCampaign(id) {
    const file = path.join(this.dataDir, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`Campaign not found: ${id}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  listCampaigns() {
    return fs.readdirSync(this.dataDir)
      .filter(f => f.endsWith('.json') && f !== 'optouts.json')
      .map(f => {
        const c = JSON.parse(fs.readFileSync(path.join(this.dataDir, f), 'utf8'));
        return { id: c.id, name: c.name, createdAt: c.createdAt, stats: c.stats };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ── Enrich leads in campaign ──────────────────────────────────────────────

  async enrichCampaign(campaignId, onProgress = null) {
    const campaign = this.loadCampaign(campaignId);
    logger.info(`[Campaign] Enriching ${campaign.name}...`);

    campaign.leads = await this.enricher.enrichBatch(
      campaign.leads,
      (done, total, email) => {
        if (email) campaign.stats.enriched++;
        onProgress?.(done, total, email);
      }
    );

    this._saveCampaign(campaign);
    logger.info(`[Campaign] Enrichment complete: ${campaign.stats.enriched} emails found`);
    return campaign;
  }

  // ── Run a campaign ────────────────────────────────────────────────────────

  /**
   * Send step 0 (initial outreach) to all pending leads in a campaign.
   * Call again later to send follow-ups (step 1, 2, etc.).
   */
  async runCampaign(campaignId, opts = {}) {
    const { dryRun = false, step = 0, onProgress = null } = opts;
    const campaign = this.loadCampaign(campaignId);

    const toContact = campaign.leads.filter(lead => {
      if (this.optOuts.has(normaliseEmail(lead.email)) || this.optOuts.has(normalisePhone(lead.phone))) return false;
      if (step === 0) return lead._status === 'pending';

      // Follow-up: only sent leads that haven't replied, on the right day
      if (lead._status !== 'sent' || lead._step !== step - 1) return false;
      const daysSince = daysBetween(lead._lastTouch, new Date());
      const seqStep   = campaign.sequence[step];
      if (!seqStep) return false;
      return daysSince >= seqStep.day - campaign.sequence[step - 1].day;
    });

    logger.info(`[Campaign] Running step ${step} for "${campaign.name}" — ${toContact.length} leads`);

    if (dryRun) {
      logger.info('[Campaign] DRY RUN — no messages will be sent');
      return { dryRun: true, wouldContact: toContact.length };
    }

    const seqStep = campaign.sequence[step];
    if (!seqStep) {
      logger.warn(`[Campaign] No sequence step ${step} defined`);
      return { error: 'No more steps in sequence' };
    }

    const results = { sent: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < toContact.length; i++) {
      const lead = toContact[i];

      try {
        const rendered = this.templates.render(
          seqStep.template,
          seqStep.channel,
          lead,
          this.sender
        );

        let result;
        if (seqStep.channel === 'sms') {
          result = await this.sms.send({ to: lead.phone, body: rendered.body, trackId: lead.name });
        } else {
          if (!lead.email) { results.skipped++; continue; }
          result = await this.mailer.send({
            to:      { name: lead.name, email: lead.email },
            subject: rendered.subject,
            body:    rendered.body,
            trackId: lead.name,
          });
        }

        // Update lead status in campaign
        const leadInCampaign = campaign.leads.find(l => l.name === lead.name && l.phone === lead.phone);
        if (leadInCampaign) {
          leadInCampaign._status    = result.success ? 'sent' : leadInCampaign._status;
          leadInCampaign._sentAt    = result.success ? new Date().toISOString() : leadInCampaign._sentAt;
          leadInCampaign._lastTouch = new Date().toISOString();
          leadInCampaign._step      = step;
        }

        if (result.success) {
          results.sent++;
          campaign.stats.sent++;
          campaign.stats.pending = Math.max(0, campaign.stats.pending - 1);
        } else if (result.error === 'DAILY_LIMIT_REACHED') {
          logger.warn('[Campaign] Daily limit reached — stopping for today');
          break;
        } else {
          results.failed++;
          campaign.stats.failed++;
        }

      } catch (err) {
        results.failed++;
        logger.error(`[Campaign] Error for ${lead.name}: ${err.message}`);
      }

      onProgress?.(i + 1, toContact.length, results);

      // Save progress every 10 sends
      if (i % 10 === 0) this._saveCampaign(campaign);
    }

    this._saveCampaign(campaign);
    logger.info(`[Campaign] Step ${step} done: ${results.sent} sent, ${results.failed} failed`);
    return results;
  }

  // ── Lead status updates ───────────────────────────────────────────────────

  markReplied(campaignId, leadName) {
    const campaign = this.loadCampaign(campaignId);
    const lead = campaign.leads.find(l => l.name === leadName);
    if (lead) { lead._status = 'replied'; campaign.stats.replied++; }
    this._saveCampaign(campaign);
  }

  markConverted(campaignId, leadName, notes = '') {
    const campaign = this.loadCampaign(campaignId);
    const lead = campaign.leads.find(l => l.name === leadName);
    if (lead) { lead._status = 'converted'; lead._notes = notes; campaign.stats.converted++; }
    this._saveCampaign(campaign);
  }

  // ── Opt-out handling ──────────────────────────────────────────────────────

  addOptOut(emailOrPhone) {
    const key = emailOrPhone.includes('@') ? normaliseEmail(emailOrPhone) : normalisePhone(emailOrPhone);
    if (key) {
      this.optOuts.add(key);
      this._saveOptOuts();
      logger.info(`[Campaign] Opt-out added: ${key}`);
    }
  }

  _loadOptOuts() {
    const file = path.join(this.dataDir, 'optouts.json');
    if (fs.existsSync(file)) {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      list.forEach(e => this.optOuts.add(e));
    }
  }

  _saveOptOuts() {
    fs.writeFileSync(path.join(this.dataDir, 'optouts.json'), JSON.stringify([...this.optOuts], null, 2));
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _saveCampaign(campaign) {
    const file = path.join(this.dataDir, `${campaign.id}.json`);
    fs.writeFileSync(file, JSON.stringify(campaign, null, 2));
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getCampaignStats(campaignId) {
    const c = this.loadCampaign(campaignId);
    const s = c.stats;
    return {
      ...s,
      replyRate:     s.sent     ? `${Math.round(s.replied    / s.sent * 100)}%` : '0%',
      convertRate:   s.replied  ? `${Math.round(s.converted  / s.replied * 100)}%` : '0%',
      emailsCovered: c.leads.filter(l => l.email).length,
      smsCovered:    c.leads.filter(l => l.phone).length,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseEmail(e) { return (e || '').toLowerCase().trim(); }
function normalisePhone(p) { return (p || '').replace(/\D/g, ''); }
function daysBetween(date1, date2) {
  if (!date1) return 999;
  return Math.floor((new Date(date2) - new Date(date1)) / 86400000);
}

module.exports = { CampaignManager };
