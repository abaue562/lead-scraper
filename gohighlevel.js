'use strict';

/**
 * GoHighLevel (GHL) CRM Integration
 *
 * The most popular CRM for digital marketing agencies and local service businesses.
 * Pushes leads as Contacts and optionally as Opportunities in a pipeline.
 *
 * Get API key: app.gohighlevel.com → Settings → API Keys
 * Docs: developers.gohighlevel.com
 *
 * What gets created per lead:
 *   Contact: name, phone, email, address, tags, custom fields
 *   Opportunity: optional deal in your pipeline
 *   Note: scrape metadata
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const GHL_BASE = 'https://services.leadconnectorhq.com';

class GoHighLevelIntegration {
  /**
   * @param {string} apiKey      - GHL API key
   * @param {string} locationId  - Your GHL Location (sub-account) ID
   */
  constructor(apiKey, locationId) {
    this.apiKey     = apiKey;
    this.locationId = locationId;
    this.stats      = { created: 0, updated: 0, failed: 0 };
  }

  get isConfigured() { return Boolean(this.apiKey && this.locationId); }

  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type':  'application/json',
      'Version':       '2021-07-28',
    };
  }

  async _request(method, path, data = null) {
    try {
      const resp = await axios({
        method, url: `${GHL_BASE}${path}`,
        headers: this._headers(),
        data,
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(msg);
    }
  }

  // ── Push a single lead ──────────────────────────────────────────────────

  async pushLead(lead, opts = {}) {
    if (!this.isConfigured) return { success: false, error: 'Not configured' };

    const {
      tags           = ['scraped', lead.category, lead.has_website === 'Yes' ? 'has-website' : 'no-website'],
      pipelineId     = null,
      pipelineStage  = null,
      createOpportunity = false,
      source         = 'LeadGen Pro',
    } = opts;

    try {
      // ── 1. Upsert Contact ────────────────────────────────────────────────
      const contactId = await this._upsertContact(lead, tags, source);

      // ── 2. Add Note ──────────────────────────────────────────────────────
      if (contactId) {
        await this._addNote(contactId, lead).catch(() => {});
      }

      // ── 3. Create Opportunity ────────────────────────────────────────────
      let opportunityId = null;
      if (createOpportunity && contactId && pipelineId) {
        opportunityId = await this._createOpportunity(lead, contactId, pipelineId, pipelineStage)
          .catch(() => null);
      }

      this.stats.created++;
      return { success: true, contactId, opportunityId };

    } catch (err) {
      this.stats.failed++;
      logger.error(`[GHL] Push failed for ${lead.name}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Batch push ──────────────────────────────────────────────────────────

  async pushBatch(leads, opts = {}, onProgress = null) {
    logger.info(`[GHL] Pushing ${leads.length} leads to GoHighLevel`);

    for (let i = 0; i < leads.length; i++) {
      const result = await this.pushLead(leads[i], opts);
      onProgress?.(i + 1, leads.length, result);
      await new Promise(r => setTimeout(r, 200));  // GHL rate limit: ~5 req/sec
    }

    logger.info(`[GHL] Done: ${this.stats.created} created, ${this.stats.failed} failed`);
    return this.stats;
  }

  // ── Contact ──────────────────────────────────────────────────────────────

  async _upsertContact(lead, tags, source) {
    const [first, last] = splitName(lead.name);

    const payload = {
      locationId:  this.locationId,
      firstName:   first,
      lastName:    last,
      name:        lead.name        || '',
      phone:       normalisePhone(lead.phone),
      email:       lead.email       || '',
      address1:    extractStreet(lead.address),
      city:        extractCity(lead.address),
      state:       extractState(lead.address),
      postalCode:  extractZip(lead.address),
      website:     lead.website     || '',
      source,
      tags:        tags.filter(Boolean),
      customFields: [
        { key: 'google_rating',      field_value: lead.rating        || '' },
        { key: 'review_count',       field_value: lead.review_count  || '' },
        { key: 'business_category',  field_value: lead.category      || '' },
        { key: 'has_website',        field_value: lead.has_website   || 'No' },
        { key: 'maps_url',           field_value: lead.maps_url      || '' },
        { key: 'scrape_source',      field_value: lead.source        || '' },
        { key: 'scrape_date',        field_value: new Date().toLocaleDateString() },
      ],
    };

    // Search for existing contact by phone or email
    if (lead.phone || lead.email) {
      try {
        const query = lead.email || normalisePhone(lead.phone);
        const search = await this._request('GET',
          `/contacts/?locationId=${this.locationId}&query=${encodeURIComponent(query)}&limit=1`
        );
        if (search?.contacts?.length > 0) {
          const id = search.contacts[0].id;
          await this._request('PUT', `/contacts/${id}`, payload);
          this.stats.updated++;
          return id;
        }
      } catch {}
    }

    const resp = await this._request('POST', '/contacts/', payload);
    return resp?.contact?.id || resp?.id;
  }

  // ── Note ─────────────────────────────────────────────────────────────────

  async _addNote(contactId, lead) {
    const body = [
      `Scraped: ${new Date().toLocaleDateString()} via LeadGen Pro`,
      `Source: ${lead.source || 'scraper'}`,
      `Rating: ${lead.rating || 'N/A'} ⭐ (${lead.review_count || 0} reviews)`,
      `Website: ${lead.website || 'NONE — no website found'}`,
      lead.maps_url ? `Google Maps: ${lead.maps_url}` : '',
    ].filter(Boolean).join('\n');

    await this._request('POST', `/contacts/${contactId}/notes`, { body });
  }

  // ── Opportunity ───────────────────────────────────────────────────────────

  async _createOpportunity(lead, contactId, pipelineId, stageId) {
    const payload = {
      title:      `${lead.name} — ${lead.category}`,
      contactId,
      pipelineId,
      pipelineStageId: stageId,
      status:     'open',
      monetaryValue: 0,
      source:     'LeadGen Pro',
    };

    const resp = await this._request('POST', '/opportunities/', payload);
    return resp?.opportunity?.id || resp?.id;
  }

  // ── Pipelines list ────────────────────────────────────────────────────────

  async getPipelines() {
    try {
      const resp = await this._request('GET', `/opportunities/pipelines?locationId=${this.locationId}`);
      return resp?.pipelines || [];
    } catch { return []; }
  }

  // ── Stats + test ─────────────────────────────────────────────────────────

  getStats() { return this.stats; }

  async testConnection() {
    try {
      await this._request('GET', `/locations/${this.locationId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitName(name) {
  if (!name) return ['', ''];
  const apost = name.match(/^([A-Z][a-z]+)'s/);
  if (apost) return [apost[1], ''];
  const words = name.split(/\s+/);
  if (words.length === 1) return [name, ''];
  return [words[0], words.slice(1).join(' ')];
}
function normalisePhone(p) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  return p;
}
function extractStreet(addr) {
  if (!addr) return '';
  return addr.split(',')[0]?.trim() || '';
}
function extractCity(addr) {
  if (!addr) return '';
  const p = addr.split(',');
  return p.length >= 3 ? p[p.length - 3].trim() : p.length >= 2 ? p[p.length - 2].trim() : '';
}
function extractState(addr) {
  if (!addr) return '';
  const m = addr.match(/,\s*([A-Z]{2})\s*\d{5}/);
  return m ? m[1] : '';
}
function extractZip(addr) {
  if (!addr) return '';
  const m = addr.match(/\b(\d{5})\b/);
  return m ? m[1] : '';
}

module.exports = { GoHighLevelIntegration };
