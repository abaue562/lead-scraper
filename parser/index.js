'use strict';

const cheerio = require('cheerio');

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?1[\s.\-]?)?\(?(\d{3})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})(?:\s*(x|ext|extension)\.?\s*(\d{1,6}))?/gi;

const EMAIL_NOISE = new Set([
  'example.com', 'test.com', 'domain.com', 'email.com',
  'sentry.io', 'wixpress.com', 'wordpress.com', 'squarespace.com',
  'yourcompany.com', 'noreply.com', 'no-reply.com',
]);

const SOCIAL_PATTERNS = {
  facebook:  /facebook\.com\/(?!sharer|share|login|dialog)/i,
  instagram: /instagram\.com\//i,
  twitter:   /twitter\.com\/|x\.com\//i,
  linkedin:  /linkedin\.com\/company\//i,
  youtube:   /youtube\.com\/(channel|user|@)/i,
  tiktok:    /tiktok\.com\/@/i,
  yelp:      /yelp\.com\/biz\//i,
  pinterest: /pinterest\.com\//i,
};

/**
 * Parse raw HTML into structured lead data.
 * Keeps parsing fully separate from browser/network concerns.
 *
 * @param {string} html   - Raw page HTML
 * @param {string} baseUrl - Used to resolve relative links
 * @returns Structured data object
 */
function parseHTML(html, baseUrl = '') {
  if (!html || html.length < 100) return _empty();

  const $    = cheerio.load(html);
  const text = $.root().text();

  // Strip noisy elements before text extraction
  $('script, style, noscript, svg, iframe, header, footer, nav').remove();

  return {
    title:       _title($),
    description: _meta($, 'description'),
    keywords:    _meta($, 'keywords'),
    canonical:   $('link[rel="canonical"]').attr('href') || '',

    // Contact data
    emails:      _emails($, html),
    phones:      _phones($, text),
    address:     _address($),
    hours:       _hours($),

    // Online presence
    website:     baseUrl,
    socialLinks: _social($),

    // Reputation
    rating:      _rating($),
    reviewCount: _reviewCount($),

    // Navigation / structure
    links:       _links($, baseUrl),
    headings:    _headings($),

    // Raw text (truncated) for full-text search indexing
    bodyText:    $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000),
  };
}

// ── Extractors ───────────────────────────────────────────────────────────────

function _title($) {
  return (
    $('title').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.trim()
    || $('h1').first().text().trim()
    || ''
  );
}

function _meta($, name) {
  return (
    $(`meta[name="${name}"]`).attr('content')?.trim()
    || $(`meta[property="og:${name}"]`).attr('content')?.trim()
    || ''
  );
}

function _emails($, rawHtml) {
  const found = new Set();

  // tel: links
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = $(el).attr('href') || '';
    const addr = raw.replace('mailto:', '').split('?')[0].toLowerCase().trim();
    if (_validEmail(addr)) found.add(addr);
  });

  // Regex across full raw HTML (catches obfuscated mailto or plain text emails)
  for (const match of (rawHtml.match(EMAIL_RE) || [])) {
    const addr = match.toLowerCase();
    if (_validEmail(addr)) found.add(addr);
  }

  return [...found].slice(0, 5);
}

function _validEmail(addr) {
  if (!addr || addr.length > 100) return false;
  const domain = addr.split('@')[1] || '';
  if (EMAIL_NOISE.has(domain)) return false;
  if (/example|placeholder|yourname|\.png|\.jpg|\.gif/.test(addr)) return false;
  return true;
}

function _phones($, text) {
  const found = new Set();

  // tel: links (most reliable)
  $('a[href^="tel:"]').each((_, el) => {
    const raw = $(el).attr('href')?.replace('tel:', '').trim();
    if (raw) found.add(_formatPhone(raw));
  });

  // schema.org telephone
  $('[itemprop="telephone"]').each((_, el) => {
    const t = $(el).text().trim() || $(el).attr('content')?.trim();
    if (t) found.add(_formatPhone(t));
  });

  // Regex across all text
  let m;
  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(text)) !== null) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length === 10 || (digits.length === 11 && digits[0] === '1')) {
      found.add(_formatPhone(m[0].trim()));
    }
  }

  return [...found].slice(0, 5);
}

function _formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const d = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return raw.trim();
}

function _address($) {
  // Schema.org
  const schema = [
    $('[itemprop="streetAddress"]').first().text().trim(),
    $('[itemprop="addressLocality"]').first().text().trim(),
    $('[itemprop="addressRegion"]').first().text().trim(),
    $('[itemprop="postalCode"]').first().text().trim(),
  ].filter(Boolean).join(', ');
  if (schema) return schema;

  // Full address block
  const full = $('[itemprop="address"]').first().text().trim();
  if (full && full.length < 300) return full;

  // Common CSS patterns
  for (const sel of ['.address', '#address', '[class*="address" i]', 'address', '.location']) {
    const t = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (t && t.length > 5 && t.length < 200) return t;
  }

  return '';
}

function _hours($) {
  // Schema.org
  const schema = [];
  $('[itemprop="openingHours"]').each((_, el) => {
    const h = $(el).attr('content') || $(el).text().trim();
    if (h) schema.push(h);
  });
  if (schema.length) return schema.join(' | ');

  for (const sel of ['.hours', '#hours', '[class*="hours" i]', '.business-hours', '.opening-hours']) {
    const t = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (t && t.length > 3 && t.length < 500) return t;
  }

  return '';
}

function _social($) {
  const result = {};
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
      if (!result[platform] && pattern.test(href)) {
        result[platform] = href.startsWith('http') ? href : `https:${href}`;
      }
    }
  });
  return result;
}

function _rating($) {
  for (const sel of [
    '[itemprop="ratingValue"]',
    'meta[itemprop="ratingValue"]',
    '.rating-value', '[class*="rating" i]',
  ]) {
    const val = $(sel).first().attr('content') || $(sel).first().text().trim();
    const m   = val?.match(/([\d.]+)/);
    if (m) return m[1];
  }
  return '';
}

function _reviewCount($) {
  for (const sel of ['[itemprop="reviewCount"]', '.review-count', '[class*="review-count" i]']) {
    const val = $(sel).first().attr('content') || $(sel).first().text().trim();
    const m   = val?.match(/(\d[\d,]*)/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return 0;
}

function _links($, base) {
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().slice(0, 80);
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      const abs = href.startsWith('http') ? href : new URL(href, base).href;
      links.push({ href: abs, text });
    } catch {}
  });
  return links.slice(0, 30);
}

function _headings($) {
  return $('h1, h2, h3')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 10);
}

function _empty() {
  return {
    title: '', description: '', keywords: '', canonical: '',
    emails: [], phones: [], address: '', hours: '',
    website: '', socialLinks: {}, rating: '', reviewCount: 0,
    links: [], headings: [], bodyText: '',
  };
}

module.exports = { parseHTML };
