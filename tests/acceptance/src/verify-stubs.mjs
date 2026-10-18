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
  ['contrast', caseNames.contrast, /WCAG AA color-contrast failed.*public.*390px/],
  ['public-login-wall', caseNames.frontDoor, /public first screen has no labeled example outfit/],
  ['public-photo', caseNames.frontDoor, /public example photo is missing or a placeholder/],
  ['public-reason', caseNames.frontDoor, /public example has no explanation/],
  ['public-facts', caseNames.frontDoor, /invented wearer facts as real/],
  ['public-privacy', caseNames.frontDoor, /Privacy copy falsely claims hosted photos stay on the phone/],
  ['public-small-action', caseNames.frontDoor, /primary wardrobe action is too small to tap/],
  ['public-uncompressed', caseNames.frontDoor, /public application module is not compressed/],
  ['wardrobe-saved-device', caseNames.frontDoor, /False on-device storage claim on wardrobe\/account/],
  ['wardrobe-stays-device', caseNames.frontDoor, /False on-device storage claim on wardrobe\/account/],
  ['consent-device', caseNames.browser, /False on-device storage claim on garment consent/],
  ['garment-saved-device', caseNames.browser, /False on-device storage claim on saved garment\/outfit/],
  ['auth-loading', caseNames.frontDoor, /Signup loading has no status announcement/],
  ['auth-focus', caseNames.frontDoor, /Signup entry lost keyboard focus/],
  ['auth-password-help', caseNames.frontDoor, /Signup password requirements are not described/],
  ['auth-small-input', caseNames.frontDoor, /Phone signup inputs are too small/],
  ['auth-enter', caseNames.frontDoor, /Browser signup did not submit on Enter/],
  ['auth-error-focus', caseNames.frontDoor, /Signup error lost keyboard focus/],
  ['wardrobe-focus', caseNames.frontDoor, /Successful signup lost wardrobe focus/],
  ['auth-tap', caseNames.browser, /Browser signup did not submit on tap/],
  ['browser', caseNames.browser, /Signup action is missing from the account form/],
  ['browser-age-unchecked', caseNames.browser, /Unchecked 18\+ signup was not refused/],
  ['browser-age-missing', caseNames.browser, /Mandatory 18\+ confirmation checkbox is missing from signup/],
  ['empty-name', caseNames.browser, /Empty signup name was not refused/],
  ['signup', caseNames.signup, /Signup returned HTTP 503/],
  ['age-unchecked', caseNames.signup, /Unchecked age confirmation signup accepted without 18\+ confirmation/],
  ['age-missing', caseNames.signup, /Missing age confirmation signup accepted without 18\+ confirmation/],
  ['session', caseNames.signup, /Session returned HTTP 401/],
  ['duplicate', caseNames.signup, /Login after duplicate signup returned HTTP 401/],
  ['authentication', caseNames.authentication, /Wrong password accepted/],
  ['enumeration', caseNames.authentication, /different refusal body/],
  ['photo', caseNames.photo, /source image could not be decoded/],
  ['consent', caseNames.photo, /Invalid or non-consented upload accepted/],
  ['invalid-photo', caseNames.photo, /Invalid or non-consented upload accepted/],
  ['outfit', caseNames.outfit, /omits top, bottom or footwear/],
  ['photo-reuse', caseNames.outfit, /ignored the uploaded shirt/],
  ['read-isolation', caseNames.isolation, /accessible to another session/],
  ['update-isolation', caseNames.isolation, /accessible to another session/],
  ['delete-isolation', caseNames.isolation, /accessible to another session/],
  ['photo-isolation', caseNames.isolation, /accessible to another session/],
  ['list-isolation', caseNames.isolation, /leaked private garment/],
  ['anonymous-list-isolation', caseNames.isolation, /Anonymous wardrobe leaked private garment/],
  ['refresh-photo-render', caseNames.browser, /Reloaded garment image source does not match saved photoUrl/],
  ['unowned-outfit', caseNames.outfit, /outside the wearer's wardrobe/],
  ['single-shirt', caseNames.singleShirt, /Single-shirt wardrobe returned an outfit/],
  ['missing-weather', caseNames.missingFacts, /Unknown weather returned an outfit/],
  ['missing-dress-code', caseNames.missingFacts, /Unknown dress code returned an outfit/],
  ['unavailable-outfit', caseNames.outfit, /unavailable garment/],
  ['misfit-outfit', caseNames.outfit, /without confirmed fit/],
  ['weather-outfit', caseNames.outfit, /does not match known weather/],
  ['dress-code-outfit', caseNames.outfit, /does not match known dress code/],
  ['starter-budget-arithmetic', caseNames.starterPlan, /Budget allocation does not equal the spending ceiling/],
  ['starter-fake-purchasability', caseNames.starterPlan, /Starter plan contains a fake purchasability claim/],
  ['starter-impossible-constraints', caseNames.starterPlan, /Contradictory outfit needs were accepted instead of rejected/],
  ['starter-owned-plan-mixing', caseNames.starterPlan, /A planned need was added to the owned wardrobe/],
  ['shopping-private-link', caseNames.shopping, /Affiliate link carries tracking fields beyond the approved channel/],
  ['shopping-redirect-mismatch', caseNames.shopping, /Affiliate link does not lead to its named retailer section/],
];
const detections = [];
await mkdir(output, { recursive: true });
try {
  const good = await run();
  assert.equal(good.exitCode, 0, `Good contract stub failed: ${JSON.stringify(good.report)}`);
  assert.equal(good.report.summary.passed, Object.keys(caseNames).length);
  assert.equal(good.report.summary.skipped, 0);
  assert.deepEqual(new Set(mutations.map(([, name]) => name)), new Set(good.report.cases.map(item => item.name)), 'Every case needs a known-bad variant');
  for (const [mutation, name, intended] of mutations) {
    const result = await run(mutation, name);
    assert.equal(result.exitCode, 1, `Mutation ${mutation} did not fail the process`);
    assert.equal(result.report.cases.length, 1, `Mutation ${mutation} failed setup instead of its case`);
    assert.equal(result.report.cases[0].name, name);
    assert.equal(result.report.cases[0].status, 'failed', `Mutation ${mutation} escaped`);
    assert.match(result.report.cases[0].error, intended, `Mutation ${mutation} failed for a different reason than intended`);
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
