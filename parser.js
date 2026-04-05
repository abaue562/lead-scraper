'use strict';

/**
 * HTML Contact Parser
 *
 * Extracts structured contact data from raw HTML:
 *   - Email addresses (mailto: links + regex scan)
 *   - Phone numbers (tel: links + regex scan)
 *   - Street address (schema.org JSON-LD, meta tags, regex)
 *   - Business hours
 *   - Page title
 *   - Social links
 */

const JUNK_EMAILS = /noreply|no-reply|donotreply|example\.com|sentry|@wix\.|@squarespace|@godaddy|privacy@|support@.*\.(io|co)$|unsubscribe|webmaster|postmaster|info@info|test@/i;

const EMAIL_RE  = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE  = /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g;

// Address patterns: "123 Main St, City, ST 12345"
const ADDR_RE   = /\d{1,5}\s+[A-Za-z0-9\s,\.#\-]{5,50},\s*[A-Za-z\s]{2,30},\s*[A-Z]{2}[\s,]*\d{5}(-\d{4})?/;

/**
 * Parse contact data out of raw HTML.
 *
 * @param {string} html  - raw page HTML
 * @param {string} url   - page URL (used for context)
 * @returns {{ emails, phones, address, hours, title, socialLinks }}
 */
function parseHTML(html, url = '') {
  if (!html) return emptyResult();

  const emails     = extractEmails(html);
  const phones     = extractPhones(html);
  const address    = extractAddress(html);
  const hours      = extractHours(html);
  const title      = extractTitle(html, url);
  const socialLinks = extractSocialLinks(html);

  return { emails, phones, address, hours, title, socialLinks };
}

// ── Email extraction ──────────────────────────────────────────────────────────

function extractEmails(html) {
  const found = new Set();

  // 1. mailto: links (highest confidence)
  const mailtoRe = /href=["']mailto:([^"'?\s]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html)) !== null) {
    const email = m[1].toLowerCase().trim();
    if (isValidEmail(email)) found.add(email);
  }

  // 2. Plain-text regex scan
  const plainMatches = html.match(EMAIL_RE) || [];
  for (const email of plainMatches) {
    const e = email.toLowerCase().trim();
    if (isValidEmail(e)) found.add(e);
  }

  // Sort: shorter emails tend to be more "official" (info@domain.com vs long obfuscated ones)
  return [...found]
    .filter(e => !JUNK_EMAILS.test(e))
    .sort((a, b) => a.length - b.length)
    .slice(0, 5);
}

function isValidEmail(email) {
  if (!email || email.length > 80) return false;
  // Must have exactly one @
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length < 1) return false;
  // Domain must have at least one dot
  if (!domain.includes('.')) return false;
  // TLD must be 2-6 chars
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || tld.length > 6) return false;
  return true;
}

// ── Phone extraction ──────────────────────────────────────────────────────────

function extractPhones(html) {
  const found = new Set();

  // 1. tel: links (highest confidence)
  const telRe = /href=["']tel:([+\d\s\-().]+)/gi;
  let m;
  while ((m = telRe.exec(html)) !== null) {
    const raw = m[1].trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) found.add(normalisePhone(raw));
  }

  // 2. Plain-text regex scan
  const plainMatches = html.match(PHONE_RE) || [];
  for (const p of plainMatches) {
    const digits = p.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11) found.add(normalisePhone(p));
  }

  return [...found].slice(0, 3);
}

function normalisePhone(raw) {
  // Strip leading country code for US/CA numbers
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1);
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

// ── Address extraction ────────────────────────────────────────────────────────

function extractAddress(html) {
  // 1. Schema.org JSON-LD
  const jsonldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const addr = findAddressInSchema(data);
      if (addr) return addr;
    } catch {}
  }

  // 2. Regex on page text
  const addrMatch = html.replace(/<[^>]+>/g, ' ').match(ADDR_RE);
  if (addrMatch) return addrMatch[0].replace(/\s+/g, ' ').trim();

  return '';
}

function findAddressInSchema(obj) {
  if (!obj || typeof obj !== 'object') return '';
  // Direct address object
  if (obj.streetAddress) {
    const parts = [obj.streetAddress, obj.addressLocality, obj.addressRegion, obj.postalCode]
      .filter(Boolean);
    return parts.join(', ');
  }
  // Nested address
  if (obj.address) return findAddressInSchema(obj.address);
  // Array
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findAddressInSchema(item);
      if (r) return r;
    }
  }
  // Walk object keys
  for (const val of Object.values(obj)) {
    if (typeof val === 'object') {
      const r = findAddressInSchema(val);
      if (r) return r;
    }
  }
  return '';
}

// ── Hours extraction ──────────────────────────────────────────────────────────

function extractHours(html) {
  // Schema.org openingHours
  const ohRe = /"openingHours"\s*:\s*"([^"]+)"/i;
  const m = html.match(ohRe);
  if (m) return m[1];

  // openingHoursSpecification
  const ohsRe = /"openingHoursSpecification"/i;
  if (ohsRe.test(html)) return 'See website';

  return '';
}

// ── Title extraction ──────────────────────────────────────────────────────────

function extractTitle(html, url) {
  // og:site_name first
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (ogSite) return ogSite[1].trim();

  // <title> tag
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) {
    // Strip " | City | Category" suffixes
    return titleTag[1].split(/[|\-–—]/)[0].trim();
  }

  // Fallback to hostname
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return '';
}

// ── Social links ──────────────────────────────────────────────────────────────

const SOCIAL_DOMAINS = {
  facebook:  /facebook\.com\/(?!sharer)/,
  instagram: /instagram\.com\//,
  twitter:   /twitter\.com\/|x\.com\//,
  linkedin:  /linkedin\.com\/company\//,
  youtube:   /youtube\.com\/(@|c\/|channel\/)/,
  tiktok:    /tiktok\.com\/@/,
};

function extractSocialLinks(html) {
  const links = {};
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    for (const [platform, re] of Object.entries(SOCIAL_DOMAINS)) {
      if (!links[platform] && re.test(href)) links[platform] = href;
    }
  }
  return links;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyResult() {
  return { emails: [], phones: [], address: '', hours: '', title: '', socialLinks: {} };
}

module.exports = { parseHTML };
