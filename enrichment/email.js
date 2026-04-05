'use strict';

/**
 * Email Enrichment Module
 *
 * Finds contact emails for leads that have a website but no email address.
 * Tries sources in order from fastest/cheapest to slowest:
 *
 *   1. Website scrape — reads contact/about pages, extracts mailto: links
 *   2. Common pattern guessing — info@, contact@, hello@, name@domain
 *   3. Hunter.io API — 25 free/month, $0.0005 after
 *   4. Apollo.io API — 50 free/month
 *   5. Snov.io API — 50 free/month
 *
 * All paid APIs have free tiers large enough for small campaigns.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const logger  = require('../utils/logger');

// ── Email patterns to try before hitting paid APIs ────────────────────────────

const COMMON_PREFIXES = [
  'info', 'contact', 'hello', 'hi', 'hey', 'sales', 'support',
  'admin', 'office', 'mail', 'enquiries', 'inquiries', 'team',
  'help', 'service', 'booking', 'appointments', 'quote',
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Contact page paths to try (ordered by likelihood)
const CONTACT_PATHS = [
  '/contact', '/contact-us', '/about', '/about-us',
  '/reach-us', '/get-in-touch', '/connect', '/team',
];

// ── Main enricher class ───────────────────────────────────────────────────────

class EmailEnricher {
  /**
   * @param {object} opts
   *   hunterKey    : string — Hunter.io API key (25 free/month)
   *   apolloKey    : string — Apollo.io API key (50 free/month)
   *   snovKey      : string — Snov.io API key   (50 free/month)
   *   scrapeWebsite: boolean — scrape websites directly (default true)
   *   timeout      : number — request timeout ms (default 8000)
   *   concurrency  : number — parallel enrichment jobs (default 5)
   */
  constructor(opts = {}) {
    this.hunterKey    = opts.hunterKey    || null;
    this.apolloKey    = opts.apolloKey    || null;
    this.snovKey      = opts.snovKey      || null;
    this.scrapeWeb    = opts.scrapeWebsite !== false;
    this.timeout      = opts.timeout      || 8000;
    this.maxConc      = opts.concurrency  || 5;

    this.stats = { scraped: 0, pattern: 0, hunter: 0, apollo: 0, snov: 0, failed: 0 };
  }

  // ── Enrich a single lead ──────────────────────────────────────────────────

  /**
   * Find email for a lead that has a website but no email.
   * Returns the email string or null.
   */
  async enrichLead(lead) {
    if (lead.email) return lead.email;           // already have it
    if (!lead.website) return null;              // nothing to work with

    const website = normaliseUrl(lead.website);
    const domain  = getDomain(website);

    if (!domain) return null;

    logger.debug(`[Enricher] Looking up email for ${domain}`);

    // ── 1. Scrape website contact pages ─────────────────────────────────
    if (this.scrapeWeb) {
      const email = await this._scrapeWebsite(website);
      if (email) { this.stats.scraped++; return email; }
    }

    // ── 2. Hunter.io ─────────────────────────────────────────────────────
    if (this.hunterKey) {
      const email = await this._hunterDomainSearch(domain, lead.name);
      if (email) { this.stats.hunter++; return email; }
    }

    // ── 3. Apollo.io ─────────────────────────────────────────────────────
    if (this.apolloKey) {
      const email = await this._apolloSearch(domain, lead.name);
      if (email) { this.stats.apollo++; return email; }
    }

    // ── 4. Snov.io ───────────────────────────────────────────────────────
    if (this.snovKey) {
      const email = await this._snovSearch(domain, lead.name);
      if (email) { this.stats.snov++; return email; }
    }

    this.stats.failed++;
    return null;
  }

  // ── Batch enrich array of leads ──────────────────────────────────────────

  /**
   * Enrich all leads missing emails.
   * Returns updated leads array with emails filled in where found.
   * Processes in parallel up to this.maxConc at a time.
   */
  async enrichBatch(leads, onProgress = null) {
    const toEnrich = leads.filter(l => !l.email && l.website);
    logger.info(`[Enricher] Enriching ${toEnrich.length} leads (${leads.length - toEnrich.length} already have email)`);

    const results = new Map();
    let done = 0;

    // Process in chunks of maxConc
    for (let i = 0; i < toEnrich.length; i += this.maxConc) {
      const chunk = toEnrich.slice(i, i + this.maxConc);
      const found = await Promise.allSettled(chunk.map(l => this.enrichLead(l)));

      for (let j = 0; j < chunk.length; j++) {
        const email = found[j].status === 'fulfilled' ? found[j].value : null;
        if (email) results.set(chunk[j].website || chunk[j].name, email);
        done++;
        onProgress?.(done, toEnrich.length, email);
      }

      // Polite delay between chunks
      if (i + this.maxConc < toEnrich.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Merge back into leads array
    return leads.map(lead => {
      if (!lead.email && lead.website) {
        const key   = lead.website || lead.name;
        const email = results.get(key);
        return email ? { ...lead, email } : lead;
      }
      return lead;
    });
  }

  // ── Source implementations ────────────────────────────────────────────────

  async _scrapeWebsite(website) {
    const domain = getDomain(website);

    // Try contact/about pages in order
    const urlsToTry = [website, ...CONTACT_PATHS.map(p => `https://${domain}${p}`)];

    for (const url of urlsToTry) {
      try {
        const resp = await axios.get(url, {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          },
          maxRedirects: 3,
        });

        const html    = resp.data;
        const emails  = extractEmails(html, domain);

        if (emails.length > 0) {
          // Prefer contact/info/hello@ over others
          const preferred = rankEmails(emails);
          logger.debug(`[Enricher] Found ${emails.length} email(s) on ${url}`);
          return preferred;
        }
      } catch {
        // 404, redirect, timeout — continue to next path
      }
    }

    return null;
  }

  async _hunterDomainSearch(domain, businessName) {
    try {
      const resp = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: {
          domain,
          api_key: this.hunterKey,
          limit:   5,
          type:    'personal',
        },
        timeout: 10000,
      });

      const emails = resp.data?.data?.emails || [];

      // First try to find a decision-maker (owner, manager, director)
      const dm = emails.find(e =>
        /owner|president|ceo|director|manager|founder|principal/i.test(e.position || '')
      );
      if (dm?.value) return dm.value;

      // Fall back to first email
      if (emails[0]?.value) return emails[0].value;

      // Try generic email formats from Hunter
      const generic = resp.data?.data?.pattern;
      if (generic && businessName) {
        const firstName = businessName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
        if (firstName) return `${firstName}@${domain}`;
      }

    } catch (e) {
      if (e.response?.status === 429) logger.warn('[Hunter] Rate limited — monthly quota may be exhausted');
      else logger.debug(`[Hunter] Error: ${e.message}`);
    }

    return null;
  }

  async _apolloSearch(domain, businessName) {
    try {
      const resp = await axios.post('https://api.apollo.io/v1/mixed_people/search', {
        api_key:              this.apolloKey,
        q_organization_domains: domain,
        person_titles:        ['owner', 'president', 'ceo', 'director', 'manager', 'founder'],
        page:                 1,
        per_page:             5,
      }, { timeout: 10000 });

      const people = resp.data?.people || [];
      const dm     = people.find(p => p.email);
      return dm?.email || null;

    } catch (e) {
      logger.debug(`[Apollo] Error: ${e.message}`);
      return null;
    }
  }

  async _snovSearch(domain, businessName) {
    try {
      // Snov.io domain search
      const resp = await axios.get('https://api.snov.io/v2/domain-emails-with-info', {
        params: {
          access_token: this.snovKey,
          domain,
          type:         'all',
          limit:        5,
        },
        timeout: 10000,
      });

      const emails = resp.data?.emails || [];
      const ranked = emails
        .filter(e => e.email)
        .sort((a, b) => {
          // Prefer verified emails
          if (a.emailStatus === 'valid' && b.emailStatus !== 'valid') return -1;
          if (b.emailStatus === 'valid' && a.emailStatus !== 'valid') return 1;
          return 0;
        });

      return ranked[0]?.email || null;

    } catch (e) {
      logger.debug(`[Snov] Error: ${e.message}`);
      return null;
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    const total = Object.values(this.stats).reduce((s, v) => s + v, 0);
    const found = total - this.stats.failed;
    return {
      ...this.stats,
      total,
      foundRate: total ? `${Math.round(found / total * 100)}%` : 'n/a',
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseUrl(url) {
  if (!url) return '';
  if (!url.startsWith('http')) url = 'https://' + url;
  return url.replace(/\/$/, '');
}

function getDomain(url) {
  try {
    return new URL(normaliseUrl(url)).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function extractEmails(html, domain) {
  if (!html) return [];
  const $ = cheerio.load(html);

  const found = new Set();

  // Mailto links (most reliable)
  $('a[href^="mailto:"]').each((_, el) => {
    const email = $(el).attr('href').replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (isValidEmail(email)) found.add(email);
  });

  // Text content matching
  const text = $.text();
  const matches = text.match(EMAIL_RE) || [];
  for (const m of matches) {
    const email = m.toLowerCase();
    if (isValidEmail(email)) found.add(email);
  }

  // Filter out obviously wrong ones (images, scripts, noreply)
  return [...found].filter(e =>
    !e.includes('noreply') &&
    !e.includes('no-reply') &&
    !e.includes('example.com') &&
    !e.endsWith('.png') &&
    !e.endsWith('.jpg')
  );
}

function rankEmails(emails) {
  // Prefer common contact prefixes
  const PRIORITY = ['info', 'contact', 'hello', 'hi', 'sales', 'office'];
  for (const prefix of PRIORITY) {
    const match = emails.find(e => e.startsWith(prefix + '@'));
    if (match) return match;
  }
  return emails[0];
}

function isValidEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) &&
    email.length < 80 && email.includes('.');
}

module.exports = { EmailEnricher, extractEmails, getDomain };
