import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const guard = new URL('../.workflow/require-node', import.meta.url).pathname;

function run(nodeVersion, npmBody) {
  const bin = mkdtempSync(join(tmpdir(), 'require-node-'));
  const tool = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  if (nodeVersion) tool('node', `echo v${nodeVersion}`);
  tool('npm', npmBody);
  return spawnSync(guard, ['echo', 'ran'], {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin` },
  });
}

test('runs the command when the runtime meets the engines floor', () => {
  const result = run('22.18.0', 'echo npm-called; exit 1');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'ran');
});

test('provisions the pinned Node when the runtime is older', () => {
  const result = run('20.11.0', 'echo "npm $*"');
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Node\.js >=22\.18 is required, found 20\.11\.0/);
  assert.match(result.stdout, /npm exec --yes --package=node@24\.11\.0/);
});

test('provisions the pinned Node when none is installed', () => {
  const result = run(null, 'echo provisioned');
  assert.equal(result.status, 0);
  assert.match(result.stderr, /found none/);
  assert.equal(result.stdout.trim(), 'provisioned');
});

test('fails clearly when provisioning still yields an older runtime', () => {
  const result = run('20.11.0', 'REQUIRE_NODE_PROVISIONED=1 exec "$(echo "$@" | sed "s/.*-- //" | cut -d" " -f1)" echo ran');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /after provisioning node@24\.11\.0/);
});
