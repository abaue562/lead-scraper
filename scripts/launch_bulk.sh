#!/bin/bash
# Bulk lead collection launcher
# Usage: bash scripts/launch_bulk.sh [target] [workers]
# Example: bash scripts/launch_bulk.sh 10000 3

TARGET=${1:-10000}
WORKERS=${2:-3}

cd "$(dirname "$0")/.."

echo "=== LeadGen Bulk Launcher ==="
echo "Target:  $TARGET leads"
echo "Workers: $WORKERS"
echo ""

# Kill any stale workers (keep API server on port 3000 and Vite on 5173/5174)
echo "[*] Clearing old workers..."
for pid in $(netstat -ano 2>/dev/null | grep -v ':3000\|:5173\|:5174\|:6379' | grep ESTABLISHED | awk '{print $5}'); do
  taskkill /PID $pid /F 2>/dev/null
done

# Start N workers
echo "[*] Starting $WORKERS workers..."
for i in $(seq 1 $WORKERS); do
  node workers/worker.js >> /tmp/worker_${i}.log 2>&1 &
  echo "    Worker $i started (PID $!)"
  sleep 2  # stagger startup so browser pool isn't slammed
done

echo ""
echo "[*] Waiting 10s for workers to warm up..."
sleep 10

# Start the autorun queue manager
echo "[*] Launching AutoRun (target: $TARGET leads)..."
TARGET_LEADS=$TARGET \
MAX_PER_JOB=20 \
CELL_SIZE=0.05 \
MAX_CELLS=30 \
SOURCE=leads \
  node scripts/autorun.js

echo ""
echo "=== Done ==="
