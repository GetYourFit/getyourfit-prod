import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const guard = new URL('../.workflow/require-node', import.meta.url).pathname;

const hostTools = ['sh', 'sed', 'sort', 'head', 'printf', 'dirname', 'basename', 'env', 'echo', 'cut'];

function run(nodeVersion, npmBody, { command = guard, args = ['echo', 'ran'], cwd } = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'require-node-'));
  for (const name of hostTools) {
    for (const dir of ['/usr/bin', '/bin']) {
      if (existsSync(join(dir, name))) { symlinkSync(join(dir, name), join(bin, name)); break; }
    }
  }
  const tool = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  if (nodeVersion) tool('node', `echo v${nodeVersion}`);
  tool('npm', npmBody);
  try {
    return spawnSync(command, args, { encoding: 'utf8', cwd, env: { PATH: bin } });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
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

test('acceptance hook resolves itself when invoked by relative path from another directory', () => {
  const cwd = new URL('./', import.meta.url).pathname;
  const result = run('20.11.0', 'echo "npm $*"', { command: '../.workflow/acceptance', args: [], cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm exec --yes --package=node@24\.11\.0/);
});
