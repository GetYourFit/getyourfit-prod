import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { createPool } from '../server/db/postgres.mjs';

const caFile = fileURLToPath(new URL('../server/certs/supabase-root-2021-ca.crt', import.meta.url));
const ca = readFileSync(caFile, 'utf8');

test.beforeEach((t) => {
  for (const key of ['GYF_DATABASE_CA_FILE', 'GYF_DATABASE_SSL']) {
    const previous = process.env[key];
    delete process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
});

function clientFor(t, url) {
  const pool = createPool(url);
  t.after(() => pool.end());
  return new pg.Client(pool.options);
}

test('Postgres clients retain the configured CA and verify certificates despite URL SSL options', (t) => {
  process.env.GYF_DATABASE_CA_FILE = caFile;
  for (const options of ['sslmode=require', 'sslmode=no-verify', 'sslmode=disable', 'ssl=0', 'ssl=true',
    'uselibpqcompat=true&sslmode=require', `sslrootcert=${encodeURIComponent(caFile)}&sslmode=verify-ca&uselibpqcompat=true`]) {
    const client = clientFor(t, `postgres://wearer%40tenant:pass%3Aword@database.example.test:5433/wardrobe?${options}`);
    assert.equal(client.ssl.ca, ca, options);
    assert.equal(client.ssl.rejectUnauthorized, true, options);
    assert.equal(client.ssl.checkServerIdentity, undefined, options);
    assert.equal(client.host, 'database.example.test');
    assert.equal(client.port, 5433);
    assert.equal(client.user, 'wearer@tenant');
    assert.equal(client.password, 'pass:word');
    assert.equal(client.database, 'wardrobe');
  }
});

test('Postgres clients use Supabase trust roots or verified system trust for the actual remote host', (t) => {
  for (const host of ['db.example.supabase.co', 'aws-0-ap-south-1.pooler.supabase.com']) {
    const client = clientFor(t, `postgres://wearer:password@${host}/wardrobe?sslmode=no-verify`);
    assert.deepEqual(client.ssl, { rejectUnauthorized: true, ca });
  }
  const remote = clientFor(t, 'postgres://wearer:password@database.example.test/wardrobe?sslmode=no-verify');
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  const overriddenHost = clientFor(t, 'postgres://wearer:password@localhost/wardrobe?host=db.example.supabase.co&sslmode=disable');
  assert.equal(overriddenHost.host, 'db.example.supabase.co');
  assert.deepEqual(overriddenHost.ssl, { rejectUnauthorized: true, ca });
});

test('Postgres clients retain loopback and explicit isolated-test plaintext despite URL SSL options', (t) => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const client = clientFor(t, `postgres://wearer:password@${host}/wardrobe?sslmode=require`);
    assert.equal(client.ssl, false);
  }
  process.env.GYF_DATABASE_SSL = 'disable';
  const client = clientFor(t, 'postgres://wearer:password@postgres/wardrobe?sslmode=require');
  assert.equal(client.ssl, false);
});

test('Postgres clients cannot reparse a nested connection string to override application TLS', (t) => {
  const nested = encodeURIComponent('postgres://other:password@other.example.test/other?sslmode=no-verify');
  const client = clientFor(t, `postgres://wearer:password@database.example.test/wardrobe?connectionString=${nested}`);
  assert.equal(client.host, 'database.example.test');
  assert.equal(client.database, 'wardrobe');
  assert.deepEqual(client.ssl, { rejectUnauthorized: true });
});
