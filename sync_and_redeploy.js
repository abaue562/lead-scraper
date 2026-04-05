'use strict';
/**
 * sync_and_redeploy.js
 *
 * 1. Uploads all changed server-side JS files to /opt/leadscan on VPS
 * 2. Rebuilds Vite dashboard (dist/)
 * 3. Pushes dist/ into the nginx container
 * 4. PM2 restarts API + worker
 */
const { Client } = require('ssh2');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VPS  = { host: '204.168.184.50', port: 22, username: 'root', password: 'Blendbright333' };
const ROOT = __dirname;  // c:\Users\abaue\Downloads\scraper

function getSftp(conn) { return new Promise((res, rej) => conn.sftp((er, sftp) => er ? rej(er) : res(sftp))); }

function sshRun(conn, cmd, ignoreErr = false) {
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    conn.exec(cmd, (er, stream) => {
      if (er) return reject(er);
      stream.on('close', code => {
        if (code !== 0 && !ignoreErr) reject(new Error('exit ' + code + ': ' + err || out));
        else resolve(out.trim());
      });
      stream.on('data', d => { process.stdout.write(d); out += d; });
      stream.stderr.on('data', d => { process.stderr.write(d); err += d; });
    });
  });
}

function walkDir(dir, base) {
  if (!base) base = dir;
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) results.push(...walkDir(full, base));
    else results.push({ local: full, rel });
  }
  return results;
}

async function uploadFile(sftp, localPath, remotePath) {
  return new Promise((res, rej) => sftp.fastPut(localPath, remotePath, er => er ? rej(er) : res()));
}

// Server-side directories to sync (relative to scraper root)
const SERVER_DIRS = [
  'api',
  'core',
  'queue',
  'scrapers',
  'stealth',
  'proxy',
  'captcha',
  'parser',
  'utils',
];
// Individual root-level files
const SERVER_FILES = [
  'server.js',
  'worker.js',
  'config.js',
  'package.json',
  'ecosystem.config.js',
];

async function main() {
  // ── Step 1: Build Vite dashboard ──────────────────────────────────────────
  console.log('\n══ Step 1: Build Vite dashboard ══');
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    console.log('✓ Vite build complete');
  } catch (e) {
    console.error('✗ Build failed:', e.message);
    process.exit(1);
  }

  // ── Step 2: Connect to VPS ────────────────────────────────────────────────
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res);
    conn.on('error', rej);
    conn.connect(VPS);
  });
  console.log('✓ SSH connected');

  const sftp = await getSftp(conn);

  try {
    // ── Step 3: Upload server-side JS files ───────────────────────────────
    console.log('\n══ Step 3: Sync server-side files ══');

    // Ensure remote dirs exist
    await sshRun(conn, 'mkdir -p /opt/leadscan');

    // Upload root-level files
    for (const f of SERVER_FILES) {
      const localPath = path.join(ROOT, f);
      if (!fs.existsSync(localPath)) { console.log('  skip (not found):', f); continue; }
      const remotePath = '/opt/leadscan/' + f;
      await uploadFile(sftp, localPath, remotePath);
      console.log('  ✓', f);
    }

    // Upload directory trees
    for (const dir of SERVER_DIRS) {
      const localDir = path.join(ROOT, dir);
      if (!fs.existsSync(localDir)) { console.log('  skip (not found):', dir); continue; }

      const files = walkDir(localDir, localDir);
      // Create all subdirs first
      const subdirs = new Set(files.map(f => path.dirname(f.rel)).filter(d => d !== '.'));
      for (const sub of subdirs) {
        await sshRun(conn, `mkdir -p /opt/leadscan/${dir}/${sub}`, true);
      }
      await sshRun(conn, `mkdir -p /opt/leadscan/${dir}`, true);

      for (const { local, rel } of files) {
        if (local.endsWith('.test.js') || local.includes('__tests__')) continue;
        const remotePath = `/opt/leadscan/${dir}/${rel}`;
        await uploadFile(sftp, local, remotePath);
        process.stdout.write('  ✓ ' + dir + '/' + rel + '\n');
      }
    }

    // ── Step 4: npm install on VPS (only if package.json changed) ─────────
    console.log('\n══ Step 4: npm install on VPS ══');
    await sshRun(conn, 'cd /opt/leadscan && npm install --omit=dev 2>&1 | tail -5');

    // ── Step 5: Upload dist/ into nginx container ─────────────────────────
    console.log('\n══ Step 5: Push dist/ into nginx container ══');
    await sshRun(conn, 'docker exec aion-edge-proxy-1 sh -c "mkdir -p /usr/share/nginx/leadscan/assets"');

    const distFiles = walkDir(path.join(ROOT, 'dist'));
    for (const { local, rel } of distFiles) {
      const tmpName = '/tmp/ls__' + rel.replace(/\//g, '__');
      await uploadFile(sftp, local, tmpName);
      await sshRun(conn, `docker cp ${tmpName} aion-edge-proxy-1:/usr/share/nginx/leadscan/${rel}`);
      process.stdout.write('  ✓ ' + rel + '\n');
    }

    // ── Step 6: PM2 restart ───────────────────────────────────────────────
    console.log('\n══ Step 6: PM2 restart ══');
    await sshRun(conn, 'pm2 restart leadscan-api leadscan-worker 2>&1 || pm2 startOrRestart /opt/leadscan/ecosystem.config.js 2>&1', true);
    await sshRun(conn, 'pm2 list');

    // ── Step 7: Health check ──────────────────────────────────────────────
    console.log('\n══ Step 7: Health check ══');
    await sshRun(conn, 'sleep 3 && curl -s http://localhost:3020/health | head -c 200');
    await sshRun(conn, 'curl -s -o /dev/null -w "HTTP /leadscan/ → %{http_code}\\n" http://localhost/leadscan/');

    console.log('\n✅ Deploy complete!');
    console.log('   Dashboard: http://204.168.184.50/leadscan/');
    console.log('   API:       http://204.168.184.50/leadscan/api/health');

  } finally {
    conn.end();
  }
}

main().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });
