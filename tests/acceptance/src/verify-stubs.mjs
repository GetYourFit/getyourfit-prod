import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mutations = new Map([
  ['registration', 'sign up'], ['verification', 'email verification'], ['login', 'sign in establishes session'], ['session-refresh', 'session survives a fresh'],
  ['logout', 'sign out clears session'], ['wrong-password', 'wrong password'], ['enumeration', 'unknown email'],
  ['unverified-login', 'unverified account'], ['expired-link', 'expired verification link'], ['reuse-link', 'verification link cannot be reused'],
  ['reset', 'password reset works'], ['weak-password', 'weak password'], ['duplicate-email', 'duplicate email'],
  ['lockout', 'trigger lockout'], ['logout-everywhere', 'sign out everywhere'], ['second-factor', 'second factor accepts'],
  ['age-confirmation', 'age confirmation is required'],
  ['deletion', 'deleting account'], ['export', 'account data export'], ['wrong-origin', 'cross-origin mutation'], ['csrf', 'without CSRF protection'],
  ['tenant-isolation', 'separate accounts'], ['vision', 'garment photo is interpreted'],
  ['correction-persistence', 'user correction persists'], ['provenance', 'ownership and provenance'],
  ['outfit-generation', 'natural-language request returns'], ['wardrobe-reuse', 'recommendation reuses owned'],
  ['low-confidence', 'low-confidence request asks'], ['browser', 'reachable in a real browser'],
  ['browser-auth', 'browser account journey'],
  ['offline-recovery', 'offline wardrobe state'], ['server-down-recovery', 'server-down wardrobe state'],
  ['responsive', 'responsive layout'], ['keyboard', 'keyboard can reach'], ['accessibility', 'WCAG accessibility'], ['security-headers', 'security headers'],
  ['performance', 'performance budget'], ['console', 'no console errors'],
]);

const detections = [];

run({}).then(async code => {
  if (code !== 0) throw new Error('good stub failed');
  const report = JSON.parse(await readFile(path.join(root, 'results/report.json'), 'utf8'));
  if (report.summary.failed !== 0 || report.summary.not_yet_applicable !== 0) throw new Error('good stub report is incomplete or has failures');
}).then(async () => {
  for (const [mutation, caseName] of mutations) {
    const code = await run({ MUTATION: mutation });
    if (code === 0) throw new Error(`mutation ${mutation} escaped detection`);
    const report = JSON.parse(await readFile(path.join(root, 'results/report.json'), 'utf8'));
    const target = report.cases.find(c => c.name.toLowerCase().includes(caseName.toLowerCase()));
    if (!target || target.status !== 'failed') throw new Error(`mutation ${mutation} did not fail its target case (${caseName})`);
    detections.push({ mutation, target: target.name, detected: true });
    process.stdout.write(`detected ${mutation} -> ${target.name}\n`);
  }
  const code = await run({});
  if (code !== 0) throw new Error('good stub failed on final report run');
  await writeFile(path.join(root, 'results/stub-mutations.json'), `${JSON.stringify({ schema: 'gyf-acceptance-mutations/v1', total: detections.length, detected: detections.length, cases: detections }, null, 2)}\n`);
}).catch(error => { console.error(error); process.exitCode = 1; });

function run(extra) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(here, 'run.mjs')], { cwd: root, env: { ...process.env, ACCEPTANCE_STUB: '1', ...extra } });
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.on('close', code => resolve(code === null ? 1 : code));
  });
}
