#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  LeadGen Scraper — Scale Script
#  Usage: ./scripts/scale.sh [workers] [concurrency]
#  Example: ./scripts/scale.sh 5 30    → 5 workers, 30 concurrency each
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

WORKERS=${1:-2}
CONCURRENCY=${2:-20}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "═══════════════════════════════════════════"
echo "  LeadGen Scraper — Scaling"
echo "═══════════════════════════════════════════"
echo "  Workers:     $WORKERS"
echo "  Concurrency: $CONCURRENCY per worker"
echo "  Total slots: $((WORKERS * CONCURRENCY))"
echo "═══════════════════════════════════════════"
echo ""

# ── Check dependencies ──────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "✗ $1 not found. Install it first."
    exit 1
  fi
}

check_cmd node
check_cmd redis-cli

# ── Check Redis ─────────────────────────────────────────────────

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
echo "Checking Redis at $REDIS_URL..."

if redis-cli -u "$REDIS_URL" ping | grep -q PONG; then
  echo "✓ Redis OK"
else
  echo "✗ Redis not responding. Start it with:"
  echo "    docker run -d -p 6379:6379 redis:alpine"
  exit 1
fi

# ── Mode: Docker or PM2 ─────────────────────────────────────────

if command -v docker-compose &>/dev/null && [ -f "$ROOT/docker-compose.yml" ]; then
  echo ""
  echo "Using Docker Compose..."
  cd "$ROOT"
  export WORKER_REPLICAS="$WORKERS"
  export WORKER_CONCURRENCY="$CONCURRENCY"
  docker-compose up -d --scale worker="$WORKERS" --no-recreate
  echo ""
  echo "✓ Docker Compose scaling applied"
  docker-compose ps

elif command -v pm2 &>/dev/null; then
  echo ""
  echo "Using PM2..."
  cd "$ROOT"
  export WORKER_CONCURRENCY="$CONCURRENCY"

  # Start or reload
  if pm2 list | grep -q "worker"; then
    pm2 scale worker "$WORKERS"
    echo "✓ Scaled to $WORKERS workers"
  else
    pm2 start ecosystem.config.js --env production
    pm2 scale worker "$WORKERS"
    echo "✓ Started $WORKERS workers"
  fi
  pm2 status

else
  echo ""
  echo "No Docker Compose or PM2 found. Starting workers directly..."
  cd "$ROOT"

  # Kill any existing workers
  pkill -f "workers/worker.js" 2>/dev/null || true
  sleep 1

  # Start API if not running
  if ! curl -s http://localhost:3000/health &>/dev/null; then
    echo "Starting API server..."
    WORKER_CONCURRENCY="$CONCURRENCY" node api/server.js &
    API_PID=$!
    sleep 2
    echo "✓ API started (PID: $API_PID)"
  fi

  # Start workers
  for i in $(seq 1 "$WORKERS"); do
    WORKER_CONCURRENCY="$CONCURRENCY" node workers/worker.js &
    echo "✓ Worker $i started (PID: $!)"
  done

  echo ""
  echo "All processes running. Ctrl+C to stop."
  echo "Logs: tail -f logs/combined.log"
  wait
fi

echo ""
echo "Throughput estimate: ~$((WORKERS * CONCURRENCY * 3600 / 5)) requests/hour"
echo "  (based on ~5s avg per request)"
