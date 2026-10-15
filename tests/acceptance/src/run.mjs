import { chromium } from 'playwright';
import axe from 'axe-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { account, caseNames, contract } from './contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(here, '..');
const projectRoot = path.resolve(suiteRoot, '../..');
const stubMode = process.argv.includes('--stub');
const privacyMutationMode = process.argv.includes('--privacy-mutations');
const appPort = await freePort();
let mailPort;
const baseURL = `http://127.0.0.1:${appPort}`;
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex < 0 ? undefined : process.argv[onlyIndex + 1];
const output = process.env.ACCEPTANCE_OUTPUT || await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-report-'));
const samples = [
  { filename: 'garment-photo.jpg', name: 'Acceptance beige shirt', category: 'top', color: 'beige', size: 'M', fit: 'fits', available: true, weather: ['mild'], dressCode: ['smart-casual'] },
  { filename: 'bottom.jpg', name: 'Acceptance cargo pants', category: 'bottom', color: 'olive', size: 'M', fit: 'fits', available: true, weather: ['mild'], dressCode: ['smart-casual'] },
  { filename: 'footwear.jpg', name: 'Acceptance black trainers', category: 'footwear', color: 'black', size: '9', fit: 'fits', available: true, weather: ['mild'], dressCode: ['smart-casual'] },
  { filename: 'bottom.jpg', name: 'Unavailable acceptance pants', category: 'bottom', color: 'olive', size: 'M', fit: 'fits', available: false, weather: ['mild'], dressCode: ['smart-casual'] },
  { filename: 'bottom.jpg', name: 'Non-fitting acceptance pants', category: 'bottom', color: 'olive', size: 'M', fit: 'does-not-fit', available: true, weather: ['mild'], dressCode: ['smart-casual'] },
  { filename: 'bottom.jpg', name: 'Cold-only acceptance pants', category: 'bottom', color: 'olive', size: 'M', fit: 'fits', available: true, weather: ['cold'], dressCode: ['smart-casual'] },
  { filename: 'bottom.jpg', name: 'Formal-only acceptance pants', category: 'bottom', color: 'olive', size: 'M', fit: 'fits', available: true, weather: ['mild'], dressCode: ['formal'] },
];
const garments = await Promise.all(samples.map(async sample => ({ ...sample, photo: await readFile(path.join(suiteRoot, 'fixtures', sample.filename)) })));
const shirt = garments[0];
const facts = { occasion: 'dinner', weather: 'mild', dressCode: 'smart-casual' };
const secrets = new Set();
const privacyMutationProof = [];
const cases = [
  [caseNames.contrast, ['A-1'], contrastJourney],
  [caseNames.browser, ['R4', 'R5', 'R7', 'R26', 'A-1'], browserJourney],
  [caseNames.frontDoor, ['R4', 'R19', 'R26', 'A-1'], frontDoorJourney],
  [caseNames.signup, ['R4', 'R26', 'R27', 'A-1'], signupJourney],
  [caseNames.authentication, ['R26', 'R27'], authenticationFailures],
  [caseNames.photo, ['R7', 'R26', 'R27'], photoJourney],
  [caseNames.outfit, ['R4', 'R5', 'R9', 'R10', 'R11', 'R19', 'A-1'], outfitJourney],
  [caseNames.singleShirt, ['R5', 'R9', 'R11', 'R19', 'A-1'], singleShirtJourney],
  [caseNames.missingFacts, ['R5', 'R11', 'R19', 'A-1'], missingFactsJourney],
  [caseNames.isolation, ['R26', 'R27'], isolation],
];
const started = Date.now();
const results = [];
const smtpSockets = new Set();
let server, browser, dataDir, mailCatcher;
let mailCount = 0;
let logs = '';
let logOverflow = false;
let activePage;
let runtime = 'production-start';
let head;
let worktreeClean;

function credentials() {
  const user = account();
  secrets.add(user.email); secrets.add(user.password);
  return user;
}
function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.replaceAll(secret, '[redacted]');
  return text;
}
function safeEnv() {
  return Object.fromEntries(['PATH', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
}

await mkdir(path.join(output, 'screenshots'), { recursive: true });
try {
  assert(!privacyMutationMode || !stubMode, 'Privacy mutation verification requires the production service');
  assert(!privacyMutationMode || only === undefined, 'Privacy mutation verification selects its production cases');
  assert(stubMode || only === undefined, 'Selective cases are restricted to stub verification');
  assert(only === undefined || cases.some(([name]) => name === only), 'Unknown selected case');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(revision.status, 0, 'Cannot establish the checked Git revision');
  head = revision.stdout.trim();
  const worktree = spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(worktree.status, 0, 'Cannot establish worktree state');
  worktreeClean = worktree.stdout.trim() === '';
  const manifest = stubMode ? null : JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  if (!stubMode && !manifest.scripts?.start) {
    runtime = 'production-start-missing';
    results.push({ name: 'V01 production API service', requirement_ids: ['R4', 'A-1'], status: 'failed', error: 'package.json has no npm start production service contract.' });
  } else {
    mailPort = await freePort();
    mailCatcher = tcpServer(socket => {
      smtpSockets.add(socket); socket.on('close', () => smtpSockets.delete(socket));
      socket.on('error', () => {});
      socket.write('220 localhost acceptance mail sink\r\n');
      let pending = '', inData = false;
      socket.on('data', chunk => {
        pending += chunk.toString();
        let end;
        while ((end = pending.indexOf('\r\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 2);
          if (inData) { if (line === '.') { inData = false; mailCount++; socket.write('250 accepted locally\r\n'); } continue; }
          if (/^DATA$/i.test(line)) { inData = true; socket.write('354 End with dot\r\n'); }
          else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n');
          else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 localhost\r\n');
          else socket.write('250 ok\r\n');
        }
        if (pending.length > 1024 * 1024) socket.destroy();
      });
    });
    await new Promise((resolve, reject) => { mailCatcher.once('error', reject); mailCatcher.listen(mailPort, '127.0.0.1', resolve); });
    dataDir = await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-data-'));
    const authSecret = randomBytes(32).toString('hex');
    secrets.add(authSecret);
    const env = { ...safeEnv(), NODE_ENV: 'production', BETTER_AUTH_SECRET: authSecret, BETTER_AUTH_URL: baseURL, GYF_MAIL_TRANSPORT: 'disabled', HOST: '127.0.0.1', PORT: String(appPort), GYF_PORT: String(appPort), GYF_DATA_DIR: dataDir, DATABASE_URL: `file:${path.join(dataDir, 'acceptance.sqlite')}`, APP_URL: baseURL, GYF_MAIL_MODE: 'disabled', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mailPort), SMTP_URL: `smtp://127.0.0.1:${mailPort}` };
    if (stubMode) {
      server = spawn(process.execPath, [path.join(here, 'stub-server.mjs')], { env: { ...env, MUTATION: process.env.MUTATION || '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      runtime = 'contract-stub';
    } else {
      const build = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, env: { ...safeEnv(), NODE_ENV: 'production' }, encoding: 'utf8', timeout: 120000 });
      assert.equal(build.status, 0, `Production build failed: ${redact(build.stderr || build.stdout)}`);
      server = spawn('npm', ['start'], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    }
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk.toString(); if (logs.length > 4 * 1024 * 1024) { logOverflow = true; logs = logs.slice(-4 * 1024 * 1024); } });
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    for (const [name, ids, check] of cases) {
      if (only && name !== only) continue;
      if (privacyMutationMode && ![caseNames.browser, caseNames.frontDoor].includes(name)) continue;
      const item = { name, requirement_ids: ids, status: 'passed' };
      const caseStart = Date.now();
      const context = await browser.newContext({ baseURL, ...([caseNames.browser, caseNames.frontDoor].includes(name) ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
      context.setDefaultTimeout(6000);
      activePage = await context.newPage();
      try {
        await check(context, activePage);
        await delay(50);
        assert.equal(mailCount, 0, 'v0.1 emitted mail to the local catcher; account use must not depend on mail');
        assert(!logOverflow, 'Service log capture overflowed; private-data absence cannot be established');
        for (const secret of secrets) assert(!logs.includes(secret), 'Service logs exposed generated credentials or personal email');
      } catch (error) {
        item.status = 'failed'; item.error = redact(error.stack || error);
        item.screenshot = `screenshots/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        if (activePage.url() === 'about:blank') await activePage.goto(baseURL).catch(() => {});
        await activePage.screenshot({ path: path.join(output, item.screenshot), fullPage: true, mask: [activePage.locator('input[type=email], input[type=password]'), ...[...secrets].map(secret => activePage.getByText(secret, { exact: false }))] }).catch(() => { delete item.screenshot; });
      } finally { await context.close(); activePage = undefined; }
      item.duration_ms = Date.now() - caseStart;
      results.push(item);
    }
  }
} catch (error) {
  results.push({ name: 'runner setup', requirement_ids: ['A-1'], status: 'failed', error: redact(error.stack || error) });
} finally {
  await browser?.close();
  await stopOwnedServer();
  for (const socket of smtpSockets) socket.destroy();
  if (mailCatcher?.listening) await new Promise(resolve => mailCatcher.close(resolve));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

const source = stubMode ? 'contract-stub' : runtime === 'production-start-missing' ? 'missing-production-service' : 'production-build';
if (privacyMutationMode && results.every(result => result.status === 'passed')) {
  const expected = ['wardrobe/account', 'garment consent', 'saved garment/outfit'].sort();
  const detected = privacyMutationProof.map(proof => proof.surface).sort();
  if (JSON.stringify(detected) !== JSON.stringify(expected)) {
    results.push({ name: 'privacy mutation coverage', requirement_ids: ['A-1'], status: 'failed', error: `Expected production privacy mutation proofs for ${expected.join(', ')}; detected ${detected.join(', ')}` });
  }
}
const report = { schema: 'gyf-acceptance-report/v2', release: 'v0.1', head_sha: head, worktree_clean: worktreeClean, source, runtime, base_url: baseURL, started_at: new Date(started).toISOString(), duration_ms: Date.now() - started, summary: { total: results.length, passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, skipped: 0 }, cases: results, privacy_mutation_proof: privacyMutationProof };
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.summary, report: path.join(output, 'report.json') }));
process.exitCode = report.summary.failed ? 1 : 0;

async function freePort() {
  const probe = tcpServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function requiredControl(locator, message) {
  try { await locator.waitFor(); } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error(message);
    throw error;
  }
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    assert(server.exitCode === null && server.signalCode === null, `Owned service exited: ${redact(logs)}`);
    try { if (stubMode && !logs.includes(`stub listening ${appPort}`)) throw new Error('not bound'); const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) }); if (response.status < 500) { await delay(200); assert(server.exitCode === null && server.signalCode === null, `Owned service exited: ${redact(logs)}`); return; } } catch {
      // The service may not be ready until a later probe.
    }
    await delay(100);
  }
  throw new Error(`Owned service did not become ready: ${redact(logs)}`);
}
async function stopOwnedServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once('close', resolve));
  try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (await Promise.race([exited.then(() => true), delay(1000).then(() => false)])) return;
  try { process.kill(-server.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await exited;
}
async function api(context, method, endpoint, data) {
  const cookie = (await context.cookies()).map(entry => `${entry.name}=${entry.value}`).join('; ');
  const deadline = Date.now() + 150000;
  for (;;) {
    const response = await context.request.fetch(endpoint, { method, data, headers: cookie ? { origin: baseURL, cookie } : { origin: baseURL }, timeout: 10000 });
    if (response.status() !== 429 || Date.now() > deadline) return response;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
async function jsonOK(response, label) {
  assert(response.ok(), `${label} returned HTTP ${response.status()}`);
  assert.match(response.headers()['content-type'] || '', /application\/json/, `${label} did not return JSON`);
  return response.json();
}
async function signup(context, user = credentials()) {
  const response = await api(context, 'POST', contract.register, { ...user, callbackURL: baseURL });
  await jsonOK(response, 'Signup');
  return user;
}
async function session(context, email) {
  const body = await jsonOK(await api(context, 'GET', contract.session), 'Session');
  assert.equal(body.signedIn, true, 'Session belongs to a different user or is missing');
  assert.equal(body.email, email, 'Session belongs to a different user or is missing');
}
async function upload(context, sample = shirt, consent = true, bytes = sample.photo) {
  return api(context, 'POST', contract.wardrobe, {
    facts: { name: sample.name, category: sample.category, color: sample.color, size: sample.size, fit: sample.fit, owned: true, available: sample.available, weather: sample.weather, dressCode: sample.dressCode },
    consent,
    image: bytes.toString('base64'),
  });
}
async function garment(context, sample = shirt) {
  const item = await jsonOK(await upload(context, sample), 'Garment upload');
  assert(item.id && item.photoUrl, 'Saved garment has no stable ID or retrievable photo URL');
  assertGarmentFacts(item, sample, 'Saved garment');
  return item;
}
function assertGarmentFacts(item, sample, label) {
  assert(item.photoConsent, `${label} lost photo consent`);
  assert.equal(item.facts.owned, true, `${label} lost ownership confirmation`);
  for (const key of ['name', 'category', 'color', 'size', 'fit', 'available']) assert.equal(item.facts[key], sample[key], `${label} lost confirmed ${key}`);
  assert.deepEqual(item.facts.weather, sample.weather, `${label} lost confirmed weather`);
  assert.deepEqual(item.facts.dressCode, sample.dressCode, `${label} lost confirmed dress code`);
}
function localPhotoURL(item) {
  const url = new URL(item.photoUrl, baseURL);
  assert.equal(url.origin, baseURL, 'Photo URL sends private media outside the local service');
  assert.equal(url.pathname, `${contract.wardrobe}/${encodeURIComponent(item.id)}/photo`, 'Photo URL does not use the public garment photo route');
  return url.href;
}
function completeOutfit(body, wardrobe, shirtId, requestFacts) {
  assert.equal(body.kind, 'complete', 'Expected one complete outfit');
  assert(typeof body.explanation === 'string' && body.explanation.trim().length > 10, 'Outfit lacks a meaningful explanation');
  assert(Array.isArray(body.items), 'Outfit has no garment set');
  const categories = new Set(body.items.map(item => item.facts?.category));
  assert(['top', 'bottom', 'footwear'].every(category => categories.has(category)), 'Suggestion omits top, bottom or footwear');
  assert(body.items.some(item => item.id === shirtId), 'Suggestion ignored the uploaded shirt');
  for (const item of body.items) {
    const garment = wardrobe.get(item.id);
    assert(garment, "Outfit includes a garment outside the wearer's wardrobe");
    assert.deepEqual(item.facts, garment.facts, 'Outfit changed saved garment facts');
    assert.equal(item.facts.owned, true, 'Outfit includes a garment the wearer does not own');
    assert.equal(item.facts.available, true, 'Outfit includes an unavailable garment');
    assert.equal(item.facts.fit, 'fits', 'Outfit includes a garment without confirmed fit');
    assert(item.facts.weather.includes(requestFacts.weather), 'Outfit includes a garment that does not match known weather');
    assert(item.facts.dressCode.includes(requestFacts.dressCode), 'Outfit includes a garment that does not match known dress code');
  }
}
function requireQuestionOrAbstention(body, label, expectedField) {
  assert.notEqual(body.kind, 'complete', `${label} returned an outfit`);
  assert(!Array.isArray(body.items) || body.items.length === 0, `${label} returned an outfit`);
  if (body.kind === 'context-question') {
    if (expectedField) assert.equal(body.field, expectedField, `${label} asked about the wrong fact`);
    assert(typeof body.question === 'string' && Boolean(body.question.trim()), `${label} did not ask one clear question or abstain`);
    return body.question;
  }
  assert.equal(body.kind, 'incomplete', `${label} did not ask one clear question or abstain`);
  assert(typeof body.explanation === 'string' && Boolean(body.explanation.trim()), `${label} did not explain its abstention`);
  return body.explanation;
}
async function signupJourney(context) {
  await assertAgeConfirmationRefused(context, false, 'Unchecked age confirmation');
  await assertAgeConfirmationRefused(context, undefined, 'Missing age confirmation');
  const user = credentials();
  const response = await api(context, 'POST', contract.register, { ...user, callbackURL: baseURL });
  await jsonOK(response, 'Signup');
  const cookie = response.headers()['set-cookie'] || '';
  assert.match(cookie, /HttpOnly/i, 'Session cookie must be HttpOnly');
  assert.match(cookie, /SameSite=(Lax|Strict)/i, 'Session cookie must restrict cross-site use');
  await session(context, user.email);
  const refreshed = await browser.newContext({ baseURL, storageState: await context.storageState() });
  try { await session(refreshed, user.email); } finally { await refreshed.close(); }
  const takeover = credentials();
  await api(context, 'POST', contract.register, { ...takeover, email: user.email, callbackURL: baseURL });
  const login = await api(context, 'POST', contract.login, { email: user.email, password: user.password, rememberMe: false });
  await jsonOK(login, 'Login after duplicate signup');
  await session(context, user.email);
}
async function assertAgeConfirmationRefused(context, adultConfirmed, label) {
  const user = credentials();
  const body = { name: user.name, email: user.email, password: user.password, callbackURL: baseURL };
  if (adultConfirmed !== undefined) body.adultConfirmed = adultConfirmed;
  const response = await api(context, 'POST', contract.register, body);
  assert(response.status() >= 400 && response.status() < 500, `${label} signup accepted without 18+ confirmation`);
  assert(!response.headers()['set-cookie'], `${label} signup refusal set a session cookie`);
  const current = await api(context, 'GET', contract.session);
  if (current.ok()) assert.equal((await jsonOK(current, `${label} session`)).signedIn, false, `${label} refusal created a session`);
  else assert([401, 403].includes(current.status()), `${label} refusal created a session`);
  const stranger = await browser.newContext({ baseURL });
  try {
    const login = await api(stranger, 'POST', contract.login, { email: user.email, password: user.password, rememberMe: false });
    assert([401, 403].includes(login.status()), `${label} refusal created a usable account`);
    const anonymous = await api(stranger, 'GET', contract.session);
    if (anonymous.ok()) assert.equal((await jsonOK(anonymous, `${label} anonymous session`)).signedIn, false, `${label} refusal created a usable session`);
    else assert([401, 403].includes(anonymous.status()), `${label} refusal created a usable session`);
  } finally { await stranger.close(); }
}
async function authenticationFailures(context) {
  const user = await signup(context);
  const stranger = await browser.newContext({ baseURL });
  try {
    const wrong = await api(stranger, 'POST', contract.login, { email: user.email, password: credentials().password, rememberMe: false });
    const unknownUser = credentials();
    const unknown = await api(stranger, 'POST', contract.login, { email: unknownUser.email, password: unknownUser.password, rememberMe: false });
    assert([401, 403].includes(wrong.status()), 'Wrong password accepted');
    assert.equal(unknown.status(), wrong.status(), 'Unknown account has a different refusal status');
    assert.deepEqual(await unknown.json(), await wrong.json(), 'Unknown account has a different refusal body');
    const anonymous = await api(stranger, 'GET', contract.session);
    if (anonymous.ok()) assert.equal((await jsonOK(anonymous, 'Anonymous session')).signedIn, false, 'Invalid credentials created a session');
    else assert([401, 403].includes(anonymous.status()), 'Invalid credentials created a session');
  } finally { await stranger.close(); }
}
async function photoJourney(context, page) {
  await signup(context);
  const item = await garment(context);
  const list = await jsonOK(await api(context, 'GET', contract.wardrobe), 'Wardrobe');
  assert(Array.isArray(list), 'Wardrobe response is not a collection');
  const saved = list.find(value => value.id === item.id);
  assert(saved, 'Upload did not persist');
  assert.deepEqual(saved.facts, item.facts, 'Persisted garment facts changed');
  const response = await api(context, 'GET', localPhotoURL(saved));
  assert(response.ok(), 'Stored real photo cannot be read');
  assert.match(response.headers()['content-type'] || '', /^image\//, 'Stored photo is not an image');
  const bytes = await response.body();
  await page.goto(baseURL);
  const match = await page.evaluate(async ([stored, original]) => {
    const images = await Promise.all([stored, original].map(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      return globalThis.createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    }));
    const pixels = images.map(image => {
      const canvas = globalThis.document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 32);
      return ctx.getImageData(0, 0, 32, 32).data;
    });
    const difference = pixels[0].reduce((sum, value, i) => sum + Math.abs(value - pixels[1][i]), 0) / (pixels[0].length * 255);
    return { width: images[0].width, height: images[0].height, difference };
  }, [bytes.toString('base64'), shirt.photo.toString('base64')]);
  assert(match.width >= 100 && match.height >= 100 && match.difference < 0.08, 'Stored photo is a placeholder, damaged or different from the real upload');
  for (const rejected of [await upload(context, shirt, false), await upload(context, shirt, true, Buffer.from('damaged photo'))]) {
    assert(rejected.status() >= 400 && rejected.status() < 500, 'Invalid or non-consented upload accepted');
  }
  const afterRejected = await jsonOK(await api(context, 'GET', contract.wardrobe), 'Wardrobe after rejected uploads');
  assert.deepEqual(afterRejected.map(value => value.id), [item.id], 'Rejected uploads changed the wardrobe');
}
async function outfitJourney(context) {
  await signup(context);
  const items = [];
  for (const sample of garments) items.push(await garment(context, sample));
  const body = await jsonOK(await api(context, 'POST', contract.outfits, facts), 'Outfit request');
  completeOutfit(body, new Map(items.map(item => [item.id, item])), items[0].id, facts);
}
async function singleShirtJourney(context) {
  await signup(context);
  await garment(context, shirt);
  const body = await jsonOK(await api(context, 'POST', contract.outfits, facts), 'Single-shirt outfit request');
  requireQuestionOrAbstention(body, 'Single-shirt wardrobe');
}
async function missingFactsJourney(context) {
  await signup(context);
  for (const sample of garments) await garment(context, sample);
  const unknownWeather = await jsonOK(await api(context, 'POST', contract.outfits, { ...facts, weather: 'unknown' }), 'Unknown-weather outfit request');
  requireQuestionOrAbstention(unknownWeather, 'Unknown weather', 'weather');
  const unknownDressCode = await jsonOK(await api(context, 'POST', contract.outfits, { ...facts, dressCode: 'unknown' }), 'Unknown-dress-code outfit request');
  requireQuestionOrAbstention(unknownDressCode, 'Unknown dress code', 'dressCode');
}
async function isolation(context) {
  await signup(context);
  const item = await garment(context);
  const other = await browser.newContext({ baseURL });
  const anonymous = await browser.newContext({ baseURL });
  try {
    await signup(other);
    for (const intruder of [other, anonymous]) {
      const endpoint = `${contract.wardrobe}/${encodeURIComponent(item.id)}`;
      for (const response of [await api(intruder, 'PATCH', endpoint, { ...item.facts, color: 'stolen' }), await api(intruder, 'DELETE', endpoint), await api(intruder, 'GET', localPhotoURL(item))]) {
        assert([401, 403, 404].includes(response.status()), 'Private garment or photo was accessible to another session');
      }
    }
    const saved = await jsonOK(await api(context, 'GET', contract.wardrobe), 'Owner wardrobe after attack');
    assert(Array.isArray(saved), 'Owner wardrobe response is not a collection');
    assert.deepEqual(saved.find(value => value.id === item.id), item, 'Another session changed or deleted the garment');
    const own = await jsonOK(await api(other, 'GET', contract.wardrobe), 'Other user wardrobe');
    assert(Array.isArray(own), 'Other user wardrobe response is not a collection');
    assert.equal(own.length, 0, 'Other user list leaked private garment');
    const anonymousList = await api(anonymous, 'GET', contract.wardrobe);
    if (anonymousList.ok()) {
      const anonymousItems = await jsonOK(anonymousList, 'Anonymous wardrobe');
      assert(Array.isArray(anonymousItems), 'Anonymous wardrobe response is not a collection');
      assert.equal(anonymousItems.length, 0, 'Anonymous wardrobe leaked private garment');
    } else assert([401, 403, 404].includes(anonymousList.status()), 'Anonymous wardrobe exposed private garments');
  } finally { await other.close(); await anonymous.close(); }
}
async function selectByText(select, pattern) {
  await select.waitFor();
  const labels = await select.evaluate(element => [...element.options].map(option => option.label));
  const label = labels.find(text => pattern.test(text));
  assert(label !== undefined, `Option matching ${pattern} is missing from the select`);
  await select.selectOption({ label });
}
async function contrastJourney(context, page) {
  const scans = [];
  async function scan(surface) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(axe.source);
      const result = await page.evaluate(async () => {
        const { violations, incomplete, passes } = await globalThis.axe.run(globalThis.document, { runOnly: ['color-contrast'] });
        const findings = items => items.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, any }) => ({ target, checks: any.map(({ message, data }) => ({ message, data })) })) }));
        return { violations: findings(violations), incomplete: findings(incomplete), checked_nodes: passes.reduce((sum, rule) => sum + rule.nodes.length, 0) };
      });
      scans.push({ surface, width, ...result });
      await writeFile(path.join(output, 'contrast.json'), `${JSON.stringify(scans, null, 2)}\n`);
      await page.screenshot({ path: path.join(output, 'screenshots', `contrast-${surface}-${width}.png`), fullPage: true, mask: [page.locator('input[type=email], input[type=password]'), ...[...secrets].map(secret => page.getByText(secret, { exact: false }))] });
      assert.equal(result.violations.length, 0, `WCAG AA color-contrast failed on ${surface} at ${width}px: ${JSON.stringify(result.violations)}`);
      assert.equal(result.incomplete.length, 0, `WCAG AA color-contrast needs review on ${surface} at ${width}px: ${JSON.stringify(result.incomplete)}`);
      assert(result.checked_nodes > 0, `WCAG AA color-contrast checked no text on ${surface} at ${width}px`);
    }
  }
  await page.goto(baseURL);
  await page.getByRole('main').waitFor();
  await scan('public');
  await page.getByRole('link', { name: /^sign in/i }).click();
  await page.getByLabel(/^email/i).waitFor();
  await scan('sign-in');
  await page.getByRole('link', { name: /create.*account/i }).or(page.getByRole('button', { name: /create.*account/i })).first().click();
  await page.getByLabel(/^(your |display )?name$/i).waitFor();
  await scan('signup');
  await signup(context);
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: /^add garment$/i }).waitFor();
  await scan('wardrobe-account');
}
async function frontDoorJourney(context, page) {
  const apiRequests = [];
  await context.route('**/api/**', async route => { apiRequests.push(route.request().url()); await route.abort(); });
  await page.goto(baseURL);
  await requiredControl(page.getByRole('heading', { name: /^example outfit$/i }), 'The public first screen has no labeled example outfit');
  assert.equal(await page.locator('input[type=email], input[type=password]').count(), 0, 'The public first screen is an account wall');
  await requiredControl(page.getByRole('heading', { name: /^why this works$/i }), 'The public example has no explanation');
  const example = page.getByRole('region', { name: /^example outfit$/i });
  const images = example.getByRole('img');
  assert.equal(await images.count(), 3, 'The public example does not show a complete garment set');
  for (const image of await images.all()) {
    await image.evaluate(async element => { await element.decode().catch(() => {}); });
    assert.equal(new URL(await image.evaluate(element => element.currentSrc), baseURL).origin, baseURL, 'Example photography is fetched from an external service');
    const decoded = await image.evaluate(async element => {
      try { const bitmap = await globalThis.createImageBitmap(await (await globalThis.fetch(element.currentSrc)).blob()); const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return dimensions; }
      catch { return { width: 0, height: 0 }; }
    });
    assert(decoded.width >= 200 && decoded.height >= 200, 'The public example photo is missing or a placeholder');
  }
  assert.match(await example.innerText(), /illustrative|example facts/i, 'The public example presents invented wearer facts as real');
  assert.match(await page.getByRole('region', { name: /wardrobe.*private/i }).innerText(), /GetYourFit server/i, 'Privacy copy falsely claims hosted photos stay on the phone');
  assert.doesNotMatch(await page.getByRole('main').innerText(), /v0\.[12]|local edition|local app|private on this device/i, 'The public screen exposes release jargon or false device-local promises');
  const primary = page.getByRole('link', { name: /^build my wardrobe/i });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await primary.evaluate(element => element.getBoundingClientRect().height >= 44), 'The primary wardrobe action is too small to tap');
    assert(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), `Public screen overflows at ${width}px`);
    await page.screenshot({ path: path.join(output, 'screenshots', `public-${width}.png`), fullPage: true });
    await page.evaluate(axe.source);
    const violations = await page.evaluate(async () => (await globalThis.axe.run(globalThis.document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })));
    assert.deepEqual(violations, [], `Public screen fails automated WCAG AA at ${width}px: ${JSON.stringify(violations)}`);
  }
  await assertHostedPrivacy(page, 'public');
  assert.equal(apiRequests.length, 0, 'The public example depends on account APIs');
  const entry = await page.locator('script[type=module][src]').first().getAttribute('src');
  assert(entry, 'The public application module is missing');
  const moduleResponse = await context.request.get(new URL(entry, baseURL).href, { headers: { 'accept-encoding': 'gzip' } });
  assert(moduleResponse.ok(), 'The public application module cannot be loaded');
  assert.equal(moduleResponse.headers()['content-encoding'], 'gzip', 'The public application module is not compressed');
  assert((await moduleResponse.body()).length > 1000, 'The compressed application module cannot be decoded');
  await context.unroute('**/api/**');
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseSession;
  const sessionGate = new Promise(resolve => { releaseSession = resolve; });
  await context.route('**/api/session', async route => { await sessionGate; await route.continue(); });
  await primary.focus();
  await page.keyboard.press('Enter');
  await requiredControl(page.getByRole('status').filter({ hasText: /opening.*account/i }), 'Signup loading has no status announcement');
  const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === contract.session);
  releaseSession();
  await sessionResponse;
  await context.unroute('**/api/session');
  const name = page.getByLabel(/^(your |display )?name$/i);
  await name.waitFor();
  assert(await name.evaluate(element => element === globalThis.document.activeElement), 'Signup entry lost keyboard focus');
  await assertHostedPrivacy(page, 'signup');
  const password = page.getByLabel(/^password/i);
  const description = await password.evaluate(element => (element.getAttribute('aria-describedby') || '').split(/\s+/).map(id => globalThis.document.getElementById(id)?.textContent || '').join(' '));
  assert.match(description, /12/, 'Signup password requirements are not described');
  assert(await password.evaluate(element => parseFloat(globalThis.getComputedStyle(element).fontSize) >= 16), 'Phone signup inputs are too small and can trigger zoom');
  const user = credentials();
  await name.fill(user.name);
  await page.getByLabel(/^email/i).fill(user.email);
  await password.fill(user.password);
  await page.getByRole('checkbox', { name: /18|age/i }).check();
  await password.focus();
  await context.route('**/api/auth/sign-up/email', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporarily unavailable' }) }));
  await signupSubmission(page, () => page.keyboard.press('Enter'), 'Enter');
  const alert = page.getByRole('alert');
  await requiredControl(alert, 'Signup failure has no accessible error');
  assert(await alert.evaluate(element => element === globalThis.document.activeElement), 'Signup error lost keyboard focus');
  assert.match(await alert.innerText(), /try again/i, 'Signup error offers no recovery');
  assert.equal(await page.getByLabel(/^email/i).inputValue(), user.email, 'Signup failure lost the entered email');
  await page.screenshot({ path: path.join(output, 'screenshots', 'signup-error-390.png'), fullPage: true, mask: [page.locator('input[type=email], input[type=password]')] });
  await context.unroute('**/api/auth/sign-up/email');
  await password.focus();
  const registered = await signupSubmission(page, () => page.keyboard.press('Enter'), 'Enter');
  assert(registered.ok(), `Keyboard signup returned HTTP ${registered.status()}`);
  await page.getByRole('button', { name: /create.*account/i }).waitFor({ state: 'hidden' });
  await session(context, user.email);
  const heading = page.getByRole('heading', { name: /wardrobe/i }).first();
  await heading.waitFor();
  assert(await heading.evaluate(element => element === globalThis.document.activeElement), 'Successful signup lost wardrobe focus');
  const garments = await jsonOK(await api(context, 'GET', contract.wardrobe), 'New wardrobe');
  assert.deepEqual(garments, [], 'Example garments were inserted into the private wardrobe');
  await assertHostedPrivacy(page, 'wardrobe/account');
  if (!stubMode) await verifyHostedPrivacyMutation(page, 'wardrobe/account');
}
async function assertHostedPrivacy(page, surface) {
  const claims = await page.locator('body').innerText();
  assert.doesNotMatch(claims, /\b(?:sav(?:ed|ing|e)|stor(?:ed|ing|e)|kept|private|stays?|remains?)[^,.;!?\n]{0,80}\b(?:on|in)\s+(?:this|your|the)\s+(?:device|phone|browser)\b|\bno (?:image|photo) leaves (?:this|your|the) device\b/i, `False on-device storage claim on ${surface}`);
}
async function verifyHostedPrivacyMutation(page, surface) {
  const claims = {
    'wardrobe/account': 'Your wardrobe stays on this device.',
    'garment consent': 'Your photo is stored on this device.',
    'saved garment/outfit': 'Garment saved on this device.',
  };
  const claim = claims[surface];
  assert(claim, `Unknown privacy mutation surface: ${surface}`);
  await assertHostedPrivacy(page, surface);
  await page.locator('main').first().evaluate((main, text) => {
    const notice = globalThis.document.createElement('p');
    notice.dataset.acceptancePrivacyMutation = 'true';
    notice.textContent = text;
    main.append(notice);
  }, claim);
  const mutation = page.locator('[data-acceptance-privacy-mutation="true"]');
  let failure;
  try {
    assert(await mutation.isVisible(), `Injected privacy claim is not visible on ${surface}`);
    await assertHostedPrivacy(page, surface);
  } catch (error) { failure = error; }
  finally { await page.locator('[data-acceptance-privacy-mutation="true"]').evaluateAll(notices => notices.forEach(notice => notice.remove())); }
  assert(failure, `Privacy verifier accepted the injected device-only claim on ${surface}`);
  assert.equal(failure.code, 'ERR_ASSERTION', `Privacy verifier failed outside an assertion on ${surface}`);
  assert.equal(failure.message, `False on-device storage claim on ${surface}`, `Privacy verifier failed at the wrong assertion on ${surface}`);
  await assertHostedPrivacy(page, surface);
  privacyMutationProof.push({ surface, claim, cleanControl: 'passed', injectedClaim: 'detected', assertion: failure.message });
}
async function signupSubmission(page, action, input) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/auth/') && response.request().method() === 'POST'),
      action(),
    ]);
    return response;
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error(`Browser signup did not submit on ${input}`);
    throw error;
  }
}
async function browserJourney(context, page) {
  const errors = [], outsideRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== baseURL) { outsideRequests.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto(baseURL);
  await page.getByRole('main').waitFor();
  await page.getByRole('link', { name: /build my wardrobe|get started|sign up|create.*account/i }).or(page.getByRole('button', { name: /get started|sign up|create.*account/i })).first().click();
  const user = credentials();
  await page.getByLabel(/^email/i).fill(user.email);
  await page.getByLabel(/^password/i).fill(user.password);
  const age = page.getByRole('checkbox', { name: /18|age/i });
  await requiredControl(age, 'Mandatory 18+ confirmation checkbox is missing from signup');
  await age.check();
  const name = page.getByLabel(/^(your |display )?name$/i);
  await name.waitFor();
  const create = page.getByRole('button', { name: /create.*account|sign up/i });
  await requiredControl(create, 'Signup action is missing from the account form');
  const signupAttempts = [];
  const observeSignup = request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/auth/')) signupAttempts.push(request);
  };
  page.on('request', observeSignup);
  await name.fill('');
  const emptyNameInvalid = await name.evaluate(input => input.validity.valueMissing);
  await create.click();
  assert(emptyNameInvalid, 'Empty signup name was not refused by the form');
  assert.equal(signupAttempts.length, 0, 'Empty signup name submitted an account request');
  assert(await create.isVisible(), 'Empty signup name left the account form');
  await name.fill('Acceptance wearer');
  await age.uncheck();
  await create.click();
  await page.waitForTimeout(500);
  assert.equal(signupAttempts.length, 0, 'Unchecked 18+ signup was not refused by the form');
  assert(await create.isVisible(), 'Unchecked 18+ signup left the account form');
  page.off('request', observeSignup);
  await age.check();
  const registered = await signupSubmission(page, () => create.tap(), 'tap');
  assert(registered.ok(), `Browser signup returned HTTP ${registered.status()}`);
  await create.waitFor({ state: 'hidden' });
  const cookies = await context.cookies();
  assert(cookies.some(cookie => cookie.httpOnly && ['Lax', 'Strict'].includes(cookie.sameSite)), 'Browser signup did not create a private session');
  const input = page.getByLabel(/garment photo/i);
  const entry = page.getByRole('button', { name: /^\+?\s*add garment$/i });
  await entry.or(input).filter({ visible: true }).first().waitFor();
  if (!(await input.isVisible())) await entry.first().click();
  await input.waitFor();
  const consent = page.getByRole('checkbox', { name: /photo|process/i });
  await assertHostedPrivacy(page, 'garment consent');
  if (!stubMode) await verifyHostedPrivacyMutation(page, 'garment consent');
  assert.equal(await consent.isChecked(), false, 'Photo consent was preselected');
  await consent.check();
  await input.setInputFiles(path.join(suiteRoot, 'fixtures', shirt.filename));
  const review = page.getByRole('button', { name: /review photo/i });
  if (await review.count()) await review.click();
  const factsForm = page.locator('form').filter({ hasText: /confirm your garment facts/i });
  await factsForm.waitFor();
  await factsForm.getByLabel(/^name$/i).fill(shirt.name);
  await selectByText(factsForm.getByLabel(/^category/i), /^top$/i);
  await factsForm.getByLabel(/^color$/i).fill(shirt.color);
  await factsForm.getByLabel(/size on label/i).fill(shirt.size);
  await selectByText(factsForm.getByLabel(/does it fit you now/i), /^(yes, it )?fits$/i);
  await factsForm.getByLabel(/^mild$/i).check();
  await factsForm.getByLabel(/^smart-casual$/i).check();
  await factsForm.getByLabel(/available to wear now/i).check();
  await factsForm.getByLabel(/confirm this garment is mine/i).check();
  const [uploaded] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === contract.wardrobe && response.request().method() === 'POST'),
    factsForm.getByRole('button', { name: /save garment|add garment|upload photo/i }).click(),
  ]);
  const item = await jsonOK(uploaded, 'Browser garment upload');
  assertGarmentFacts(item, shirt, 'Browser upload');
  const outfitForm = page.locator('form').filter({ has: page.getByLabel(/occasion/i) });
  await outfitForm.getByLabel(/occasion/i).fill(facts.occasion);
  await selectByText(outfitForm.getByLabel(/weather/i), /^mild$/i);
  await selectByText(outfitForm.getByLabel(/dress.?code/i), /^smart[ -]casual$/i);
  const [suggested] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === contract.outfits && response.request().method() === 'POST'),
    page.getByRole('button', { name: /suggest.*outfit|what.*wear|find.*outfit/i }).click(),
  ]);
  const body = await jsonOK(suggested, 'Browser outfit request');
  const answer = requireQuestionOrAbstention(body, 'Single-shirt browser wardrobe');
  await page.getByText(answer, { exact: true }).waitFor();
  const savedPhotoURL = new URL(item.photoUrl, baseURL).href;
  const renderedPhoto = async label => {
    let result = null;
    for (let attempt = 0; attempt < 40 && !result; attempt += 1) {
      if (attempt) await page.waitForTimeout(250);
      result = await page.getByRole('img', { name: /garment|shirt/i }).evaluateAll(async (images, expectedSource) => {
        const img = images.find(candidate => candidate.currentSrc === expectedSource);
        if (!img) return null;
        await img.decode();
        const canvas = globalThis.document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
        const context = canvas.getContext('2d'); context.drawImage(img, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        let fingerprint = 2166136261;
        for (const value of pixels) fingerprint = Math.imul(fingerprint ^ value, 16777619);
        return { source: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight, fingerprint: fingerprint >>> 0 };
    }, savedPhotoURL).catch(() => null);
    }
    assert(result, `${label} image source does not match saved photoUrl`);
    assert(result.width >= 100 && result.height >= 100, `${label} did not decode as a garment photo`);
    return result;
  };
  const image = page.getByRole('img', { name: /garment|shirt/i }).first();
  await image.waitFor();
  await assertHostedPrivacy(page, 'saved garment/outfit');
  if (!stubMode) await verifyHostedPrivacyMutation(page, 'saved garment/outfit');
  const uploadedPhoto = await renderedPhoto('Uploaded garment');
  await page.reload();
  await session(context, user.email);
  const reloadedImage = page.getByRole('img', { name: /garment|shirt/i }).first();
  await reloadedImage.waitFor();
  await assertHostedPrivacy(page, 'refreshed wardrobe/account');
  const reloadedPhoto = await renderedPhoto('Reloaded garment');
  assert.equal(reloadedPhoto.fingerprint, uploadedPhoto.fingerprint, 'Reloaded garment image changed from the saved photo');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1), `Main journey overflows at ${width}px`);
  }
  assert.deepEqual(errors, [], 'Main journey has browser errors');
  assert.deepEqual(outsideRequests, [], 'Main journey sends requests outside the isolated service');
}
