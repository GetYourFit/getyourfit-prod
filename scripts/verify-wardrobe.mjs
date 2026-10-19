import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createStore } from '../tests/support/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portProbe = net.createServer();
await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
const address = portProbe.address();
assert.ok(address && typeof address === 'object');
const port = address.port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const session = `gyf-wardrobe-${process.pid}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyf-wardrobe-'));
const store = await createStore();
const email = `wearer-${randomBytes(8).toString('hex')}@example.test`;
const password = randomBytes(32).toString('base64url');
const secret = randomBytes(48).toString('base64url');
const proofDir = process.env.GYF_PROOF_DIR;
let server;
let serverError = '';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function chrome(args) {
  return run('chrome-devtools-axi', args, { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: session });
}

function element(role, name, index = 0) {
  const entry = chrome(['snapshot', '--full']).split('\n').filter((line) => line.includes(` ${role} "${name}"`) || line.includes(` ${role} "${name} `))[index];
  assert.ok(entry, `Missing ${role}: ${name}`);
  const uid = entry.match(/uid=(\S+)/)?.[1];
  assert.ok(uid);
  return `@${uid}`;
}

function click(name) { chrome(['click', element('button', name)]); }
function fill(name, value) { chrome(['fill', element('textbox', name), value]); }

function evaluate(expression) {
  const output = chrome(['eval', expression]);
  const entry = output.split('\n').find((line) => line.startsWith('result:'));
  assert.ok(entry, 'Browser returned no evaluation result.');
  const value = entry.slice(7).trim();
  if (value === 'undefined') return undefined;
  const parsed = JSON.parse(value);
  return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}

async function shown(text) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (evaluate(`() => document.body.innerText.includes(${JSON.stringify(text)})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`Browser did not show: ${text}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await stopped;
}

async function startServer() {
  serverError = '';
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', ...store.env, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GYF_PORT: String(port) },
  });
  server.stderr.on('data', (chunk) => { serverError += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(server.exitCode, null, serverError);
    try {
      const response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch (error) { if (!(error instanceof Error)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail('Account service did not start.');
}

function browserApi(route, body, method = 'POST') {
  return evaluate(`async () => { const r = await fetch(${JSON.stringify(route)}, { method: ${JSON.stringify(method)}, ${body === undefined ? '' : `headers: {"Content-Type":"application/json"}, body: ${JSON.stringify(JSON.stringify(body))},`} credentials: "same-origin" }); return { status: r.status, body: await r.json() }; }`);
}
function acceptanceState() {
  return evaluate('async () => ({ signedIn: (await (await fetch("/api/session")).json()).signedIn, imagesLoad: document.querySelectorAll(".outfit-item img").length === 3 && [...document.querySelectorAll(".outfit-item img")].every(img => img.complete && img.naturalWidth > 0), outfitWorks: [...document.querySelectorAll("button")].some(button => button.textContent === "Find an outfit" && !button.disabled) })');
}
function assertAcceptance(state) {
  assert.equal(state.signedIn, true, 'R13: sign-in must work.');
  assert.equal(state.imagesLoad, true, 'R13: real outfit images must load.');
  assert.equal(state.outfitWorks, true, 'R13: designed outfit action must be usable.');
}
function capture(name) {
  if (!proofDir) return;
  fs.mkdirSync(proofDir, { recursive: true, mode: 0o700 });
  chrome(['screenshot', path.join(proofDir, `${name}.png`)]);
  fs.writeFileSync(path.join(proofDir, `${name}.txt`), chrome(['snapshot', '--full']));
}
function select(name, value) { chrome(['fill', element('combobox', name), value]); }
function check(name) { chrome(['click', element('checkbox', name)]); }
function follow(name) { chrome(['click', element('link', name)]); }
const label = (value) => value[0].toUpperCase() + value.slice(1);
async function addGarment(category, name, color, fit, testBadPhoto = false) {
  click('Add garment');
  assert.equal(evaluate('() => document.querySelector("input[type=file]").disabled'), true, 'Photo processed without consent.');
  check('I own this garment and have permission to use its photo. I consent to GetYourFit checking and storing it in my private account on the GetYourFit server, without sharing or model training.');
  if (testBadPhoto) {
    const bad = path.join(root, 'tests/fixtures/damaged.jpg');
    const before = evaluate('() => performance.getEntriesByType("resource").filter(e => e.name.includes("/api/wardrobe/review")).length');
    chrome(['upload', element('button', 'Garment photo'), bad]);
    await shown('This file could not be opened as an image.');
    assert.equal(evaluate('() => document.querySelector(".garment-form fieldset").disabled'), true);
    assert.equal(evaluate('() => performance.getEntriesByType("resource").filter(e => e.name.includes("/api/wardrobe/review")).length'), before, 'Bad image left the browser.');
    capture('wardrobe-invalid-photo');
  }
  chrome(['upload', element('button', 'Garment photo'), path.join(root, 'tests/fixtures', `${category}.jpg`)]);
  await shown('Choose a different photo');
  evaluate('() => { [...document.querySelectorAll(".garment-dialog button")].find(button => button.textContent === "Skip recognition and confirm manually")?.click(); return true; }');
  fill('Name', name); select('Category', label(category)); fill('Color', color); fill('Size on label', 'M'); select('Does it fit you now?', fit === 'unknown' ? 'I’m not sure' : fit === 'fits' ? 'Yes, it fits' : 'No, it does not fit');
  check('Mild'); check('Casual'); check('I confirm this garment is mine and these are my facts.');
  click('Save garment'); await shown('Add garment'); await shown(name);
}

try {
  run('npm', ['run', 'build']);
  await startServer(); chrome(['open', `${origin}/sign-in`]); chrome(['emulate', '--viewport', '1440x1000x1']);
  await shown('Welcome back.'); capture('wardrobe-signin-desktop');
  chrome(['emulate', '--viewport', '390x844x1,mobile,touch']);
  assert.equal(evaluate('() => window.innerWidth'), 390);
  assert.equal(evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'), true);
  await shown('Welcome back.'); capture('wardrobe-signin-mobile'); chrome(['emulate', '--viewport', '1440x1000x1']);
  await shown('Welcome back.');
  click('Create an account'); fill('Your name', 'Wardrobe wearer'); fill('Email', email); fill('Password', password);
  check('I’m 18 or older. GetYourFit doesn’t create accounts for minors.'); click('Create account');
  await shown('Your wardrobe'); capture('wardrobe-before');
  for (const [name, location] of [['Outfit', '/wardrobe#outfit'], ['Plan', '/wardrobe#build-plan'], ['Account', '/account'], ['Wardrobe', '/wardrobe']]) {
    follow(name); assert.equal(evaluate('() => location.pathname + location.hash'), location);
  }
  await shown('Add garment');
  assert.equal(browserApi('/api/wardrobe/review', { consent: false, image: 'AAECAwQ=' }).status, 400);
  assert.equal(browserApi('/api/wardrobe/review', { consent: true, image: 'AAECAwQ=' }).status, 400);
  await addGarment('top', 'White T-shirt', 'White', 'unknown', true);
  let items = browserApi('/api/wardrobe', undefined, 'GET').body;
  assert.equal(items.length, 1);
  assert.equal(items[0].photoConsent.scope, 'local-processing-and-storage');
  assert.equal(items[0].interpretation.kind, 'unavailable', 'Manual confirmation must not invent a model result.');
  click('Find an outfit'); await shown('What is the occasion?');
  fill('Occasion', 'Lunch with a friend'); click('Find an outfit'); await shown('What weather should this outfit work for?');
  select('Weather', 'Mild'); click('Find an outfit'); await shown('What is the dress code?');
  select('Dress code', 'Casual'); click('Find an outfit'); await shown('No complete outfit meets');
  assert.equal(evaluate('() => document.querySelectorAll(".outfit-item").length'), 0);
  await addGarment('bottom', 'Green cargo trousers', 'Green', 'fits');
  click('Find an outfit'); await shown('No complete outfit meets'); capture('wardrobe-missing-footwear');
  await addGarment('footwear', 'Black trainers', 'Black', 'fits');
  click('Find an outfit'); await shown('Does White T-shirt fit you now?');
  assert.equal(evaluate('() => document.querySelectorAll(".outfit-item").length'), 0);
  click('Yes, it fits'); await shown('Your outfit for Lunch with a friend');
  assert.equal(evaluate('() => document.querySelectorAll(".outfit-item").length'), 3);
  items = browserApi('/api/wardrobe', undefined, 'GET').body;
  assert.equal(items[0].facts.fit, 'fits'); assert.equal(items[0].provenance.fit.source, 'wearer-correction');
  assert.equal(items[0].provenance.fit.modelVersion, null); assert.equal(items[0].provenance.fit.confidence, 1);
  evaluate('() => document.querySelector(".outfit-result").scrollIntoView({block:"start"})');
  await shown('nothing to buy'); capture('wardrobe-outfit-desktop');
  assert.equal(evaluate('() => [...document.querySelectorAll(".outfit-item img")].every(img => img.complete && img.naturalWidth > 0)'), true);
  const validState = acceptanceState();
  assertAcceptance(validState);
  const originalPhoto = evaluate('() => document.querySelector(".outfit-item img").getAttribute("src")');
  evaluate('async () => { const img = document.querySelector(".outfit-item img"); img.src = "/api/wardrobe/00000000-0000-4000-8000-000000000000/photo"; await img.decode().catch(() => {}); }');
  const brokenImageState = acceptanceState();
  assert.throws(() => assertAcceptance(brokenImageState), /R13: real outfit images/);
  evaluate(`async () => { const img = document.querySelector(".outfit-item img"); img.src = ${JSON.stringify(originalPhoto)}; await img.decode(); }`);
  evaluate('() => { [...document.querySelectorAll("button")].find(button => button.textContent === "Find an outfit").disabled = true; }');
  const disabledActionState = acceptanceState();
  assert.throws(() => assertAcceptance(disabledActionState), /R13: designed outfit action/);
  evaluate('() => { [...document.querySelectorAll("button")].find(button => button.textContent === "Find an outfit").disabled = false; }');
  assertAcceptance(acceptanceState());
  chrome(['emulate', '--viewport', '390x844x1,mobile,touch']);
  await shown('White T-shirt'); fill('Occasion', 'Lunch with a friend'); select('Weather', 'Mild'); select('Dress code', 'Casual'); click('Find an outfit'); await shown('Your outfit for');
  evaluate('() => document.querySelector(".outfit-result").scrollIntoView({block:"start"})');
  assert.equal(evaluate('() => window.innerWidth'), 390);
  assert.equal(evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'), true);
  capture('wardrobe-outfit-mobile');
  chrome(['emulate', '--viewport', '1440x1000x1']);
  await shown('White T-shirt'); fill('Occasion', 'Lunch with a friend'); select('Weather', 'Mild'); select('Dress code', 'Casual'); click('Find an outfit'); await shown('Your outfit for');
  chrome(['click', element('button', 'Don’t use White T-shirt for this occasion')]); await shown('Your correction wins.');
  assert.equal(evaluate('() => document.querySelectorAll(".outfit-item").length'), 0);
  chrome(['open', `${origin}/wardrobe`]); await shown('White T-shirt'); fill('Occasion', '  LUNCH WITH A FRIEND  '); select('Weather', 'Mild'); select('Dress code', 'Casual');
  click('Find an outfit'); await shown('1 item stays excluded'); capture('wardrobe-correction');
  const corrected = browserApi('/api/wardrobe/outfit', { occasion: '  LUNCH WITH A FRIEND  ', weather: 'mild', dressCode: 'casual' }).body;
  assert.equal(corrected.kind, 'incomplete'); assert.equal(corrected.excludedCount, 1);
  click('Allow excluded items again'); await shown('Your outfit for');
  chrome(['click', element('button', 'Edit Black trainers')]); await shown('Save changes');
  check('Available to wear now'); click('Save changes'); await shown('Add garment'); click('Find an outfit'); await shown('No complete outfit meets');
  assert.equal(evaluate('() => document.querySelectorAll(".outfit-item").length'), 0);
  chrome(['click', element('button', 'Edit Black trainers')]); await shown('Save changes'); check('Available to wear now'); click('Save changes'); await shown('Add garment');
  click('Find an outfit'); await shown('Your outfit for');
  chrome(['click', element('button', 'Don’t use White T-shirt for this occasion')]); await shown('Your correction wins.');
  const exported = evaluate(`async () => {
    const response = await fetch('/api/data/export'); const data = await response.json();
    const photos = await Promise.all(data.wardrobe.map(async (garment) => {
      const bytes = Uint8Array.from(atob(garment.photo.base64), char => char.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { id: garment.id, mediaType: garment.photo.mediaType, bytes: bytes.length,
        sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
        consent: garment.photoConsent.scope, sources: Object.values(garment.provenance).every(fact => fact.modelVersion === null && fact.confidence === 1),
        classification: garment.interpretation.kind };
    }));
    return { status: response.status, format: data.format, email: data.account.email, emailVerified: data.account.emailVerified,
      hasPassword: 'password' in data.account, photos, corrections: data.outfitCorrections.map(({ garmentId, source }) => ({ garmentId, source })) };
  }`);
  assert.equal(exported.status, 200); assert.equal(exported.format, 'getyourfit-account-export-v1');
  assert.equal(exported.email, email); assert.equal(exported.emailVerified, false); assert.equal(exported.hasPassword, false);
  assert.equal(exported.photos.length, 3); assert.equal(exported.corrections.length, 1);
  assert.equal(exported.corrections[0].source, 'wearer-correction');
  for (const photo of exported.photos) {
    const bytes = (await store.query('SELECT photo FROM garments WHERE id = $1', [photo.id]))[0].photo;
    assert.equal(photo.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(photo.bytes, bytes.length); assert.equal(photo.mediaType, 'image/jpeg');
    assert.equal(photo.consent, 'local-processing-and-storage'); assert.equal(photo.sources, true);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.ok(Math.max(metadata.width, metadata.height) <= 1200);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  }
  fs.writeFileSync(path.join(dataDir, 'export.json'), JSON.stringify(exported));
  chrome(['click', element('button', 'Remove Black trainers')]); click('Keep');
  assert.equal(browserApi('/api/wardrobe', undefined, 'GET').body.length, 3);
  chrome(['click', element('button', 'Remove Black trainers')]); click('Yes, remove'); await shown('2 garments');
  assert.equal(browserApi('/api/wardrobe', undefined, 'GET').body.length, 2);
  assert.equal(evaluate(`async () => (await fetch(${JSON.stringify(items[2].photoUrl)})).status`), 404);
  const other = await fetch(`${origin}/api/auth/sign-up/email`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other wearer', email: `other-${randomBytes(8).toString('hex')}@example.test`, password: randomBytes(32).toString('base64url'), adultConfirmed: true }) });
  assert.equal(other.status, 200);
  const cookies = other.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const otherHeaders = { Origin: origin, Cookie: cookies, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${origin}${items[0].photoUrl}`, { headers: otherHeaders })).status, 404);
  assert.equal((await fetch(`${origin}/api/wardrobe/${items[0].id}`, { method: 'PATCH', headers: otherHeaders, body: JSON.stringify(items[0].facts) })).status, 404);
  assert.equal((await fetch(`${origin}/api/wardrobe/${items[0].id}`, { method: 'DELETE', headers: otherHeaders })).status, 404);
  assert.equal((await fetch(`${origin}/api/wardrobe/correction`, { method: 'POST', headers: otherHeaders, body: JSON.stringify({ context: { occasion: 'Lunch with a friend', weather: 'mild', dressCode: 'casual' }, garmentId: items[0].id, excluded: true }) })).status, 404);
  assert.equal((await (await fetch(`${origin}/api/wardrobe`, { headers: otherHeaders })).json()).length, 0);
  const untrusted = await fetch(`${origin}/api/wardrobe/review`, { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(untrusted.status, 403);
  follow('Account'); await shown('Signed in as'); click('Sign out'); await shown('Example outfit');
  const signedOutState = acceptanceState();
  assert.throws(() => assertAcceptance(signedOutState), /R13: sign-in/);
  chrome(['open', `${origin}/sign-in`]); await shown('Welcome back.'); fill('Email', email); fill('Password', password); click('Sign in'); await shown('White T-shirt');
  await stopServer(); await startServer(); chrome(['open', `${origin}/wardrobe`]); await shown('White T-shirt');
  assert.equal(evaluate('() => document.querySelectorAll(".garment-card img").length'), 2);
  assert.equal(evaluate('() => [...document.querySelectorAll(".garment-card img")].every(img => img.complete && img.naturalWidth > 0)'), true);
  follow('Account'); await shown('Signed in as'); click('Download export'); click('Delete my data'); click('Erase permanently'); await shown('Example outfit');
  assert.equal(Number((await store.query('SELECT count(*) AS n FROM garments WHERE user_id IN (SELECT id FROM "user" WHERE email = $1)', [email]))[0].n), 0);
  assert.equal(Number((await store.query('SELECT count(*) AS n FROM outfit_exclusions WHERE user_id IN (SELECT id FROM "user" WHERE email = $1)', [email]))[0].n), 0);
  assert.equal(evaluate(`async () => (await fetch(${JSON.stringify(items[0].photoUrl)})).status`), 401);
  assert.equal((await fetch(`${origin}${items[0].photoUrl}`, { headers: otherHeaders })).status, 404);
  await fetch(`${origin}/api/data`, { method: 'DELETE', headers: otherHeaders, body: JSON.stringify({ confirm: 'delete my account' }) });
  if (proofDir) {
    fs.writeFileSync(path.join(proofDir, 'wardrobe-network.txt'), chrome(['network', '--limit', '500']));
    fs.writeFileSync(path.join(proofDir, 'wardrobe-report.json'), JSON.stringify({
      head: run('git', ['rev-parse', 'HEAD']).trim(), origin, passedAt: new Date().toISOString(),
      validState, r13: { brokenImageState, disabledActionState, signedOutState }, exportProof: exported,
    }, null, 2));
  }
  process.stdout.write('verify:wardrobe passed: production signup, consent, invalid decode, manual photo review, persisted photos and facts, one question, complete outfit, missing footwear, availability, wearer rejection, export, restart, ownership isolation, origin guard and deletion.\n');
} finally {
  await stopServer();
  try { chrome(['stop']); } catch (error) { process.stderr.write(`Browser cleanup failed: ${String(error)}\n`); }
  await store.drop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
