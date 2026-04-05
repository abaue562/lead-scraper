'use strict';
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

function getSftp(conn) { return new Promise((res, rej) => conn.sftp((er, sftp) => er ? rej(er) : res(sftp))); }
function sshRun(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (er, stream) => {
      if (er) return reject(er);
      stream.on('close', (code) => code !== 0 ? reject(new Error('exit ' + code + ': ' + out)) : resolve(out.trim()));
      stream.on('data', d => { process.stdout.write(d); out += d; });
      stream.stderr.on('data', d => process.stderr.write(d));
    });
  });
}

function walkDir(dir, base) {
  if (!base) base = dir;
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else {
      results.push({ local: full, rel });
    }
  }
  return results;
}

conn.on('ready', async () => {
  try {
    const sftp = await getSftp(conn);
    const distDir = path.join(__dirname, 'dist');
    const files = walkDir(distDir);
    console.log('Uploading', files.length, 'dist files to container...');

    // Ensure dirs exist in container
    await sshRun(conn, 'docker exec aion-edge-proxy-1 sh -c "mkdir -p /usr/share/nginx/leadscan/assets"');

    for (const { local, rel } of files) {
      const tmpName = '/tmp/leadscan__' + rel.replace(/\//g, '__');
      await new Promise((res, rej) => sftp.fastPut(local, tmpName, er => er ? rej(er) : res()));
      await sshRun(conn, 'docker cp ' + tmpName + ' aion-edge-proxy-1:/usr/share/nginx/leadscan/' + rel);
      process.stdout.write('  ✓ ' + rel + '\n');
    }

    console.log('Done. Testing...');
    await sshRun(conn, 'curl -s -o /dev/null -w "HTTP /leadscan/ → %{http_code}\\n" http://localhost/leadscan/');
    conn.end();
  } catch (e) {
    console.error('Error:', e.message);
    conn.end();
  }
}).connect({ host: '204.168.184.50', port: 22, username: 'root', password: 'Blendbright333' });
