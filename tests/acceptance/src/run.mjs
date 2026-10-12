import { chromium } from 'playwright';
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
const appPort = stubMode ? await freePort() : 4174;
const mailPort = await freePort();
const baseURL = `http://127.0.0.1:${appPort}`;
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex < 0 ? undefined : process.argv[onlyIndex + 1];
const output = process.env.ACCEPTANCE_OUTPUT || await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-report-'));
const photo = await readFile(path.join(suiteRoot, 'fixtures/garment-photo.jpg'));
const facts = { occasion: 'dinner', weather: 'mild and dry', dress_code: 'smart casual' };
const secrets = new Set();
const cases = [
  [caseNames.browser, ['R4', 'R5', 'R7', 'R26', 'A-1'], browserJourney],
  [caseNames.signup, ['R4', 'R26', 'R27', 'A-1'], signupJourney],
  [caseNames.authentication, ['R26', 'R27'], authenticationFailures],
  [caseNames.photo, ['R7', 'R26', 'R27'], photoJourney],
  [caseNames.outfit, ['R4', 'R5', 'R14', 'R19', 'A-1'], outfitJourney],
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
  assert(stubMode || only === undefined, 'Selective cases are restricted to stub verification');
  assert(only === undefined || cases.some(([name]) => name === only), 'Unknown selected case');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(revision.status, 0, 'Cannot establish the checked Git revision');
  head = revision.stdout.trim();
  const worktree = spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(worktree.status, 0, 'Cannot establish worktree state');
  worktreeClean = worktree.stdout.trim() === '';
  if (!stubMode) await freePortCheck(appPort);
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
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
    if (manifest.scripts?.start) {
      server = spawn('npm', ['start'], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } else {
      runtime = 'production-static-only';
      results.push({ name: 'V01 production API service', requirement_ids: ['R4', 'A-1'], status: 'failed', error: 'package.json has no npm start production service contract. Static preview is used only to collect browser and API findings.' });
      server = spawn(process.execPath, [path.join(projectRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    }
  }
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk.toString(); if (logs.length > 4 * 1024 * 1024) { logOverflow = true; logs = logs.slice(-4 * 1024 * 1024); } });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const [name, ids, check] of cases) {
    if (only && name !== only) continue;
    const item = { name, requirement_ids: ids, status: 'passed' };
    const caseStart = Date.now();
    const context = await browser.newContext({ baseURL });
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
} catch (error) {
  results.push({ name: 'runner setup', requirement_ids: ['A-1'], status: 'failed', error: redact(error.stack || error) });
} finally {
  await browser?.close();
  await stopOwnedServer();
  for (const socket of smtpSockets) socket.destroy();
  if (mailCatcher?.listening) await new Promise(resolve => mailCatcher.close(resolve));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

const report = { schema: 'gyf-acceptance-report/v2', release: 'v0.1', head_sha: head, worktree_clean: worktreeClean, source: stubMode ? 'contract-stub' : 'production-build', runtime, base_url: baseURL, started_at: new Date(started).toISOString(), duration_ms: Date.now() - started, summary: { total: results.length, passed: results.filter(x => x.status === 'passed').length, failed: results.filter(x => x.status === 'failed').length, skipped: 0 }, cases: results };
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.summary, report: path.join(output, 'report.json') }));
process.exitCode = report.summary.failed ? 1 : 0;

async function freePortCheck(port) {
  const probe = tcpServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function freePort() {
  const probe = tcpServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
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
  return context.request.fetch(endpoint, { method, data, headers: { origin: baseURL }, timeout: 10000 });
}
async function jsonOK(response, label) {
  assert(response.ok(), `${label} returned HTTP ${response.status()}`);
  assert.match(response.headers()['content-type'] || '', /application\/json/, `${label} did not return JSON`);
  return response.json();
}
async function signup(context, user = credentials()) {
  const response = await api(context, 'POST', contract.register, user);
  await jsonOK(response, 'Signup');
  return user;
}
async function session(context, email) {
  const body = await jsonOK(await api(context, 'GET', contract.session), 'Session');
  assert.equal(body.email, email, 'Session belongs to a different user or is missing');
}
async function upload(context, consent = true, bytes = photo, mimeType = 'image/jpeg') {
  return context.request.post(contract.wardrobe, { headers: { origin: baseURL }, multipart: { photo: { name: 'garment-photo.jpg', mimeType, buffer: bytes }, photo_consent: String(consent), ownership: 'owned' }, timeout: 10000 });
}
async function garment(context) {
  const item = await jsonOK(await upload(context), 'Garment upload');
  assert(item.id && item.photo_url, 'Saved garment has no stable ID or retrievable photo URL');
  assert.equal(item.ownership, 'owned', 'Explicit ownership was lost');
  return item;
}
function localPhotoURL(item) {
  const url = new URL(item.photo_url, baseURL);
  assert.equal(url.origin, baseURL, 'Photo URL sends private media outside the local service');
  return url.href;
}
function completeOutfit(body, garmentId) {
  assert(Array.isArray(body.outfits) && body.outfits.length > 0, 'No outfit suggestion returned');
  for (const outfit of body.outfits) {
    assert(typeof outfit.explanation === 'string' && outfit.explanation.trim().length > 10, 'Outfit lacks a meaningful explanation');
    assert(Array.isArray(outfit.items), 'Outfit has no garment set');
    const categories = new Set(outfit.items.map(item => item.category));
    assert(['top', 'bottom', 'footwear'].every(category => categories.has(category)), 'Suggestion omits top, bottom or footwear');
    assert(outfit.items.some(item => item.id === garmentId), 'Suggestion ignored the uploaded shirt');
    assert(outfit.items.filter(item => item.id !== garmentId).every(item => item.ownership !== 'owned'), 'Suggestion invented additional owned clothes');
  }
}
async function signupJourney(context) {
  const user = credentials();
  const response = await api(context, 'POST', contract.register, user);
  await jsonOK(response, 'Signup');
  const cookie = response.headers()['set-cookie'] || '';
  assert.match(cookie, /HttpOnly/i, 'Session cookie must be HttpOnly');
  assert.match(cookie, /SameSite=(Lax|Strict)/i, 'Session cookie must restrict cross-site use');
  await session(context, user.email);
  const refreshed = await browser.newContext({ baseURL, storageState: await context.storageState() });
  try { await session(refreshed, user.email); } finally { await refreshed.close(); }
  const takeover = credentials();
  const duplicate = await api(context, 'POST', contract.register, { ...takeover, email: user.email });
  assert([400, 409, 422].includes(duplicate.status()), 'Duplicate signup was not refused');
  const login = await api(context, 'POST', contract.login, user);
  await jsonOK(login, 'Login after duplicate signup');
  await session(context, user.email);
}
async function authenticationFailures(context) {
  const user = await signup(context);
  const stranger = await browser.newContext({ baseURL });
  try {
    const wrong = await api(stranger, 'POST', contract.login, { email: user.email, password: credentials().password });
    const unknown = await api(stranger, 'POST', contract.login, credentials());
    assert([401, 403].includes(wrong.status()), 'Wrong password accepted');
    assert.equal(unknown.status(), wrong.status(), 'Unknown account has a different refusal status');
    assert.deepEqual(await unknown.json(), await wrong.json(), 'Unknown account has a different refusal body');
    assert([401, 403].includes((await api(stranger, 'GET', contract.session)).status()), 'Invalid credentials created a session');
  } finally { await stranger.close(); }
}
async function photoJourney(context, page) {
  await signup(context);
  const item = await garment(context);
  const saved = await jsonOK(await api(context, 'GET', `${contract.wardrobe}/${encodeURIComponent(item.id)}`), 'Saved garment');
  assert.equal(saved.id, item.id, 'Upload did not persist');
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
  }, [bytes.toString('base64'), photo.toString('base64')]);
  assert(match.width >= 100 && match.height >= 100 && match.difference < 0.08, 'Stored photo is a placeholder, damaged or different from the real upload');
  for (const rejected of [await upload(context, false), await upload(context, true, Buffer.from('damaged photo')), await upload(context, true, Buffer.from('plain text'), 'text/plain')]) {
    assert([400, 415, 422].includes(rejected.status()), 'Invalid or non-consented upload accepted');
  }
  const list = await jsonOK(await api(context, 'GET', contract.wardrobe), 'Wardrobe');
  assert.deepEqual(list.items.map(value => value.id), [item.id], 'Rejected uploads changed the wardrobe');
}
async function outfitJourney(context) {
  await signup(context);
  const item = await garment(context);
  const body = await jsonOK(await api(context, 'POST', contract.outfits, facts), 'Outfit request');
  completeOutfit(body, item.id);
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
      for (const response of [await api(intruder, 'GET', endpoint), await api(intruder, 'PATCH', endpoint, { color: 'stolen' }), await api(intruder, 'DELETE', endpoint), await api(intruder, 'GET', localPhotoURL(item))]) {
        assert([401, 403, 404].includes(response.status()), 'Private garment or photo was accessible to another session');
      }
    }
    const saved = await jsonOK(await api(context, 'GET', `${contract.wardrobe}/${encodeURIComponent(item.id)}`), 'Owner garment after attack');
    assert.deepEqual(saved, item, 'Another session changed or deleted the garment');
    const own = await jsonOK(await api(other, 'GET', contract.wardrobe), 'Other user wardrobe');
    assert.equal(own.items.length, 0, 'Other user list leaked private garment');
  } finally { await other.close(); await anonymous.close(); }
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
  await page.getByRole('link', { name: /get started|sign up|create.*account/i }).or(page.getByRole('button', { name: /get started|sign up|create.*account/i })).first().click();
  const user = credentials();
  await page.getByLabel(/^email/i).fill(user.email);
  await page.getByLabel(/^password/i).fill(user.password);
  const age = page.getByRole('checkbox', { name: /18|age/i });
  if (await age.count()) await age.check();
  const name = page.getByLabel(/^(your |display )?name$/i);
  await name.waitFor();
  const create = page.getByRole('button', { name: /create.*account|sign up/i });
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
  page.off('request', observeSignup);
  await name.fill('Acceptance wearer');
  const [registered] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/auth/') && response.request().method() === 'POST'),
    create.click(),
  ]);
  assert(registered.ok(), `Browser signup returned HTTP ${registered.status()}`);
  await create.waitFor({ state: 'hidden' });
  const cookies = await context.cookies();
  assert(cookies.some(cookie => cookie.httpOnly && ['Lax', 'Strict'].includes(cookie.sameSite)), 'Browser signup did not create a private session');
  const input = page.getByLabel(/garment photo/i);
  const entry = page.getByRole('button', { name: /^\+?\s*add garment$/i });
  if (!(await input.isVisible()) && await entry.count()) await entry.first().click();
  await input.waitFor();
  const consent = page.getByRole('checkbox', { name: /photo|process/i });
  assert.equal(await consent.isChecked(), false, 'Photo consent was preselected');
  await consent.check();
  await input.setInputFiles(path.join(suiteRoot, 'fixtures/garment-photo.jpg'));
  const review = page.getByRole('button', { name: /review photo/i });
  if (await review.count()) await review.click();
  const [uploaded] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === contract.wardrobe && response.request().method() === 'POST'),
    page.locator('form').filter({ has: input }).getByRole('button', { name: /save garment|add garment|upload photo/i }).click(),
  ]);
  const item = await jsonOK(uploaded, 'Browser garment upload');
  await page.getByLabel(/occasion/i).fill(facts.occasion);
  await page.getByLabel(/weather/i).fill(facts.weather);
  await page.getByLabel(/dress.?code/i).fill(facts.dress_code);
  const [suggested] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === contract.outfits && response.request().method() === 'POST'),
    page.getByRole('button', { name: /suggest.*outfit|what.*wear|find.*outfit/i }).click(),
  ]);
  const body = await jsonOK(suggested, 'Browser outfit request');
  completeOutfit(body, item.id);
  for (const outfit of body.outfits) await page.getByText(outfit.explanation, { exact: true }).waitFor();
  const image = page.getByRole('img', { name: /garment|shirt/i }).first();
  await image.waitFor();
  assert(await image.evaluate(img => img.complete && img.naturalWidth >= 100), 'Uploaded garment is not visible');
  await page.reload();
  await session(context, user.email);
  await page.getByRole('img', { name: /garment|shirt/i }).first().waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1), `Main journey overflows at ${width}px`);
  }
  assert.deepEqual(errors, [], 'Main journey has browser errors');
  assert.deepEqual(outsideRequests, [], 'Main journey sends requests outside the isolated service');
}
