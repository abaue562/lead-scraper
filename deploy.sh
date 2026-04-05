#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  LeadGen Pro — VPS Deployment Script
#
#  Tested on: Ubuntu 22.04 LTS (DigitalOcean, Linode, Vultr, Hetzner)
#  Minimum specs: 2 vCPU, 4GB RAM, 50GB SSD (~$20/mo on any provider)
#
#  Run on a FRESH Ubuntu 22.04 server as root:
#    curl -sO https://raw.githubusercontent.com/you/leadgen/main/scraper/scripts/deploy.sh
#    bash deploy.sh
#
#  Or copy this file to your server and run:
#    bash /path/to/deploy.sh
#
#  What this does:
#    1. Installs Node.js 20, Python 3, Chrome deps, Redis
#    2. Creates a non-root 'leadgen' user
#    3. Clones/copies your code
#    4. Installs Playwright and npm packages
#    5. Sets up PM2 process manager with auto-start
#    6. Configures a firewall (UFW)
#    7. Optionally sets up Nginx as a reverse proxy
#    8. Installs FlareSolverr via Docker
#
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $1"; }
info() { echo -e "${CYAN}→${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
hdr()  { echo -e "\n${BOLD}━━━  $1  ━━━${NC}"; }

# ── Config ────────────────────────────────────────────────────────────────────

APP_USER="leadgen"
APP_DIR="/opt/leadgen"
PORT="${PORT:-3000}"
WORKERS="${WORKERS:-3}"
CONCURRENCY="${CONCURRENCY:-25}"
NODE_VERSION="20"

# ── Root check ────────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Run as root:${NC} sudo bash deploy.sh"
  exit 1
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    LEADGEN PRO — VPS DEPLOYMENT              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
info "Server IP: $SERVER_IP"
info "App port:  $PORT"
info "Workers:   $WORKERS × $CONCURRENCY concurrency"

# ── 1. System update ─────────────────────────────────────────────────────────

hdr "1/9  System Update"
apt-get update -qq
apt-get upgrade -y -qq
ok "System updated"

# ── 2. Node.js ───────────────────────────────────────────────────────────────

hdr "2/9  Node.js ${NODE_VERSION}"

if ! command -v node &>/dev/null || [[ $(node -e "process.stdout.write(process.version.slice(1).split('.')[0])") -lt $NODE_VERSION ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - -qq
  apt-get install -y nodejs -qq
fi
ok "Node.js $(node --version)"

npm install -g pm2 --quiet
ok "PM2 $(pm2 --version)"

# ── 3. Python ────────────────────────────────────────────────────────────────

hdr "3/9  Python 3"
apt-get install -y python3 python3-pip python3-venv -qq

# faster-whisper for audio CAPTCHA bypass
pip3 install faster-whisper --quiet --break-system-packages 2>/dev/null || \
  pip3 install faster-whisper --quiet 2>/dev/null || \
  warn "faster-whisper install failed — audio CAPTCHA bypass unavailable"
ok "Python $(python3 --version)"

# ── 4. Chrome / Playwright dependencies ─────────────────────────────────────

hdr "4/9  Browser Dependencies"
apt-get install -y --no-install-recommends \
  chromium-browser \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxss1 \
  xdg-utils \
  ffmpeg \
  -qq 2>/dev/null || true
ok "Browser deps installed"

# ── 5. Redis ─────────────────────────────────────────────────────────────────

hdr "5/9  Redis"
apt-get install -y redis-server -qq
systemctl enable redis-server
systemctl start redis-server
redis-cli ping | grep -q PONG && ok "Redis running" || warn "Redis may not be running"

# ── 6. Docker (for FlareSolverr) ─────────────────────────────────────────────

hdr "6/9  Docker + FlareSolverr"

if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | bash -s -- -q
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
else
  ok "Docker already installed"
fi

# Start FlareSolverr
if ! docker ps | grep -q flaresolverr; then
  docker run -d \
    --name flaresolverr \
    --restart unless-stopped \
    -p 8191:8191 \
    -e LOG_LEVEL=warning \
    flaresolverr/flaresolverr:latest 2>/dev/null && ok "FlareSolverr started" || warn "FlareSolverr already running or failed"
else
  ok "FlareSolverr already running"
fi

# ── 7. App setup ─────────────────────────────────────────────────────────────

hdr "7/9  Application Setup"

# Create app user
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  ok "Created user: $APP_USER"
fi

# Create app directory
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# If code is already here (running from within the repo), copy it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" ]]; then
  info "Copying code from $SCRIPT_DIR → $APP_DIR"
  rsync -a --exclude='node_modules' --exclude='.env' --exclude='logs' "$SCRIPT_DIR/" "$APP_DIR/"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  ok "Code copied"
else
  warn "No code found at $SCRIPT_DIR — copy your scraper/ directory to $APP_DIR manually"
fi

# Install npm packages as app user
su -c "cd $APP_DIR && npm install --omit=dev --quiet" "$APP_USER"
ok "npm packages installed"

# Install Playwright chromium
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '/usr/bin/chromium')
ok "Playwright using system Chromium: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"

# Create .env if not exists
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" << ENVEOF
# LeadGen Pro — Production Config
# Edit this file with your keys, then restart: pm2 restart all

REDIS_URL=redis://localhost:6379
PORT=${PORT}

# Workers
WORKER_CONCURRENCY=${CONCURRENCY}
MAX_RETRIES=3
HEADLESS=true
SCRAPE_TIMEOUT=30000
BLOCK_RESOURCES=true

# CAPTCHA
FLARE_SOLVERR_URL=http://localhost:8191
AUDIO_CAPTCHA_ENABLED=true
AUDIO_BACKEND=faster-whisper
NOPECHA_KEY=
CAPTCHA_SERVICE=capsolver
CAPTCHA_API_KEY=

# Proxies (comma-separated)
PROXIES=

# Paid APIs
SCRAPINGDOG_API_KEY=
SERPAPI_KEY=

# Integrations
HUBSPOT_TOKEN=
GHL_API_KEY=
GHL_LOCATION_ID=
ENVEOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  ok "Created .env template at $APP_DIR/.env"
else
  ok ".env already exists"
fi

# ── 8. PM2 process manager ────────────────────────────────────────────────────

hdr "8/9  PM2 Process Manager"

cat > "$APP_DIR/ecosystem.production.config.js" << PMEOF
module.exports = {
  apps: [
    {
      name: 'api',
      script: './api/server.js',
      cwd: '${APP_DIR}',
      instances: 1,
      exec_mode: 'fork',
      env_file: '${APP_DIR}/.env',
      max_memory_restart: '512M',
      error_file: '${APP_DIR}/logs/api-error.log',
      out_file:   '${APP_DIR}/logs/api-out.log',
      merge_logs: true,
    },
    {
      name: 'worker',
      script: './workers/worker.js',
      cwd: '${APP_DIR}',
      instances: ${WORKERS},
      exec_mode: 'fork',
      env_file: '${APP_DIR}/.env',
      max_memory_restart: '2G',
      kill_timeout: 10000,
      error_file: '${APP_DIR}/logs/worker-error.log',
      out_file:   '${APP_DIR}/logs/worker-out.log',
      merge_logs: true,
    },
  ],
};
PMEOF

mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/logs"

# Start PM2 as app user
su -c "pm2 start $APP_DIR/ecosystem.production.config.js --env production" "$APP_USER" 2>/dev/null || \
  su -c "pm2 reload $APP_DIR/ecosystem.production.config.js --env production" "$APP_USER"

# Save PM2 and configure auto-start
su -c "pm2 save" "$APP_USER"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true
ok "PM2 configured with auto-start"

# ── 9. Firewall ───────────────────────────────────────────────────────────────

hdr "9/9  Firewall (UFW)"

apt-get install -y ufw -qq
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow "$PORT/tcp" comment 'LeadGen API'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw --force enable
ok "Firewall configured"

# ── Optional: Nginx reverse proxy ────────────────────────────────────────────

if command -v nginx &>/dev/null || apt-get install -y nginx -qq 2>/dev/null; then
  cat > /etc/nginx/sites-available/leadgen << NGINXEOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
        client_max_body_size 10M;
    }
}
NGINXEOF
  ln -sf /etc/nginx/sites-available/leadgen /etc/nginx/sites-enabled/leadgen
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx && ok "Nginx configured" || warn "Nginx config test failed"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ✓  DEPLOYMENT COMPLETE                                      ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║                                                              ║${NC}"
echo -e "${BOLD}║  API endpoint:  http://$SERVER_IP:$PORT                           ║${NC}"
echo -e "${BOLD}║  Health check:  http://$SERVER_IP:$PORT/health                    ║${NC}"
echo -e "${BOLD}║  FlareSolverr:  http://localhost:8191                        ║${NC}"
echo -e "${BOLD}║                                                              ║${NC}"
echo -e "${BOLD}║  Next steps:                                                 ║${NC}"
echo -e "${BOLD}║  1. Edit $APP_DIR/.env  with your API keys               ║${NC}"
echo -e "${BOLD}║  2. pm2 restart all    to apply .env changes                 ║${NC}"
echo -e "${BOLD}║  3. pm2 logs           to watch live logs                    ║${NC}"
echo -e "${BOLD}║  4. pm2 monit          for live dashboard                    ║${NC}"
echo -e "${BOLD}║                                                              ║${NC}"
echo -e "${BOLD}║  Scale workers:  bash scripts/scale.sh 5 30                  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Update the API URL in the dashboard to: ${CYAN}http://$SERVER_IP:$PORT${NC}"
echo ""
