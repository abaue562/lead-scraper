# Lead Scraper — Freight & Business Lead Generation System

A full-stack lead generation platform that scrapes, scores, and organizes business leads across multiple industries. Built for trucking and freight operations targeting **Alberta and British Columbia, Canada** — with a focus on the **Vancouver ↔ Edmonton** corridor.

---

## What It Does

This system automatically finds businesses that need freight services by scraping Google Maps and other sources. It filters out junk, scores each lead by industry priority, assigns them to freight lanes, and presents everything in a clean dashboard you can export to CSV.

**No load boards. No paid lead lists. Continuously generates your own pipeline.**

---

## Dashboard Tabs

### 🟢 Leads Tab
The main general-purpose lead scraper.

- Enter any city and select business categories (plumbers, dentists, restaurants, etc.)
- Scrapes Google Maps, Google Search, Yelp, and Yellow Pages simultaneously
- Deduplicates results across all sources automatically
- Filters by country (🍁 Canada / 🦅 USA), city, business type, or free-text search
- Toggle **No-Website Only** to find businesses without a web presence (high-value outreach targets)
- Export results as CSV or TSV
- Push directly to **HubSpot** or **GoHighLevel** CRM with one click

### 🟡 Reviewers Tab
Scrapes Google Maps reviewer profiles alongside business listings.

- Captures reviewer name, rating given, review count, Local Guide status, and review text
- Useful for identifying vocal customers or potential referral sources

### 🟢 Outreach Tab
Built-in email and SMS campaign builder.

- Choose from pre-built templates: No Website Pitch, Review Building, SEO Outreach
- Filter targets by: no website, no email, or all leads
- Find missing emails via Hunter.io, Apollo.io, or Snov.io enrichment APIs
- Send via Gmail SMTP or SendGrid
- SMS campaigns via Twilio
- Tracks campaign history with sent/replied/converted stats

### 🔵 Monitor Tab
Real-time system health dashboard.

- Live queue stats: waiting, active, completed, failed jobs
- Success/failure/timeout rates
- Response time percentiles (p50, p95, p99)
- Requests per hour throughput
- Active job list with per-job status

### 🟣 Freight Tab
The core module for freight lead generation — purpose-built for trucking companies targeting AB and BC shippers.

See full details below.

---

## Freight Tab — Full Feature Guide

### What It Scrapes

The freight tab targets **27 niche query variants** across 11 industry categories:

| Industry | Priority Weight | What It Finds |
|---|---|---|
| Oilfield Services | ⭐⭐⭐⭐⭐ 5 | Oilfield contractors, energy services, oil & gas companies |
| Manufacturers | ⭐⭐⭐⭐ 4 | Factories, fabrication shops, industrial suppliers |
| Construction | ⭐⭐⭐⭐ 4 | General contractors, civil contractors, heavy equipment |
| Import / Export | ⭐⭐⭐⭐ 4 | Importers, exporters, customs brokers |
| Warehouses | ⭐⭐⭐ 3 | Warehouses, storage facilities, logistics centres |
| Distribution | ⭐⭐⭐ 3 | Distribution centres, wholesale distributors |
| 3PL / Brokers | ⭐⭐⭐ 3 | Freight brokers, logistics companies, trucking companies |
| Cold Storage | ⭐⭐⭐ 3 | Cold storage, refrigerated transport |
| Agriculture | ⭐⭐⭐ 3 | Farms, grain elevators, ag suppliers |
| Scrap / Recycling | ⭐⭐ 2 | Scrap metal dealers, demolition contractors |
| E-Commerce | ⭐⭐ 2 | Online retailers, fulfillment centres |

### Lead Scoring Formula

Every lead gets a numeric score to help you prioritize outreach:

```
score = (industry_weight × 2) + location_density + (has_contact × 3) + (pain_signal × 2)
```

| Score | Label | Meaning |
|---|---|---|
| 14+ | 🟢 Hot | High-priority industry + major city + contact found |
| 10–13 | 🟡 Warm | Good industry match, worth contacting |
| Under 10 | ⚫ Cold | Lower priority or incomplete data |

### Lane Assignment

Every lead is automatically assigned to a freight corridor based on city:

| Lane | Cities |
|---|---|
| ⭐ **Vancouver ↔ Edmonton** | All Vancouver-area (Surrey, Burnaby, Richmond, Delta, Langley, Abbotsford) + Edmonton-area (Leduc, Nisku, Spruce Grove, St. Albert, Fort McMurray, Grande Prairie) |
| Calgary ↔ Edmonton | Calgary, Red Deer, Airdrie, Lethbridge, Medicine Hat |
| Vancouver ↔ Kelowna | Kelowna, Penticton, Vernon, Kamloops |
| Vancouver ↔ Seattle | Cross-border BC shippers |

**Vancouver ↔ Edmonton is the preferred lane** — those leads are highlighted in gold (⭐) in the table and shown at the top of the lane filter.

### Junk Filter (Blocklist)

The system automatically rejects non-freight businesses that show up in broad searches:

- Self storage, mini storage, U-Haul, moving companies
- Auto parts stores, tire shops, oil change places, auto body shops
- Restaurants, cafes, grocery stores, liquor stores
- Hair salons, spas, medical clinics, dental offices
- Hotels, real estate offices, schools, banks
- 60+ keyword patterns total

### City Presets

| Preset | Cities Included |
|---|---|
| **Alberta** | Calgary, Edmonton, Red Deer, Lethbridge, Fort McMurray, Grande Prairie, Airdrie, Medicine Hat, Leduc, Nisku, Spruce Grove, St. Albert |
| **BC** | Vancouver, Surrey, Burnaby, Richmond, Delta, Langley, Abbotsford, Kelowna, Kamloops, Prince George, Chilliwack, Nanaimo |
| **Both** | All 24 cities above |

### Export Options

- **Export CSV** — exports all visible (filtered) leads
- **Top 50 by Score** — exports the 50 highest-scoring leads across your entire freight pipeline

---

## Setup

### 1. Install Dependencies

```bash
cd scraper
npm install
npm run install:browser     # Downloads Chromium (~130MB, one-time only)
cp .env.example .env
```

### 2. Start Redis

Redis is required for the job queue.

```bash
# Docker (easiest):
docker run -d -p 6379:6379 redis:alpine

# Windows (if installed locally):
redis-server
```

### 3. Run the System

Open **three terminals** in the scraper folder:

```bash
# Terminal 1 — API server (port 3000)
npm run start:api

# Terminal 2 — Worker (processes scraping jobs)
npm run start:worker

# Terminal 3 — Frontend (port 5173)
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Settings (⚙ Gear Button)

| Setting | What It Does |
|---|---|
| **Scrapingdog / SerpAPI keys** | Paid API fallbacks for faster scraping |
| **CAPTCHA solver chain** | Free (FlareSolverr, audio bypass, NopeCHA) → paid (2Captcha, CapSolver) |
| **Proxy list** | Paste proxies in `host:port:user:pass` format, one per line |
| **Worker concurrency** | How many parallel browser tabs to run (default 20) |
| **Request delay** | Milliseconds between requests (higher = safer, slower) |
| **HubSpot token** | Push leads directly to HubSpot CRM |
| **GoHighLevel API key** | Push leads to GoHighLevel agency CRM |

---

## Architecture

```
/api          — Express REST API (port 3000)
/core         — Playwright browser pool + scrapeWithBrowser()
/scrapers     — Google Maps, Google Search, Yelp, Yellow Pages scrapers
/stealth      — Anti-detection (user agents, viewports, delays, fingerprints)
/proxy        — IP rotation, geo-targeting, health tracking
/captcha      — CAPTCHA detection + solver chain (free → paid)
/queue        — BullMQ + Redis job queue
/workers      — Job consumers with concurrency control
/enrichment   — Email discovery (Hunter, Apollo, Snov) + lead scoring
/integrations — HubSpot and GoHighLevel CRM connectors
/outreach     — Email/SMS campaign builder and sender
/parser       — Cheerio HTML parser
/utils        — Winston logger + request metrics
/src          — React frontend (Vite)
scraper_dashboard.jsx — Main UI (all 5 tabs)
```

---

## API Endpoints

```bash
# Health check
GET /health

# Scrape (synchronous)
POST /leads
Body: { "location": "Calgary", "category": "warehouse", "source": "google_maps", "maxResults": 60 }

# Scrape (async — returns jobId immediately)
POST /leads?async=true

# Check job status / get results
GET /jobs/:jobId

# Live metrics
GET /metrics

# Queue depth
GET /queue/stats

# Proxy status
GET /proxies
```

---

## Scaling

| Target | Setup |
|---|---|
| 500–1k leads/hr | Single machine, no proxies, concurrency 20 |
| 1k–5k leads/hr | Add free proxies, concurrency 50 |
| 5k–20k leads/hr | Residential proxies (Webshare, Smartproxy) |
| 20k+ leads/hr | Multiple machines sharing one Redis instance |

Workers are stateless — add more machines and point them at the same Redis URL.

---

## Cost Comparison

| Method | Cost per 10k leads | Speed |
|---|---|---|
| This system (no proxies) | $0 | 500–2k/hr |
| + Residential proxies | ~$5–20 | 5k–20k/hr |
| SerpAPI | ~$90 | Fast |
| Google Places API | ~$200 | Limited |

---

## Tech Stack

- **Frontend:** React 19, Vite
- **Backend:** Node.js, Express
- **Scraping:** Playwright (Chromium), Cheerio
- **Queue:** BullMQ + Redis
- **Anti-detection:** Custom stealth layer, proxy rotation, CAPTCHA chain
- **Logging:** Winston
