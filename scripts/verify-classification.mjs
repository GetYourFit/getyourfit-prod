import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tests/acceptance/node_modules/playwright/index.mjs';

if (process.argv[2] === '--browser') {
  const context = await chromium.launchPersistentContext(process.argv[3], { headless: true, args: [`--remote-debugging-port=${process.argv[4]}`] });
  await context.addInitScript(() => {
    if (new URLSearchParams(globalThis.location.search).get('recognition-test') === 'wasm') {
      delete globalThis.Navigator.prototype.gpu;
      Object.defineProperty(navigator, 'gpu', { value: undefined });
    }
  });
  process.send?.('ready');
  await new Promise((resolve) => process.once('SIGTERM', resolve));
  await context.close();
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gyf-classification-'));
const proof = process.env.GYF_PROOF_DIR;
const session = `gyf-classification-${process.pid}`;
const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const address = probe.address();
assert.ok(address && typeof address === 'object');
const port = address.port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const browserProbe = net.createServer();
await new Promise((resolve) => browserProbe.listen(0, '127.0.0.1', resolve));
const browserAddress = browserProbe.address();
assert.ok(browserAddress && typeof browserAddress === 'object');
const browserUrl = `http://127.0.0.1:${browserAddress.port}`;
await new Promise((resolve) => browserProbe.close(resolve));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
function chrome(...args) {
  return run('chrome-devtools-axi', args, { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: session, CHROME_DEVTOOLS_AXI_BROWSER_URL: browserUrl });
}
function evaluate(script) {
  const line = chrome('eval', script).split('\n').find((value) => value.startsWith('result:'));
  assert.ok(line);
  const value = JSON.parse(line.slice(7));
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function element(role, name) {
  const line = chrome('snapshot', '--full').split('\n').find((value) => value.includes(` ${role} "${name}"`));
  assert.ok(line, `Missing ${role}: ${name}`);
  return `@${line.match(/uid=(\S+)/)[1]}`;
}
function click(name) { chrome('click', element('button', name)); }
function fill(role, name, value) { chrome('fill', element(role, name), value); }
async function shown(text, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (evaluate(`() => document.body.innerText.includes(${JSON.stringify(text)})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Did not show ${text}: ${evaluate('() => document.querySelector(".photo-step")?.innerText')}`);
}
function api(route, body, method = 'POST') {
  return evaluate(`async () => {const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body === undefined ? '' : `body:${JSON.stringify(JSON.stringify(body))},`}});return {status:r.status,body:await r.json()};}`);
}
async function upload(file) {
  chrome('upload', element('button', 'Garment photo'), path.join(root, 'tests/fixtures', file));
  await shown('Your choices below are the facts');
  assert.equal(evaluate('() => document.querySelector(".garment-form fieldset").disabled'), false);
}
function capture(name) {
  if (!proof) return;
  fs.mkdirSync(proof, { recursive: true });
  evaluate('() => { document.querySelector(".photo-review")?.scrollIntoView({block:"center"}); return true; }');
  chrome('screenshot', path.join(proof, `${name}.png`));
}
let server;
let browserContext;
let errors = '';
const observations = [];
try {
  run('npm', ['run', 'build']);
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'production',
    GYF_CLASSIFIER: 'browser', GYF_PORT: String(port), GYF_DATA_DIR: data, BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), GYF_MAIL_TRANSPORT: 'disabled' }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (chunk) => { errors += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(server.exitCode, null, errors);
    try { if ((await fetch(`${origin}/api/session`)).ok) break; } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browserContext = spawn(process.execPath, [fileURLToPath(import.meta.url), '--browser', path.join(data, 'browser'), String(browserAddress.port)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  await new Promise((resolve, reject) => {
    browserContext.once('message', resolve);
    browserContext.once('exit', (code) => reject(new Error(`Browser exited before initialization: ${code}`)));
  });
  chrome('open', origin);
  assert.equal(evaluate('() => Boolean(navigator.gpu)'), true, 'Keep a run with WebGPU present.');
  const account = api('/api/auth/sign-up/email', { name: 'Recognition test', email: `classify-${randomBytes(8).toString('hex')}@example.test`, password: randomBytes(32).toString('hex'), adultConfirmed: true });
  assert.equal(account.status, 200);
  chrome('open', `${origin}/wardrobe`); await shown('Add garment'); click('Add garment');
  chrome('click', element('checkbox', 'I own this garment and have permission to use its photo. I consent to reviewing and storing it in my private account on the GetYourFit server, without sharing or model training.'));
  await upload('top.jpg'); await shown('Photo label:', 310_000);
  capture('recognition-webgpu-present');
  click('Cancel');
  chrome('open', `${origin}/wardrobe?recognition-test=wasm`); chrome('emulate', '--viewport', '390x844x1,mobile,touch'); await shown('Add garment');
  assert.equal(evaluate('() => navigator.gpu === undefined'), true, 'Init script must remove WebGPU before app code.');
  click('Add garment');
  chrome('click', element('checkbox', 'I own this garment and have permission to use its photo. I consent to reviewing and storing it in my private account on the GetYourFit server, without sharing or model training.'));
  chrome('upload', element('button', 'Garment photo'), path.join(root, 'tests/fixtures/damaged.jpg'));
  await shown('This file could not be opened as an image.');
  for (const [file, expected] of [['top.jpg', 'shirt or T-shirt'], ['bottom.jpg', 'trousers or jeans'], ['footwear.jpg', 'shoes or sandals'], ['one-piece.jpg', 'dress']]) {
    await upload(file);
    await shown('Photo label:', 310_000);
    const note = evaluate('() => document.querySelector(".photo-review").innerText');
    observations.push({ file, expected, correct: note.includes(expected), note });
    assert.equal(note.includes('FashionCLIP (on-device)'), true);
    capture(`recognition-${file}`);
  }
  if (proof) fs.writeFileSync(path.join(proof, 'classification-observations.json'), JSON.stringify(observations, null, 2));
  assert.equal(evaluate('() => document.documentElement.scrollWidth <= innerWidth'), true, 'Model provenance overflowed on mobile.');
  capture('recognition-classified-mobile');
  fill('textbox', 'Name', 'Confirmed dress'); fill('combobox', 'Category', 'one-piece'); fill('textbox', 'Color', 'Print'); fill('textbox', 'Size on label', 'unknown');
  for (const name of ['mild', 'casual', 'I confirm this garment is mine and these are my facts.']) chrome('click', element('checkbox', name));
  click('Save garment'); await shown('Confirmed dress');
  const recognized = api('/api/wardrobe', undefined, 'GET').body[0];
  assert.equal(recognized.interpretation.kind, 'classified');
  assert.equal(recognized.interpretation.source, 'FashionCLIP (on-device)');
  assert.equal(recognized.facts.category, 'one-piece');
  assert.equal(recognized.provenance.category.source, 'wearer-confirmed');
  assert.deepEqual(evaluate('async () => (await (await fetch("/api/data/export")).json()).wardrobe[0].interpretation'), recognized.interpretation);
  assert.equal(evaluate('() => performance.getEntriesByType("resource").some(e => e.name.includes("/api/wardrobe/review"))'), false, 'Review sent the photo to the server.');
  chrome('emulate', '--network', 'Slow 3G');
  await shown('Add garment');
  click('Add garment');
  chrome('click', element('checkbox', 'I own this garment and have permission to use its photo. I consent to reviewing and storing it in my private account on the GetYourFit server, without sharing or model training.'));
  await upload('top.jpg'); await shown('Skip recognition and confirm manually');
  evaluate('() => { [...document.querySelectorAll(".photo-step > button")].find(button => button.textContent === "Skip recognition and confirm manually")?.click(); return true; }');
  assert.equal(evaluate('() => document.querySelector(".garment-form fieldset").disabled'), false);
  assert.equal(evaluate('() => document.documentElement.scrollWidth <= innerWidth'), true);
  capture('recognition-slow-network-manual');
  click('Cancel');
  chrome('emulate', '--network', 'Fast 4G');
  await shown('Add garment');
  click('Add garment');
  chrome('click', element('checkbox', 'I own this garment and have permission to use its photo. I consent to reviewing and storing it in my private account on the GetYourFit server, without sharing or model training.'));
  // Advance only the recognition deadline; inference still uses the actual worker.
  evaluate('() => { window.originalTimeout = window.setTimeout; window.setTimeout = (fn, ms, ...args) => window.originalTimeout(fn, ms === 300000 ? 10 : ms, ...args); return true; }');
  await upload('top.jpg'); await shown('Recognition took too long');
  evaluate('() => {window.setTimeout = window.originalTimeout; return true;}');
  capture('recognition-timeout');
  evaluate('() => {window.originalWorker = window.Worker; window.Worker = class {constructor(){throw new Error("Workers unavailable");}}; return true;}');
  await upload('top.jpg'); await shown('Image classification is unavailable');
  evaluate('() => {window.Worker = window.originalWorker; return true;}');
  fill('textbox', 'Name', 'Manual shirt'); fill('combobox', 'Category', 'top'); fill('textbox', 'Color', 'White'); fill('textbox', 'Size on label', 'unknown');
  for (const name of ['mild', 'casual', 'I confirm this garment is mine and these are my facts.']) chrome('click', element('checkbox', name));
  click('Save garment'); await shown('Manual shirt');
  const stored = api('/api/wardrobe', undefined, 'GET');
  const manual = stored.body.find((item) => item.facts.name === 'Manual shirt');
  assert.ok(manual);
  assert.equal(manual.interpretation.kind, 'unavailable');
  assert.equal(manual.facts.category, 'top');
  assert.equal(manual.provenance.category.source, 'wearer-confirmed');
  assert.equal(evaluate(`async () => {
    const item = (await (await fetch('/api/data/export')).json()).wardrobe[0];
    return (await fetch('/api/wardrobe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({consent:true,image:item.photo.base64,facts:item.facts,
      interpretation:{kind:'classified',source:'Apple Vision',label:'shirt',confidence:1,modelVersion:'fake'}})})).status;
  }`), 400, 'Client forged server provenance.');
  const report = { measuredAt: new Date().toISOString(), head: run('git', ['rev-parse', 'HEAD']).trim(), observations,
    accuracy: { correct: observations.filter((item) => item.correct).length, total: observations.length }, persistedModelAndConfirmedFacts: true, noWebGPU: true, webGPUPresent: true, backend: 'wasm', slowNetworkManual: true, timeoutManual: true, workerFailureManualSave: true, photoStayedOnDeviceUntilSave: true };
  if (proof) {
    fs.writeFileSync(path.join(proof, 'classification-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(proof, 'classification-network.txt'), chrome('network', '--limit', '100'));
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  if (server && server.exitCode === null) { const stopped = new Promise((resolve) => server.once('exit', resolve)); server.kill(); await stopped; }
  try { chrome('stop'); } catch { /* Cleanup must still remove the disposable account. */ }
  if (browserContext && browserContext.exitCode === null) { const stopped = new Promise((resolve) => browserContext.once('exit', resolve)); browserContext.kill(); await stopped; }
  fs.rmSync(data, { recursive: true, force: true });
}
