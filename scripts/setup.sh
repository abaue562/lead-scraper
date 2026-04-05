#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  LeadGen Pro — Complete First-Time Setup
#  Run once after cloning: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
hdr()  { echo -e "\n${BOLD}$1${NC}"; echo "─────────────────────────────"; }

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        LEADGEN PRO — Setup                ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"

# ── 1. Node.js ────────────────────────────────────────────────────

hdr "1/6  Node.js Dependencies"

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version)")
ok "Node.js $NODE_VER found"

cd "$ROOT"
npm install --quiet
ok "npm packages installed"

# ── 2. Playwright Browser ─────────────────────────────────────────

hdr "2/6  Playwright Browser (Chromium)"

if ! node -e "require('playwright')" &>/dev/null; then
  fail "playwright not in node_modules"
  exit 1
fi

echo "Downloading Chromium (~130MB, one-time)..."
npx playwright install chromium 2>&1 | tail -3
ok "Chromium installed"

# ── 3. Python Dependencies ────────────────────────────────────────

hdr "3/6  Python Dependencies"

if ! command -v python3 &>/dev/null; then
  warn "Python3 not found — Python lead generator will be unavailable"
else
  PY_VER=$(python3 --version)
  ok "$PY_VER found"

  # Install Python deps
  if command -v pip3 &>/dev/null; then
    pip3 install -r "$ROOT/../requirements_v2.txt" --quiet \
      --break-system-packages 2>/dev/null || \
    pip3 install -r "$ROOT/../requirements_v2.txt" --quiet 2>/dev/null || \
    warn "pip install had issues — run manually: pip install -r requirements_v2.txt"
    ok "Python packages installed"

    # Playwright Python browser
    python3 -m playwright install chromium --quiet 2>/dev/null && ok "Python Playwright OK" || \
      warn "Python Playwright install failed (not critical)"
  else
    warn "pip3 not found — install Python deps manually"
  fi
fi

# ── 4. Redis ──────────────────────────────────────────────────────

hdr "4/6  Redis"

REDIS_RUNNING=false
if command -v redis-cli &>/dev/null; then
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis already running"
    REDIS_RUNNING=true
  fi
fi

if ! $REDIS_RUNNING; then
  if command -v docker &>/dev/null; then
    echo "Starting Redis via Docker..."
    docker run -d --name leadgen-redis -p 6379:6379 --restart unless-stopped redis:alpine \
      redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru 2>/dev/null \
      && ok "Redis container started" \
      || warn "Docker Redis already exists or failed — check: docker ps"
  elif command -v brew &>/dev/null; then
    brew services start redis && ok "Redis started via brew"
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y redis-server -q && sudo systemctl start redis && ok "Redis installed and started"
  else
    warn "Redis not found. Install it:"
    echo "  Docker : docker run -d -p 6379:6379 redis:alpine"
    echo "  macOS  : brew install redis && brew services start redis"
    echo "  Ubuntu : sudo apt install redis-server && sudo systemctl start redis"
  fi
fi

# ── 5. Environment Config ─────────────────────────────────────────

hdr "5/6  Environment Config"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  ok "Created .env from .env.example"
  echo ""
  echo "  Edit $ROOT/.env to add:"
  echo "    PROXIES=               (optional but recommended)"
  echo "    CAPTCHA_API_KEY=       (optional — for CAPTCHA solving)"
  echo "    SCRAPINGDOG_API_KEY=   (optional — fast paid API)"
  echo "    SERPAPI_KEY=           (optional — fast paid API)"
else
  ok ".env already exists"
fi

# ── 6. Verify Everything ──────────────────────────────────────────

hdr "6/6  Verification"

node -e "
  const modules = ['playwright','bullmq','ioredis','express','cheerio','p-limit','winston','axios'];
  modules.forEach(m => { require(m); process.stdout.write('  ✓ ' + m + '\\n'); });
"
ok "All Node.js modules verified"

# ── Final Instructions ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Setup complete! Start the system:                    ║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║                                                       ║${NC}"
echo -e "${BOLD}║  Terminal 1 (API server):                             ║${NC}"
echo -e "${BOLD}║    npm run start:api                                  ║${NC}"
echo -e "${BOLD}║                                                       ║${NC}"
echo -e "${BOLD}║  Terminal 2 (Worker):                                 ║${NC}"
echo -e "${BOLD}║    npm run start:worker                               ║${NC}"
echo -e "${BOLD}║                                                       ║${NC}"
echo -e "${BOLD}║  Test (in Terminal 3):                                ║${NC}"
echo -e "${BOLD}║    curl \"http://localhost:3000/health\"                 ║${NC}"
echo -e "${BOLD}║    curl -X POST http://localhost:3000/leads \\         ║${NC}"
echo -e "${BOLD}║      -H \"Content-Type: application/json\" \\            ║${NC}"
echo -e "${BOLD}║      -d '{\"location\":\"Austin TX\",\"category\":\"plumber\"}'║${NC}"
echo -e "${BOLD}║                                                       ║${NC}"
echo -e "${BOLD}║  Scale (PM2):  bash scripts/scale.sh 5 30            ║${NC}"
echo -e "${BOLD}║  Docker:       docker-compose up -d --scale worker=5  ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
