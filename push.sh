#!/usr/bin/env bash
# push.sh — Build & push LeadScan to gethubed.com/leadscan
#
# Usage (from Windows Git Bash / WSL):
#   bash push.sh
#
# Requires: sshpass, rsync  (Git Bash on Windows: use WSL or install via choco)

set -euo pipefail

VPS_IP="204.168.184.50"
VPS_USER="root"
VPS_PASS="Blendbright333"
VPS_DIR="/opt/leadscan"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─────────────────────────────────────────────────────────────────────────────

log()  { echo "  ▶ $1"; }
ok()   { echo "  ✓ $1"; }
hdr()  { echo ""; echo "══ $1 ══════════════════════════════════════"; }

SSH_OPTS="-o StrictHostKeyChecking=no -o LogLevel=ERROR"

vssh() {
  sshpass -p "$VPS_PASS" ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "$@"
}

# ── 1. Build dashboard ───────────────────────────────────────────────────────

hdr "1 / 4  Build dashboard"
cd "$SCRIPT_DIR"

log "VITE_BASE_PATH=/leadscan/ npm run build"
VITE_BASE_PATH="/leadscan/" npm run build
ok "dist/ built"

# ── 2. Sync to VPS ──────────────────────────────────────────────────────────

hdr "2 / 4  Sync files to VPS"
log "rsync → $VPS_USER@$VPS_IP:$VPS_DIR"

sshpass -p "$VPS_PASS" rsync -az --progress \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='data/*.json' \
  --exclude='*.log' \
  --exclude='logs/' \
  --exclude='tmp/' \
  -e "ssh $SSH_OPTS" \
  "$SCRIPT_DIR/" \
  "$VPS_USER@$VPS_IP:$VPS_DIR/"

ok "Files synced"

# ── 3. Remote: install deps + start/reload PM2 ─────────────────────────────

hdr "3 / 4  Remote setup"

vssh bash -s << REMOTE
set -euo pipefail
cd $VPS_DIR

echo "  → Creating required dirs..."
mkdir -p data /var/log/leadscan

# Write .env only if missing — preserves existing API keys
if [ ! -f .env ]; then
  cat > .env << 'ENV'
NODE_ENV=production
PORT=3002
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
HEADLESS=true
BLOCK_RESOURCES=true
STALE_DAYS=45
WORKER_CONCURRENCY=5
ENV
  echo "  ✓ .env created"
else
  echo "  ✓ .env already exists (not overwritten)"
fi

echo "  → npm install..."
npm install --omit=dev --silent

echo "  → Playwright chromium..."
npx playwright install chromium --with-deps 2>&1 | grep -E "^(Downloading|Installing|✓|Error)" || true

echo "  → Redis check..."
systemctl is-active --quiet redis-server && echo "  ✓ Redis running" || (systemctl start redis-server && echo "  ✓ Redis started")

echo "  → PM2 (re)start..."
npm list -g pm2 &>/dev/null || npm install -g pm2 --quiet

pm2 delete leadscan-api    2>/dev/null || true
pm2 delete leadscan-worker 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

pm2 list
REMOTE

ok "Remote setup done"

# ── 4. Configure nginx ───────────────────────────────────────────────────────

hdr "4 / 4  Nginx /leadscan config"

vssh bash -s << 'NGINX'
set -euo pipefail

CONF="/etc/nginx/sites-available/leadscan"

# Write nginx config
cat > "$CONF" << 'EOF'
# LeadScan — /leadscan path on gethubed.com

server {
    listen 80 default_server;
    server_name _;

    # ── Static React dashboard ────────────────────────────────────────────
    location /leadscan/ {
        alias /opt/leadscan/dist/;
        try_files $uri $uri/ /leadscan/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # ── API reverse proxy ─────────────────────────────────────────────────
    # Strip /leadscan/api prefix before passing to Express
    location /leadscan/api/ {
        rewrite ^/leadscan/api/(.*)$ /$1 break;
        proxy_pass         http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
        proxy_buffering    off;

        # CORS
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if ($request_method = OPTIONS) { return 204; }
    }

    # ── Root redirect ─────────────────────────────────────────────────────
    location = / {
        return 302 /leadscan/;
    }
}
EOF

# Enable, remove old default, test, reload
ln -sf "$CONF" /etc/nginx/sites-enabled/leadscan
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t
systemctl reload nginx
echo "  ✓ Nginx reloaded"
NGINX

ok "Nginx configured"

# ── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════"
echo "  DEPLOY COMPLETE"
echo ""
echo "  Dashboard  →  http://gethubed.com/leadscan/"
echo "  API health →  http://gethubed.com/leadscan/api/health"
echo ""
echo "  SSH:  ssh root@204.168.184.50"
echo "  Logs: pm2 logs"
echo "  Mon:  pm2 monit"
echo "══════════════════════════════════════════════════"
