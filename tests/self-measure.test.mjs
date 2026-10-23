import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { readCohort } from '../scripts/self-measure/reader.mjs';
import { acceptedQuality } from '../scripts/self-measure/quality.mjs';
import { weeklyWindow, propose, recommendation } from '../scripts/self-measure/recommend.mjs';
import { caseNames } from './acceptance/src/contract.js';

const execute = promisify(execFile);
const window = weeklyWindow('2026-10-23T06:00:00Z');
const counts = { signups: 40, matureSignups: 40, pendingSignups: 0, firstSelectedWithin7Days: 10, returnedWithin7Days: 15 };
const fixture = (extra = {}) => ({ contractVersion: 1, status: 'available', ...window, counts,
  rates: { firstSelectedWithin7Days: .25, returnedWithin7Days: .375 }, ...extra });
const temp = async (t) => { const dir = await mkdtemp(join(tmpdir(), 'gyf-reader-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };
async function reader(t, result) {
  const dir = await temp(t);
  const moduleUrl = pathToFileURL(join(dir, 'reader.mjs'));
  await writeFile(moduleUrl, `export async function readOutcomeCohort() { return ${JSON.stringify(result)}; }`);
  return readCohort(window, { moduleUrl });
}
const receipt = (extra = {}) => ({ schema: 'gyf-acceptance-report/v2', source: 'production-build', runtime: 'production-start',
  head_sha: 'a'.repeat(40), worktree_clean: true, started_at: window.asOf,
  summary: { total: Object.keys(caseNames).length, passed: Object.keys(caseNames).length, failed: 0, skipped: 0 },
  cases: Object.values(caseNames).map((name) => ({ name, status: 'passed' })), ...extra });
const quality = (r) => acceptedQuality(JSON.stringify(r), { head: 'a'.repeat(40), asOf: window.asOf });

test('uses completed weekly cohorts with all return windows elapsed, including timezone and Monday boundaries', () => {
  assert.equal(window.from, '2026-10-05T00:00:00.000Z');
  assert.equal(window.to, '2026-10-12T00:00:00.000Z');
  assert.deepEqual(weeklyWindow('2026-10-19T05:30:00+05:30'), { ...window, asOf: '2026-10-19T00:00:00.000Z' });
});

test('canonical reader accepts only aggregate allowlist and validates rates and suppression', async (t) => {
  const result = await reader(t, fixture({ private: 'secret-example', counts: { ...counts, userId: 'private-id' } }));
  assert.deepEqual(result, fixture());
  assert.doesNotMatch(JSON.stringify(result), /secret-example|private-id|userId/);
  for (const bad of [fixture({ contractVersion: 2 }), fixture({ status: 'suppressed', counts: null, rates: null }),
    fixture({ status: 'unavailable' }), fixture({ counts: { ...counts, firstSelectedWithin7Days: 1 } }),
    fixture({ counts: { ...counts, matureSignups: 39 } }), fixture({ from: 'wrong' }),
    fixture({ rates: { firstSelectedWithin7Days: .9, returnedWithin7Days: .375 } })]) {
    assert.equal((await reader(t, bad)).status, 'insufficient_data');
  }
});

test('absent version, absent producer and failing producer cannot become zero or success', async (t) => {
  const dir = await temp(t);
  const moduleUrl = pathToFileURL(join(dir, 'absent.mjs'));
  assert.deepEqual(await readCohort(window, { moduleUrl }), { status: 'insufficient_data', reason: 'reader_not_landed' });
  await writeFile(moduleUrl, 'export const contractVersion = 1;');
  assert.equal((await readCohort(window, { moduleUrl })).reason, 'reader_version_absent');
  const failing = pathToFileURL(join(dir, 'failing.mjs'));
  await writeFile(failing, 'throw new Error("private-token-must-not-escape");');
  const result = await readCohort(window, { moduleUrl: failing });
  assert.equal(result.reason, 'reader_failed');
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
});

test('immature cohort is insufficient evidence for a candidate', async (t) => {
  const result = await reader(t, fixture({ counts: { ...counts, matureSignups: 0, pendingSignups: 40, firstSelectedWithin7Days: 0, returnedWithin7Days: 0 },
    rates: { firstSelectedWithin7Days: null, returnedWithin7Days: null } }));
  assert.equal(result.status, 'available');
  assert.equal(propose(result, {}).reason, 'no_mature_observation');
});

test('only complete, fresh, exact-version production quality evidence is accepted', () => {
  const result = quality(receipt({ base_url: 'https://private.example', error: 'private@example.com' }));
  assert.equal(result.status, 'available');
  assert.equal(result.acceptance.rate, 1);
  assert.equal(result.accessibility.total, 1);
  assert.doesNotMatch(JSON.stringify(result), /private|example.com/);
  for (const bad of [receipt({ source: 'contract-stub' }), receipt({ worktree_clean: false }), receipt({ head_sha: 'b'.repeat(40) }),
    receipt({ started_at: '2026-09-01T00:00:00Z' }), receipt({ started_at: '2026-11-01T00:00:00Z' }),
    receipt({ cases: receipt().cases.slice(1) }), receipt({ cases: receipt().cases.map(() => receipt().cases[0]) }),
    receipt({ summary: { total: 12, passed: 12, failed: 0, skipped: 1 } })]) {
    assert.equal(quality(bad).status, 'insufficient_data');
  }
});

test('one bounded proposal is selected by actual weakest observed rate and never grants adoption authority', () => {
  const signal = propose(fixture(), {});
  assert.equal(signal.metric, 'firstSelectedWithin7Days');
  assert.equal(signal.baseline, .25);
  assert.equal(recommendation(signal, { status: 'insufficient_data', reason: 'two_distinct_observations_required' }).status, 'insufficient_data');
  const candidate = recommendation(signal, { status: 'eligible', queueItems: [{ item: 'Q-1' }] });
  assert.equal(candidate.status, 'proposed');
  assert.equal(candidate.maxChanges, 1);
  assert.equal(candidate.adoption, 'no-mistakes');
  assert.equal(candidate.outcome, 'No improvement established.');
  assert.match(candidate.authority, /No source writes/);
  const failed = receipt();
  failed.cases[0].status = 'failed'; failed.summary.failed = 1; failed.summary.passed -= 1;
  assert.equal(propose(fixture(), quality(failed)).metric, 'accepted_journey_pass_rate');
});

test('weekly public command refuses source execution flags without leaking supplied content', async () => {
  await assert.rejects(execute(process.execPath, ['scripts/self-measure.mjs', '--execute', 'private-token']),
    (error) => error.code === 1 && !error.stderr.includes('private-token'));
});

test('existing workflow ingestion, kept change, known-bad regression, contradiction and undo', {
  skip: !process.env.GYF_WORKFLOW_ROOT && 'Set GYF_WORKFLOW_ROOT to the canonical Workflow checkout for the integration drill.',
}, async () => {
  const command = await execute(process.execPath, ['scripts/self-measure.mjs', '--workflow', process.env.GYF_WORKFLOW_ROOT]);
  const actual = JSON.parse(command.stdout);
  assert.notEqual(actual.workflow.reason, 'workflow_interface_unavailable');
  assert.ok(Array.isArray(actual.workflow.observations));
  const { stdout } = await execute('uv', ['run', '--no-project', '--offline', '--no-cache', 'scripts/self-measure/prove-workflow.py', '--workflow', process.env.GYF_WORKFLOW_ROOT], { timeout: 60000 });
  const proof = JSON.parse(stdout);
  assert.equal(proof.synthetic, true);
  assert.deepEqual(proof.queueTransitions, ['insufficient_data', 'eligible']);
  assert.deepEqual(proof.outcomes.map((row) => row.decision), ['kept', 'discarded', 'discarded', 'inconclusive']);
  assert.ok(proof.outcomes.every((row) => row.undoVerified));
  assert.equal(proof.productionChanges, false);
});
