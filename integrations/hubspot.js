'use strict';

/**
 * HubSpot CRM Integration
 *
 * Pushes scraped leads directly into HubSpot as Contacts + Companies.
 * Links them with a Deal if desired.
 *
 * Free CRM tier supports full API — no paid plan needed.
 * Get your API key: app.hubspot.com → Settings → Integrations → API Key
 *
 * What gets created per lead:
 *   Contact:  first_name, last_name (guessed), phone, email
 *   Company:  name, phone, address, website, industry (from category)
 *   Note:     rating, review count, Maps URL, source, scraped date
 *   Deal:     optional — creates an open deal in your pipeline
 */

const axios  = require('axios');
const logger = require('../utils/logger');

// HubSpot category → industry mapping
const INDUSTRY_MAP = {
  'plumber':            'CONSTRUCTION',
  'electrician':        'CONSTRUCTION',
  'roofing contractor': 'CONSTRUCTION',
  'HVAC contractor':    'CONSTRUCTION',
  'landscaping':        'CONSTRUCTION',
  'dentist':            'HEALTH_AND_HUMAN_SERVICES',
  'veterinarian':       'HEALTH_AND_HUMAN_SERVICES',
  'gym':                'HEALTH_AND_HUMAN_SERVICES',
  'restaurant':         'RESTAURANTS',
  'hair salon':         'PERSONAL_CARE_SERVICES',
  'nail salon':         'PERSONAL_CARE_SERVICES',
  'massage therapist':  'PERSONAL_CARE_SERVICES',
  'attorney':           'LEGAL_SERVICES',
  'accountant':         'ACCOUNTING',
  'real estate agent':  'REAL_ESTATE',
  'auto repair':        'AUTOMOTIVE_AND_TRANSPORT',
  'mechanic':           'AUTOMOTIVE_AND_TRANSPORT',
  'cleaning service':   'FACILITIES',
  'pest control':       'FACILITIES',
};

class HubSpotIntegration {
  /**
   * @param {string} accessToken - HubSpot Private App access token (recommended)
   *   OR apiKey - Legacy API key (less preferred)
   */
  constructor(accessToken) {
    this.token   = accessToken;
    this.baseUrl = 'https://api.hubapi.com';
    this.stats   = { created: 0, updated: 0, failed: 0, skipped: 0 };
  }

  get isConfigured() { return Boolean(this.token); }

  _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async _request(method, path, data = null) {
    try {
      const resp = await axios({
        method, url: `${this.baseUrl}${path}`,
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
    const { createDeal = false, pipelineId = null, ownerId = null, tags = [] } = opts;

    if (!this.isConfigured) return { success: false, error: 'Not configured' };

    const domain = getDomain(lead.website);

    try {
      // ── 1. Create or update Company ──────────────────────────────────────
      let companyId = null;
      try {
        companyId = await this._upsertCompany(lead, domain, tags);
      } catch (e) {
        logger.warn(`[HubSpot] Company upsert failed for ${lead.name}: ${e.message}`);
      }

      // ── 2. Create or update Contact ──────────────────────────────────────
      let contactId = null;
      if (lead.email || lead.phone) {
        try {
          contactId = await this._upsertContact(lead, companyId, ownerId);
        } catch (e) {
          logger.warn(`[HubSpot] Contact upsert failed for ${lead.name}: ${e.message}`);
        }
      }

      // ── 3. Add a note with scrape details ────────────────────────────────
      if (companyId) {
        await this._addNote(companyId, lead, 'company').catch(() => {});
      }

      // ── 4. Optionally create a Deal ──────────────────────────────────────
      let dealId = null;
      if (createDeal && (companyId || contactId)) {
        dealId = await this._createDeal(lead, companyId, contactId, pipelineId, ownerId)
          .catch(() => null);
      }

      this.stats.created++;
      return { success: true, companyId, contactId, dealId };

    } catch (err) {
      this.stats.failed++;
      logger.error(`[HubSpot] Push failed for ${lead.name}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Batch push ──────────────────────────────────────────────────────────

  async pushBatch(leads, opts = {}, onProgress = null) {
    logger.info(`[HubSpot] Pushing ${leads.length} leads`);
    const results = [];

    for (let i = 0; i < leads.length; i++) {
      const result = await this.pushLead(leads[i], opts);
      results.push({ lead: leads[i].name, ...result });
      onProgress?.(i + 1, leads.length, result);
      // HubSpot rate limit: 10 req/sec
      await new Promise(r => setTimeout(r, 120));
    }

    logger.info(`[HubSpot] Done: ${this.stats.created} created, ${this.stats.failed} failed`);
    return results;
  }

  // ── Company ──────────────────────────────────────────────────────────────

  async _upsertCompany(lead, domain, tags) {
    const props = {
      name:        lead.name        || '',
      phone:       lead.phone       || '',
      address:     lead.address     || '',
      city:        extractCity(lead.address),
      website:     lead.website     || '',
      industry:    INDUSTRY_MAP[lead.category] || 'OTHER',
      description: `Scraped via LeadGen Pro | Category: ${lead.category} | Rating: ${lead.rating || 'N/A'} (${lead.review_count || 0} reviews) | Source: ${lead.source || 'scraper'}`,
    };

    if (domain) {
      // Try to find existing company by domain
      try {
        const search = await this._request('POST', '/crm/v3/objects/companies/search', {
          filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
          limit: 1,
        });

        if (search.results?.length > 0) {
          const id = search.results[0].id;
          await this._request('PATCH', `/crm/v3/objects/companies/${id}`, { properties: props });
          this.stats.updated++;
          return id;
        }
      } catch {}

      props.domain = domain;
    }

    const resp = await this._request('POST', '/crm/v3/objects/companies', { properties: props });
    return resp.id;
  }

  // ── Contact ──────────────────────────────────────────────────────────────

  async _upsertContact(lead, companyId, ownerId) {
    const [firstName, ...rest] = guessName(lead.name);
    const props = {
      firstname:    firstName || lead.name,
      lastname:     rest.join(' ') || '',
      phone:        lead.phone || '',
      email:        lead.email || '',
      company:      lead.name  || '',
      leadsource:   'DIRECT_TRAFFIC',
    };

    if (ownerId) props.hubspot_owner_id = ownerId;

    let contactId;

    if (lead.email) {
      try {
        const search = await this._request('POST', '/crm/v3/objects/contacts/search', {
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: lead.email }] }],
          limit: 1,
        });
        if (search.results?.length > 0) {
          contactId = search.results[0].id;
          await this._request('PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: props });
          this.stats.updated++;
        }
      } catch {}
    }

    if (!contactId) {
      const resp = await this._request('POST', '/crm/v3/objects/contacts', { properties: props });
      contactId = resp.id;
    }

    // Associate contact ↔ company
    if (companyId) {
      await this._request('PUT',
        `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`,
        {}
      ).catch(() => {});
    }

    return contactId;
  }

  // ── Note ─────────────────────────────────────────────────────────────────

  async _addNote(objectId, lead, objectType) {
    const body = [
      `📍 Scraped: ${new Date().toLocaleDateString()}`,
      `📂 Source: ${lead.source || 'LeadGen Pro'}`,
      `⭐ Rating: ${lead.rating || 'N/A'} (${lead.review_count || 0} reviews)`,
      `🌐 Website: ${lead.website || 'NONE'}`,
      lead.maps_url ? `📌 Maps: ${lead.maps_url}` : '',
      `📞 Phone: ${lead.phone || 'N/A'}`,
      `📧 Email: ${lead.email || 'N/A'}`,
    ].filter(Boolean).join('\n');

    await this._request('POST', '/crm/v3/objects/notes', {
      properties: {
        hs_note_body:      body,
        hs_timestamp:      Date.now(),
        hs_attachment_ids: '',
      },
      associations: [{
        to:   { id: objectId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: objectType === 'company' ? 190 : 202 }],
      }],
    });
  }

  // ── Deal ─────────────────────────────────────────────────────────────────

  async _createDeal(lead, companyId, contactId, pipelineId, ownerId) {
    const props = {
      dealname:   `${lead.name} — Website/SEO Opportunity`,
      dealstage:  'appointmentscheduled',
      amount:     '',
      pipeline:   pipelineId || 'default',
      closedate:  new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    if (ownerId) props.hubspot_owner_id = ownerId;

    const resp = await this._request('POST', '/crm/v3/objects/deals', { properties: props });
    const dealId = resp.id;

    if (companyId) {
      await this._request('PUT',
        `/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, {}
      ).catch(() => {});
    }
    if (contactId) {
      await this._request('PUT',
        `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {}
      ).catch(() => {});
    }

    return dealId;
  }

  // ── Stats + test ─────────────────────────────────────────────────────────

  getStats() { return this.stats; }

  async testConnection() {
    try {
      await this._request('GET', '/crm/v3/objects/contacts?limit=1');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url?.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
}
function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',');
  return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
}
function guessName(businessName) {
  if (!businessName) return ['', ''];
  const apost = businessName.match(/^([A-Z][a-z]+)'s/);
  if (apost) return [apost[1], 'Owner'];
  const words = businessName.split(/\s+/);
  if (words.length >= 2 && /^[A-Z][a-z]+$/.test(words[0]) && /^[A-Z][a-z]+$/.test(words[1])) {
    return [words[0], words[1]];
  }
  return [businessName, ''];
}

module.exports = { HubSpotIntegration };
