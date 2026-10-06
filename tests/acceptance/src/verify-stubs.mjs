import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectRoot = path.resolve(root, '../..');
const runner = path.join(here, 'run.mjs');
const reportPath = path.join(root, 'results/report.json');
const mutationsPath = path.join(root, 'results/stub-mutations.json');
const mutations = [
  ['registration', 'R26 sign up creates account and verification mail'],
  ['browser-auth', 'R26 browser account journey signs up verifies signs in refreshes and signs out'],
  ['verification', 'R26 email verification activates account'],
  ['login', 'R26 sign in establishes session'],
  ['session-refresh', 'R26 session survives a fresh browser context'],
  ['logout', 'R26 sign out clears session'],
  ['wrong-password', 'R26 wrong password is refused'],
  ['enumeration', 'R26 unknown email does not reveal account existence'],
  ['unverified-login', 'R26 unverified account cannot sign in'],
  ['expired-link', 'R26 expired verification link is refused'],
  ['reuse-link', 'R26 verification link cannot be reused'],
  ['reset', 'R26 password reset works and reset link cannot be reused'],
  ['reset-mail-race', 'R26 password reset works and reset link cannot be reused'],
  ['password-reset-revocation', 'R26 password reset works and reset link cannot be reused'],
  ['weak-password', 'R26 weak password is rejected'],
  ['duplicate-email', 'R26 duplicate email is refused without account takeover'],
  ['age-confirmation', 'R26 age confirmation is required without collecting birth date'],
  ['lockout', 'R26 repeated failed passwords trigger lockout'],
  ['rate-controls', 'R27 sign-in and reset mutations enforce rate controls'],
  ['logout-everywhere', 'R26 sign out everywhere revokes other sessions'],
  ['second-factor', 'R26 second factor accepts correct code and rejects wrong code'],
  ['deletion', 'R26 deleting account prevents later sign in'],
  ['export', 'R26 account data export returns an owned archive'],
  ['wrong-origin', 'R27 cross-origin mutation is refused'],
  ['missing-origin', 'R27 missing-origin mutation is refused'],
  ['csrf', 'R27 cross-site state changes are refused'],
  ['tenant-isolation', 'R27 separate accounts cannot read each other data'],
  ['tenant-update-isolation', 'R27 separate accounts cannot read each other data'],
  ['tenant-delete-isolation', 'R27 separate accounts cannot read each other data'],
  ['vision', 'R7 garment photo is interpreted without claiming ownership'],
  ['photo-consent', 'A08 asks consent and rejects corrupt or unsupported garment photos locally'],
  ['unsupported-photo', 'A08 asks consent and rejects corrupt or unsupported garment photos locally'],
  ['photo-resize', 'A08 asks consent and rejects corrupt or unsupported garment photos locally'],
  ['correction-persistence', 'R7 user correction persists and changes wardrobe state'],
  ['provenance', 'R9 wardrobe ownership and provenance are explicit'],
  ['outfit-generation', 'R5 explicit occasion weather and dress-code facts return complete outfits'],
  ['wardrobe-reuse', 'R9 outfit recommendation reuses only owned wardrobe garments'],
  ['incomplete-outfit', 'R11 unavailable candidates yield no complete outfit'],
  ['low-confidence', 'R19 missing required facts trigger one clarification or abstention'],
  ['offline-recovery', 'A-1 offline wardrobe state offers recovery'],
  ['server-down-recovery', 'A17 server-down sign-in preserves fields and offers safe recovery'],
  ['responsive', 'A-1 responsive layout fits 320px through 1440px including 390px'],
  ['keyboard', 'A-1 keyboard reaches the primary action'],
  ['accessibility', 'A-1 page passes automated WCAG accessibility checks'],
  ['console', 'A-1 browser has no console errors or exposed test credentials'],
  ['log-privacy', 'R26 private account data is absent from service logs'],
  ['security-headers', 'A-1 production page sends baseline security headers'],
  ['performance-budget', 'A-1 landing document meets the 2.5 second load budget'],
  ['browser', 'A-1 app is reachable in a real browser'],
];

const requirementsSource = await readFile(path.join(projectRoot, 'docs/requirements.md'), 'utf8');
const matrixSource = await readFile(path.join(projectRoot, 'docs/slice-1-acceptance.md'), 'utf8');
const fixtureDir = await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-verifier-'));
const requirementsPath = path.join(fixtureDir, 'requirements.md');
const matrixPath = path.join(fixtureDir, 'acceptance.md');
const detections = [];
try {
  await writeFile(requirementsPath, rewriteRequirementRows(requirementsSource));
  await writeFile(matrixPath, rewriteAcceptanceRows(matrixSource));
  const good = await runStub({ requirementsPath, matrixPath });
  const goodReport = await report();
  if (goodReport.summary.failed !== 0 || goodReport.summary.not_yet_applicable !== 1 || goodReport.cases.filter(item => item.status === 'not_yet_applicable')[0]?.acceptance_ids?.[0] !== 'A18') {
    throw new Error(`good stub did not cover all locally defined cases: ${JSON.stringify(goodReport.summary)}`);
  }
  if (good.code !== 1) throw new Error(`good stub returned ${good.code}; one explicit A18 external regression case is not yet applicable`);
  for (const [mutation, caseName] of mutations) {
    const result = await runStub({ requirementsPath, matrixPath, mutation, only: caseName });
    const current = await report();
    const target = current.cases.find(item => item.name === caseName);
    if (result.code === 0 || target?.status !== 'failed') throw new Error(`mutation ${mutation} escaped detection in ${caseName}`);
    detections.push({ mutation, target: caseName, detected: true });
    process.stdout.write(`detected ${mutation} -> ${caseName}\n`);
  }
  await verifyRequirementStatusGating(requirementsPath, matrixPath);
  await verifyMalformedStatuses(requirementsSource, matrixSource);
  await verifyProductionIdentity();
  await verifyExitedChildDoesNotKillForeignListener(requirementsPath, matrixPath);
  await writeFile(mutationsPath, `${JSON.stringify({ schema: 'gyf-acceptance-mutations/v1', total: detections.length, detected: detections.length, cases: detections }, null, 2)}\n`);
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}

async function verifyRequirementStatusGating(reqPath, matrix) {
  for (const [id, caseName] of [
    ['R26', 'R26 sign up creates account and verification mail'],
    ['R9', 'R9 wardrobe ownership and provenance are explicit'],
    ['A-1:all-states-accessibility-responsive-behavior-security-and-visual-review', 'A-1 keyboard reaches the primary action'],
  ]) {
    const pendingPath = path.join(fixtureDir, `${slug(id)}-pending.md`);
    await writeFile(pendingPath, rewriteRequirementRows(requirementsSource, { [id]: 'slice1-pending' }));
    const result = await runStub({ requirementsPath: pendingPath, matrixPath: matrix, only: caseName });
    const current = await report();
    const target = current.cases.find(item => item.name === caseName);
    if (target?.status !== 'not_yet_applicable' || result.code !== 1) throw new Error(`${id} pending did not gate ${caseName} as explicit non-pass`);
  }
  const activePath = path.join(fixtureDir, 'R26-active.md');
  await writeFile(activePath, rewriteRequirementRows(requirementsSource, { R26: 'slice1-ready', R9: 'slice1-ready' }));
  const active = await runStub({ requirementsPath: activePath, matrixPath: matrix, only: 'R26 sign up creates account and verification mail' });
  const activeReport = await report();
  if (active.code !== 0 || activeReport.summary.passed !== 1) throw new Error('non-pending written status did not make its case execute');
}

async function verifyMalformedStatuses(requirements, matrix) {
  const r26Line = requirements.split('\n').find(line => /^\|\s*R26\s*\|/.test(line));
  const a02Line = matrix.split('\n').find(line => /^\|\s*A02\s*\|/.test(line));
  const fixtures = [
    ['missing R26', requirements.replace(`${r26Line}\n`, '') , matrix],
    ['duplicate R26', requirements.replace(r26Line, `${r26Line}\n${r26Line}`), matrix],
    ['empty R26 status', requirements.replace(r26Line, r26Line.replace(/\|\s*slice1-pending\s*\|/, '|  |')), matrix],
    ['missing A02', rewriteRequirementRows(requirements), matrix.replace(`${a02Line}\n`, '')],
    ['empty A02 result', rewriteRequirementRows(requirements), matrix.replace(a02Line, a02Line.replace(/\|\s*Pending\s*\|/, '|  |'))],
  ];
  for (const [label, reqText, matrixText] of fixtures) {
    const reqPath = path.join(fixtureDir, `${slug(label)}-requirements.md`);
    const acceptancePath = path.join(fixtureDir, `${slug(label)}-acceptance.md`);
    await writeFile(reqPath, reqText);
    await writeFile(acceptancePath, matrixText);
    const result = await runStub({ requirementsPath: reqPath, matrixPath: acceptancePath, only: 'R26 sign up creates account and verification mail' });
    const current = await report();
    if (result.code === 0 || current.cases[0]?.name !== 'runner setup' || current.cases[0]?.status !== 'failed') throw new Error(`malformed status fixture was accepted: ${label}`);
  }
}

async function verifyProductionIdentity() {
  const env = { ...process.env, ACCEPTANCE_STUB: '1' };
  const result = await runProcess('npm', ['run', 'acceptance'], { cwd: projectRoot, env, timeout: 180000 });
  const current = await report();
  if (current.source !== 'production-build') throw new Error(`inherited ACCEPTANCE_STUB redirected the normal command to ${current.source}`);
  if (result.timedOut) throw new Error('normal production command did not finish during the product-identity check');
}

async function verifyExitedChildDoesNotKillForeignListener(reqPath, acceptancePath) {
  const probe = await fetch('http://127.0.0.1:4179').then(response => response.text()).catch(() => null);
  if (probe !== null) throw new Error('port 4179 is already occupied; refusing to reuse or terminate an unknown listener');
  const foreign = spawn(process.execPath, ['-e', "require('node:http').createServer((_,res)=>res.end('foreign-listener')).listen(4179,'127.0.0.1')"], { stdio: 'ignore' });
  try {
    await waitForURL('http://127.0.0.1:4179');
    const run = await runProcess(process.execPath, [runner, '--stub', '--requirements-file', reqPath, '--acceptance-file', acceptancePath], { cwd: projectRoot, env: cleanEnv(), timeout: 5000 });
    if (run.code === 0 || run.timedOut) throw new Error('stub runner did not exit promptly when its owned child could not bind');
    const after = await fetch('http://127.0.0.1:4179').then(response => response.text());
    if (after !== 'foreign-listener') throw new Error('stub cleanup terminated or replaced the foreign listener');
  } finally {
    if (foreign.exitCode === null && foreign.signalCode === null) {
      const exited = new Promise(resolve => foreign.once('exit', resolve));
      foreign.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))]);
      if (foreign.exitCode === null && foreign.signalCode === null) foreign.kill('SIGKILL');
    }
  }
}

async function runStub({ requirementsPath, matrixPath, mutation, only }) {
  const args = [runner, '--stub', '--requirements-file', requirementsPath, '--acceptance-file', matrixPath];
  if (only) args.push('--only', only);
  const env = cleanEnv();
  if (mutation) env.MUTATION = mutation;
  return runProcess(process.execPath, args, { cwd: projectRoot, env, timeout: 180000 });
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.ACCEPTANCE_STUB;
  delete env.MUTATION;
  return env;
}

async function report() {
  return JSON.parse(await readFile(reportPath, 'utf8'));
}

function rewriteRequirementRows(source, overrides = {}) {
  let inAcceptanceA1 = false;
  return source.split('\n').map(line => {
    if (line.trim() === '## Acceptance A-1') { inAcceptanceA1 = true; return line; }
    if (inAcceptanceA1 && line.startsWith('## ')) inAcceptanceA1 = false;
    const cells = line.split('|');
    const id = cells[1]?.trim();
    if (/^R\d+$/.test(id || '')) cells[2] = ` ${overrides[id] || 'slice1-ready'} `;
    else if (inAcceptanceA1 && id && id !== 'Area' && !id.startsWith('---')) {
      const key = `A-1:${slug(id)}`;
      cells[2] = ` ${overrides[key] || 'slice1-ready'} `;
    }
    return cells.join('|');
  }).join('\n');
}

function rewriteAcceptanceRows(source) {
  return source.split('\n').map(line => {
    if (/^\|\s*A\d{2}\s*\|/.test(line)) return line.replace(/\|\s*Pending\s*\|/, '| Ready |');
    return line;
  }).join('\n');
}

function runProcess(command, args, { cwd, env, timeout }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'ignore' });
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code: code ?? 1, signal, timedOut: code === null }); });
  });
}

async function waitForURL(url) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`listener did not become ready at ${url}`);
}

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
