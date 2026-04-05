#!/usr/bin/env node
/**
 * deploy_leadscan.js
 * Builds the dashboard and deploys LeadScan to gethubed.com/leadscan
 *
 * Run: node deploy_leadscan.js
 */

'use strict';

const { Client } = require('ssh2');
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const VPS = {
  host:     '204.168.184.50',
  port:     22,
  username: 'root',
  password: 'Blendbright333',
};

const VPS_DIR   = '/opt/leadscan';
const LOCAL_DIR = __dirname;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(`  ▶ ${msg}\n`); }
function ok(msg)   { process.stdout.write(`  ✓ ${msg}\n`); }
function hdr(msg)  { process.stdout.write(`\n══ ${msg} ══════════════════════════\n`); }
function err(msg)  { process.stderr.write(`  ✗ ${msg}\n`); }

function sshRun(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    let errOut = '';
    conn.exec(cmd, (er, stream) => {
      if (er) return reject(er);
      stream
        .on('close', (code) => {
          if (code !== 0) reject(new Error(`Command failed (exit ${code}):\n${errOut || out}`));
          else resolve(out.trim());
        })
        .on('data', d => { process.stdout.write(d); out += d; })
        .stderr.on('data', d => { process.stderr.write(d); errOut += d; });
    });
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn)).connect(VPS);
    conn.on('error', reject);
  });
}

// ── SCP upload (using sftp subsystem) ────────────────────────────────────────

function sftpMkdir(sftp, rpath) {
  return new Promise((res, rej) => sftp.mkdir(rpath, er => (er && er.code !== 4) ? rej(er) : res()));
}

function sftpPut(sftp, local, remote) {
  return new Promise((res, rej) => sftp.fastPut(local, remote, er => er ? rej(er) : res()));
}

function getSftp(conn) {
  return new Promise((res, rej) => conn.sftp((er, sftp) => er ? rej(er) : res(sftp)));
}

// Walk local dir and collect files (relative paths), excluding certain dirs/files
const EXCLUDE = new Set(['node_modules', '.git', '.env', 'logs', 'tmp']);
const EXCLUDE_EXT = new Set(['.log']);

function walkDir(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    if (EXCLUDE_EXT.has(path.extname(entry.name))) continue;
    const full = path.join(dir, entry.name);
    const rel  = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else {
      // Skip large scrape state files
      if (rel.startsWith('data/') && entry.name !== '.gitkeep') continue;
      results.push({ local: full, rel });
    }
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  LeadScan Deploy → gethubed.com/leadscan');
  console.log('═══════════════════════════════════════════════');

  // ── Step 1: Build dashboard ───────────────────────────────────────────────

  hdr('1 / 4  Build dashboard');
  log('npm run build (VITE_BASE_PATH=/leadscan/)');

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: LOCAL_DIR,
    env: { ...process.env, VITE_BASE_PATH: '/leadscan/' },
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) { err('Build failed'); process.exit(1); }
  ok('dist/ built');

  // ── Step 2: Upload files via SFTP ─────────────────────────────────────────

  hdr('2 / 4  Upload files via SFTP');
  log(`Connecting to ${VPS.host}…`);
  const conn = await connect();
  ok('Connected');

  const sftp = await getSftp(conn);

  // Ensure remote base dir exists
  await sshRun(conn, `mkdir -p ${VPS_DIR}/dist ${VPS_DIR}/data /var/log/leadscan`);

  const files = walkDir(LOCAL_DIR);
  log(`Uploading ${files.length} files…`);

  // Create remote dirs first
  const remoteDirs = new Set();
  for (const { rel } of files) {
    const parts = rel.split('/');
    parts.pop();
    let acc = VPS_DIR;
    for (const p of parts) {
      acc += '/' + p;
      remoteDirs.add(acc);
    }
  }
  for (const d of [...remoteDirs].sort()) {
    await sftpMkdir(sftp, d).catch(() => {});
  }

  // Upload files
  let uploaded = 0;
  for (const { local, rel } of files) {
    const remote = `${VPS_DIR}/${rel}`;
    await sftpPut(sftp, local, remote);
    uploaded++;
    if (uploaded % 50 === 0) log(`  ${uploaded}/${files.length} uploaded…`);
  }
  ok(`${uploaded} files uploaded`);

  // ── Step 3: Remote setup ──────────────────────────────────────────────────

  hdr('3 / 4  Remote setup');

  const remoteScript = `
set -e
cd ${VPS_DIR}

# Create .env if missing
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
echo ".env created"
else
echo ".env already exists"
fi

# npm install
echo "Running npm install..."
npm install --omit=dev --silent

# Playwright
echo "Installing Playwright chromium..."
npx playwright install chromium --with-deps 2>&1 | grep -E "(Downloading|Installing|done|Error)" || true

# Redis — install if missing, then start
if ! command -v redis-cli &>/dev/null; then
  echo "Installing Redis..."
  apt-get update -qq && apt-get install -y redis-server -qq
fi
systemctl enable redis-server 2>/dev/null || true
systemctl start redis-server 2>/dev/null || service redis-server start 2>/dev/null || true
redis-cli ping 2>/dev/null | grep -q PONG && echo "Redis: ok" || echo "Redis: check manually"

# PM2
npm list -g pm2 > /dev/null 2>&1 || npm install -g pm2
pm2 delete leadscan-api    2>/dev/null || true
pm2 delete leadscan-worker 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 list
echo "PM2 started"
`;

  await sshRun(conn, remoteScript);
  ok('Remote setup complete');

  // ── Step 4: Nginx config ─────────────────────────────────────────────────

  hdr('4 / 4  Nginx /leadscan config');

  const nginxConf = `
server {
    listen 80 default_server;
    server_name _;

    location /leadscan/ {
        alias /opt/leadscan/dist/;
        try_files \\$uri \\$uri/ /leadscan/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /leadscan/api/ {
        rewrite ^/leadscan/api/(.*)\$ /\\$1 break;
        proxy_pass         http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header   Host              \\$host;
        proxy_set_header   X-Real-IP         \\$remote_addr;
        proxy_set_header   X-Forwarded-For   \\$proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           \\$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
        proxy_buffering    off;
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\\$request_method = OPTIONS) { return 204; }
    }

    location = / { return 302 /leadscan/; }
}
`;

  const nginxScript = `
set -e
cat > /etc/nginx/sites-available/leadscan << 'NGINXEOF'
${nginxConf}
NGINXEOF

ln -sf /etc/nginx/sites-available/leadscan /etc/nginx/sites-enabled/leadscan
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test and reload
nginx -t && systemctl reload nginx
echo "Nginx reloaded"
`;

  // Write nginx config via file upload instead of heredoc to avoid escaping issues
  const nginxContent = `server {
    listen 80 default_server;
    server_name _;

    location /leadscan/ {
        alias /opt/leadscan/dist/;
        try_files $uri $uri/ /leadscan/index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

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
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if ($request_method = OPTIONS) { return 204; }
    }

    location = / { return 302 /leadscan/; }
}
`;

  // Write nginx conf directly via sftp
  await new Promise((res, rej) => {
    const ws = sftp.createWriteStream('/etc/nginx/sites-available/leadscan');
    ws.on('close', res).on('error', rej);
    ws.end(nginxContent);
  });

  await sshRun(conn, `
    ln -sf /etc/nginx/sites-available/leadscan /etc/nginx/sites-enabled/leadscan
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t && (systemctl reload nginx 2>/dev/null || systemctl start nginx 2>/dev/null || service nginx start) && echo "Nginx ready"
  `);

  ok('Nginx configured');

  conn.end();

  // ── Done ─────────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  DEPLOY COMPLETE');
  console.log('');
  console.log('  Dashboard →  http://gethubed.com/leadscan/');
  console.log('  API       →  http://gethubed.com/leadscan/api/health');
  console.log('');
  console.log('  SSH:  ssh root@204.168.184.50');
  console.log('  Logs: pm2 logs');
  console.log('  Mon:  pm2 monit');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
