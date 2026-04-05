'use strict';

/**
 * Email Enrichment Script
 *
 * Pulls all leads from completed BullMQ jobs, visits each business website
 * with a plain HTTP GET (no browser — much faster), extracts emails using
 * parseHTML, then saves enriched_leads.json.
 *
 * Run: node scripts/enrich_emails.js
 *
 * Options (env vars):
 *   CONCURRENCY=15   parallel fetches (default 15)
 *   TIMEOUT=8000     per-request timeout ms (default 8000)
 *   OUTPUT=./data/enriched_leads.json
 */

require('dotenv').config();

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const pLimit   = (() => { try { return require('p-limit').default || require('p-limit'); } catch { return n => fn => fn(); } })();
const { getQueue, shutdown } = require('../queue');
const { parseHTML }          = require('../parser');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '15', 10);
const TIMEOUT_MS  = parseInt(process.env.TIMEOUT     || '8000', 10);
const OUTPUT_PATH = process.env.OUTPUT || path.join(__dirname, '../data/enriched_leads.json');

// Domains that will never have a useful contact page — skip them
const SKIP_DOMAINS = [
  'facebook.com','instagram.com','twitter.com','x.com','linkedin.com',
  'yelp.com','yellowpages.com','google.com','maps.google','apple.com',
  'youtube.com','tiktok.com','tripadvisor.com',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function shouldSkip(url) {
  if (!url) return true;
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return SKIP_DOMAINS.some(d => hostname.includes(d));
  } catch { return true; }
}

async function fetchEmail(website) {
  // Try homepage first, then /contact if homepage has no email
  const pages = [website, `${website.replace(/\/$/, '')}/contact`];
  for (const pageUrl of pages) {
    try {
      const resp = await axios.get(pageUrl, {
        timeout: TIMEOUT_MS,
        headers: HEADERS,
        maxRedirects: 4,
        responseType: 'text',
        validateStatus: s => s < 400,
      });
      const parsed = parseHTML(resp.data, pageUrl);
      if (parsed.emails?.length > 0) return parsed.emails[0];
    } catch {
      // Unreachable or error — try next page
    }
  }
  return '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[Enrich] Loading completed jobs from Redis…');
  const queue = getQueue();

  // Pull up to 5000 completed jobs
  const jobs = await queue.getCompleted(0, 4999);
  console.log(`[Enrich] Found ${jobs.length} completed jobs`);

  // Collect all unique leads
  const leadMap = new Map(); // dedup key → lead
  for (const job of jobs) {
    const result = job.returnvalue;
    const leads  = result?.leads || [];
    for (const l of leads) {
      const digits = (l.phone || '').replace(/\D/g, '');
      const web    = (l.website || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
      const name   = (l.name   || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      const key    = digits.length >= 7 ? digits.slice(-10) : (web.length > 4 ? web : name);
      if (!leadMap.has(key)) {
        leadMap.set(key, { ...l });
      } else {
        // Merge — fill gaps
        const ex = leadMap.get(key);
        for (const f of ['phone','email','website','address','hours','rating','review_count']) {
          if (!ex[f] && l[f]) ex[f] = l[f];
        }
      }
    }
  }

  const allLeads = [...leadMap.values()];
  const toEnrich = allLeads.filter(l => !l.email && l.website && !shouldSkip(l.website));

  console.log(`[Enrich] Total unique leads: ${allLeads.length}`);
  console.log(`[Enrich] Leads needing email enrichment: ${toEnrich.length}`);
  console.log(`[Enrich] Concurrency: ${CONCURRENCY}, Timeout: ${TIMEOUT_MS}ms`);

  const limit   = pLimit(CONCURRENCY);
  let done      = 0;
  let found     = 0;

  await Promise.all(
    toEnrich.map(lead =>
      limit(async () => {
        const email = await fetchEmail(lead.website);
        if (email) {
          lead.email = email;
          found++;
        }
        done++;
        if (done % 50 === 0 || done === toEnrich.length) {
          process.stdout.write(`\r[Enrich] ${done}/${toEnrich.length} processed — ${found} emails found`);
        }
      })
    )
  );

  console.log(`\n[Enrich] Done. Found emails for ${found}/${toEnrich.length} leads.`);

  // Save output
  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allLeads, null, 2));
  console.log(`[Enrich] Saved ${allLeads.length} leads → ${OUTPUT_PATH}`);

  // Summary
  const withEmail   = allLeads.filter(l => l.email).length;
  const withPhone   = allLeads.filter(l => l.phone).length;
  const withWebsite = allLeads.filter(l => l.website).length;
  console.log(`[Enrich] Summary: ${withEmail} emails | ${withPhone} phones | ${withWebsite} websites`);

  await shutdown();
  process.exit(0);
}

run().catch(err => {
  console.error(`[Enrich] Fatal: ${err.message}`);
  process.exit(1);
});
