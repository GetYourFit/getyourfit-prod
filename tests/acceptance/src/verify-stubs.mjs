import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { caseNames } from './contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.ACCEPTANCE_OUTPUT || await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-mutations-'));
const scratch = await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-verifier-'));
const mutations = [
  ['browser', caseNames.browser],
  ['signup', caseNames.signup],
  ['session', caseNames.signup],
  ['duplicate', caseNames.signup],
  ['authentication', caseNames.authentication],
  ['enumeration', caseNames.authentication],
  ['photo', caseNames.photo],
  ['consent', caseNames.photo],
  ['invalid-photo', caseNames.photo],
  ['outfit', caseNames.outfit],
  ['photo-reuse', caseNames.outfit],
  ['read-isolation', caseNames.isolation],
  ['update-isolation', caseNames.isolation],
  ['delete-isolation', caseNames.isolation],
  ['photo-isolation', caseNames.isolation],
  ['list-isolation', caseNames.isolation],
];
const detections = [];
await mkdir(output, { recursive: true });
try {
  const good = await run();
  assert.equal(good.exitCode, 0, `Good contract stub failed: ${JSON.stringify(good.report)}`);
  assert.equal(good.report.summary.passed, Object.keys(caseNames).length);
  assert.equal(good.report.summary.skipped, 0);
  assert.deepEqual(new Set(mutations.map(([, name]) => name)), new Set(good.report.cases.map(item => item.name)), 'Every case needs a known-bad variant');
  for (const [mutation, name] of mutations) {
    const result = await run(mutation, name);
    assert.equal(result.exitCode, 1, `Mutation ${mutation} did not fail the process`);
    assert.equal(result.report.cases.length, 1, `Mutation ${mutation} failed setup instead of its case`);
    assert.equal(result.report.cases[0].name, name);
    assert.equal(result.report.cases[0].status, 'failed', `Mutation ${mutation} escaped`);
    detections.push({ mutation, name, detected: true, evidence: result.report.cases[0].error });
    console.log(`detected ${mutation}`);
  }
  await writeFile(path.join(output, 'stub-mutations.json'), `${JSON.stringify({ schema: 'gyf-acceptance-mutations/v2', release: 'v0.1', good: good.report.summary, total: detections.length, detected: detections.length, mutations: detections }, null, 2)}\n`);
  console.log(`Mutation proof: ${path.join(output, 'stub-mutations.json')}`);
} finally { await rm(scratch, { recursive: true, force: true }); }

async function run(mutation, only) {
  const resultDir = await mkdtemp(path.join(scratch, 'run-'));
  const args = [path.join(root, 'src/run.mjs'), '--stub'];
  if (only) args.push('--only', only);
  const child = spawn(process.execPath, args, { env: { ...process.env, MUTATION: mutation || '', ACCEPTANCE_OUTPUT: resultDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { diagnostics = (diagnostics + bytes.toString()).slice(-10000); });
  const timer = setTimeout(() => child.kill('SIGTERM'), 90000);
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); }).finally(() => clearTimeout(timer));
  const report = await readFile(path.join(resultDir, 'report.json'), 'utf8').then(JSON.parse).catch(error => { throw new Error(`Runner emitted no report (${exitCode}): ${diagnostics}`, { cause: error }); });
  return { exitCode, report };
}
