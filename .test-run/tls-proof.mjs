import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createPool } from '../server/db/postgres.mjs';
const root = path.resolve('.test-run/tls');
fs.mkdirSync(root, { recursive: true });
const key = path.join(root, 'server.key');
const cert = path.join(root, 'server.crt');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost.', '-addext', 'subjectAltName=DNS:localhost.,DNS:localhost'], { stdio: 'ignore' });
fs.chmodSync(key, 0o600);
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const password = randomBytes(24).toString('hex');
const database = new EmbeddedPostgres({ databaseDir: path.join(root, 'data'), user: 'postgres', password, port, persistent: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-c', 'ssl=on', '-c', `ssl_cert_file=${cert}`, '-c', `ssl_key_file=${key}`] });
const proof = { backend: 'Postgres 17', host: 'localhost.', connections: [] };
try {
  await database.initialise();
  await database.start();
  process.env.GYF_DATABASE_CA_FILE = cert;
  delete process.env.GYF_DATABASE_SSL;
  for (const mode of ['require', 'no-verify', 'disable']) {
    const pool = createPool(`postgres://postgres:${password}@localhost.:${port}/postgres?sslmode=${mode}`);
    try {
      const { rows } = await pool.query('SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
      assert.equal(rows[0].ssl, true);
      proof.connections.push({ urlSslMode: mode, configuredCaTrusted: true, ...rows[0] });
    } finally { await pool.end(); }
  }
  const databaseURL = `postgres://postgres:${password}@localhost.:${port}/postgres?sslmode=require`;
  proof.migrationFirstRun = execFileSync(process.execPath, ['server/migrate.mjs'], { env: { ...process.env, DATABASE_URL: databaseURL }, encoding: 'utf8' }).trim();
  proof.migrationSecondRun = execFileSync(process.execPath, ['server/migrate.mjs'], { env: { ...process.env, DATABASE_URL: databaseURL }, encoding: 'utf8' }).trim();
  assert.match(proof.migrationSecondRun, /No pending migrations/);
  delete process.env.GYF_DATABASE_CA_FILE;
  const refused = createPool(`postgres://postgres:${password}@localhost.:${port}/postgres?sslmode=no-verify`);
  try {
    await assert.rejects(refused.query('SELECT 1'), error => {
      proof.untrustedCertificate = { urlSslMode: 'no-verify', rejected: true, code: error.code };
      return ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code);
    });
  } finally { await refused.end(); }
  process.env.GYF_DATABASE_SSL = 'disable';
  const plaintext = createPool(databaseURL);
  try {
    const { rows } = await plaintext.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    assert.equal(rows[0].ssl, false);
    proof.explicitIsolatedTestPlaintext = rows[0];
  } finally { await plaintext.end(); }
  fs.writeFileSync(process.env.PROOF_OUTPUT, JSON.stringify(proof, null, 2));
} finally {
  await database.stop().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
