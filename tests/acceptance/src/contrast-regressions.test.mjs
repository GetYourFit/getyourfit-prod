import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { caseNames } from './contract.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('R7 good stub completes every contrast scan and bad contrast remains rejected', async t => {
  const scratch = path.join(root, '.gyf-data');
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, 'contrast-regressions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const mutation of ['', 'contrast']) {
    const output = path.join(directory, mutation || 'good');
    const child = spawn(process.execPath, ['tests/acceptance/src/run.mjs', '--stub', '--only', caseNames.contrast], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MUTATION: mutation, ACCEPTANCE_OUTPUT: output, TMPDIR: directory },
    });
    let diagnostics = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostics += chunk; });
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.source, 'contract-stub');
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].name, caseNames.contrast);
    if (mutation) {
      assert.equal(exitCode, 1, diagnostics);
      assert.equal(report.cases[0].status, 'failed');
      assert.match(report.cases[0].error, /WCAG AA color-contrast failed on public at 390px/);
    } else {
      assert.equal(exitCode, 0, JSON.stringify(report.cases));
      assert.equal(report.cases[0].status, 'passed');
      const scans = JSON.parse(await readFile(path.join(output, 'contrast.json'), 'utf8'));
      assert.deepEqual(scans.map(({ surface, width }) => [surface, width]),
        ['public', 'sign-in', 'signup', 'wardrobe-account'].flatMap(surface => [390, 768, 1440].map(width => [surface, width])));
      for (const scan of scans) {
        assert.deepEqual(scan.violations, []);
        assert.deepEqual(scan.incomplete, []);
        assert(scan.checked_nodes > 0);
      }
    }
  }
});
