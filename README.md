# LeadGen Scraper — Production Web Scraping System

High-throughput, cost-efficient scraping engine. No paid APIs required.
Scales to 10k+ requests/hour with free proxies, unlimited with residential.

## Architecture

```
/scraper
  /core       — Browser pool + scrapeWithBrowser()
  /stealth    — Anti-detection (UA, viewport, fingerprints, delays)
  /proxy      — IP rotation, geo-targeting, failure tracking
  /captcha    — Detection + 2Captcha/Anti-Captcha solver
  /parser     — Cheerio HTML → structured data (emails, phones, addresses)
  /queue      — BullMQ + Redis job queue
  /workers    — Job consumers with concurrency control
  /api        — Express REST API
  /utils      — Logger (Winston) + Metrics
```

## Quick Start

### 1. Install

```bash
npm install
npm run install:browser     # download Chromium (~130MB, one-time)
cp .env.example .env
```

### 2. Start Redis

```bash
# Docker (easiest):
docker run -d -p 6379:6379 redis:alpine

# Or install locally:
brew install redis && redis-server
```

### 3. Run

Open two terminals:

```bash
# Terminal 1 — API server
npm run start:api

# Terminal 2 — Worker (job processor)
npm run start:worker
```

### 4. Test

```bash
# Single search (synchronous)
curl "http://localhost:3000/search?q=plumbers+in+Austin+TX"

# Async — returns job ID immediately
curl "http://localhost:3000/search?q=dentists+in+Miami&async=true"
# → { "jobId": "123", "status": "queued" }

# Poll for result
curl "http://localhost:3000/jobs/123"

# Batch (POST)
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jobs":[{"query":"plumbers in Austin"},{"query":"dentists in Miami"}]}'

# Metrics
curl http://localhost:3000/metrics

# Queue stats
curl http://localhost:3000/queue/stats
```

## Response Format

```json
{
  "query": "plumbers in Austin TX",
  "url": "https://www.google.com/maps/...",
  "results": [{
    "title": "Joe's Plumbing",
    "description": "...",
    "emails": ["joe@joesplumbing.com"],
    "phones": ["(512) 555-0123"],
    "address": "123 Main St, Austin, TX 78701",
    "hours": "Mon-Fri 8am-6pm",
    "socialLinks": { "facebook": "...", "instagram": "..." },
    "rating": "4.8",
    "reviewCount": 312,
    "links": [...]
  }],
  "source": "browser",
  "success": true,
  "attempts": 1,
  "elapsed": 3420,
  "timestamp": "2025-04-02T12:00:00Z"
}
```

## Scaling to 10k+ req/hour

### Single machine
```bash
# Increase worker concurrency in .env:
WORKER_CONCURRENCY=50

# Run multiple worker processes:
npm run start:worker &
npm run start:worker &
npm run start:worker &
```

3 workers × 50 concurrency = 150 parallel jobs.
At ~3s/request = ~180k requests/hour theoretical.
Real-world with Google Maps: ~5–15k/hour per machine.

### Multiple machines
Each machine runs:
- 1+ worker processes
- Shared Redis (one instance or cluster)
- API server (optionally load-balanced)

Workers are stateless — just point them at the same Redis.

### Proxy requirements
| Scale target    | Proxy type              | Provider              |
|-----------------|-------------------------|-----------------------|
| < 1k req/hr     | Free proxies or none    | free-proxy-list.net   |
| 1k–10k req/hr   | Datacenter proxies      | Webshare, ProxyEmpire |
| 10k–100k req/hr | Residential proxies     | Smartproxy, BrightData |
| 100k+ req/hr    | Residential + rotating  | BrightData, Oxylabs   |

### Add proxies
```env
# .env
PROXIES=http://user:pass@proxy1.com:8000,http://user:pass@proxy2.com:8000

# Or with regions:
PROXIES=proxy1.com:8000:user:pass:us-east,proxy2.com:8000:user:pass:us-west
```

Then in your API calls:
```bash
curl "http://localhost:3000/search?q=dentists+in+NYC&region=us-east"
```

## CAPTCHA Handling

Without a solver (free): CAPTCHAs cause proxy rotation + retry.
With 2Captcha ($3/1000 solves): CAPTCHAs are auto-solved.

```env
CAPTCHA_API_KEY=your_2captcha_key
CAPTCHA_SERVICE=2captcha
```

## Cost Comparison

| Method               | Cost per 10k leads  | Speed          |
|----------------------|---------------------|----------------|
| This system (free)   | $0 (server costs)   | 1k–5k/hr       |
| + Residential proxies| ~$5–20 (bandwidth)  | 10k–50k/hr     |
| SerpAPI              | ~$90                | 10k+/hr        |
| Scrapingdog          | ~$3.30              | 10k+/hr        |
| Google Places API    | ~$200               | Limited        |

## Monitoring

```bash
# Live metrics
watch -n 5 "curl -s http://localhost:3000/metrics | python3 -m json.tool"

# Queue depth
curl http://localhost:3000/queue/stats
```

Key metrics to watch:
- `successRate` — below 80% means you need more/better proxies
- `requests.captcha` — high count = need CAPTCHA solver
- `latency.p95` — above 15s = increase timeout or add workers
