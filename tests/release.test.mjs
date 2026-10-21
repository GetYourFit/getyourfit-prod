import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { start } from './support/server.mjs';

const probe = new URL('../scripts/check-release.mjs', import.meta.url).pathname;

test('public release identifies the built artifact and the probe rejects another revision', async (t) => {
  const built = JSON.parse(readFileSync(new URL('../dist/release.json', import.meta.url), 'utf8'));
  assert.match(built.revision, /^[a-f0-9]{40}$/);
  const { origin, request } = await start(t);
  const response = await request({ route: '/api/release' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, built);
  const wrong = built.revision === '0'.repeat(40) ? '1'.repeat(40) : '0'.repeat(40);
  assert.equal(spawnSync(process.execPath, [probe, origin, wrong]).status, 1);
  assert.equal(spawnSync(process.execPath, [probe, origin, built.revision]).status, built.modified ? 1 : 0);
  assert.equal(built.revision, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
});

test('probe rejects invalid arguments before accessing a target', () => {
  for (const args of [[], ['https://example.test/path', 'a'.repeat(40)], ['http://example.test', 'a'.repeat(40)], ['https://example.test', 'main'], ['--unknown']]) {
    assert.equal(spawnSync(process.execPath, [probe, ...args]).status, 2);
  }
});

test('release metadata rejects missing and malformed artifacts without disclosing paths', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { readRelease } = await import('../server/release.mjs');
  const directory = mkdtempSync(path.join(tmpdir(), 'gyf-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'release.json');
  assert.equal(readRelease(file), null);
  for (const value of ['{', '{}', 'null', JSON.stringify({ revision: 'main', modified: false }), JSON.stringify({ revision: 'a'.repeat(40), modified: 'false' })]) {
    writeFileSync(file, value);
    assert.equal(readRelease(file), null);
  }
});
