import { chromium, request as playwrightRequest } from 'playwright';
import { mkdir, writeFile, rm, readFile, mkdtemp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import axe from 'axe-core';
import { contract, accounts } from './contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectRoot = path.resolve(here, '../../..');
const output = path.join(root, 'results');
const screenshotDir = path.join(output, 'screenshots');
const usingStub = process.argv.includes('--stub');
const baseURL = 'http://localhost:4179';
const requirementsFile = (process.argv.includes('--stub') && optionValue('--requirements-file')) || path.join(projectRoot, 'docs/requirements.md');
const acceptanceFile = (process.argv.includes('--stub') && optionValue('--acceptance-file')) || path.join(projectRoot, 'docs/slice-1-acceptance.md');
const pendingStatuses = new Set(['slice1-pending', 'next', 'later', 'deferred-with-reason']);
const dinnerFacts = { occasion: 'dinner', weather: 'mild and dry', dress_code: 'smart casual', budget: { amount: 6000, currency: 'INR' } };
const a1AccessStatusId = 'A-1:all-states-accessibility-responsive-behavior-security-and-visual-review';
const selectedCase = usingStub ? optionValue('--only') : undefined;
const runId = randomUUID().slice(0, 8);
let caseIndex = 0;
let stub;
let server;
let dataDir;
let serverOutput = '';
const sensitiveValues = new Set();

await rm(path.join(output, 'report.json'), { force: true });
await rm(screenshotDir, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

const started = Date.now();
let browser;
const results = [];
const fails = [];
const measurements = {};
let activePage;
const cases = [
  ['R26 sign up creates account and verification mail', register, ['R26'], ['A02']],
  ['R26 browser account journey signs up verifies signs in refreshes and signs out', () => isolated(browserAccountJourney), ['R26'], ['A02','A03','A07']],
  ['R26 email verification activates account', verify, ['R26'], ['A03']],
  ['R26 sign in establishes session', login, ['R26'], ['A03']],
  ['R26 session survives a fresh browser context', sessionRefresh, ['R26'], ['A03']],
  ['R26 sign out clears session', logout, ['R26'], ['A07']],
  ['R26 wrong password is refused', wrongPassword, ['R26']],
  ['R26 unknown email does not reveal account existence', unknownEmail, ['R26']],
  ['R26 unverified account cannot sign in', unverified, ['R26']],
  ['R26 expired verification link is refused', expiredLink, ['R26'], ['A03']],
  ['R26 verification link cannot be reused', reusedLink, ['R26'], ['A03']],
  ['R26 password reset works and reset link cannot be reused', passwordReset, ['R26'], ['A04']],
  ['R26 weak password is rejected', weakPassword, ['R26'], ['A02']],
  ['R26 duplicate email is refused without account takeover', duplicateEmail, ['R26'], ['A02']],
  ['R26 age confirmation is required without collecting birth date', ageConfirmation, ['R26'], ['A02']],
  ['R26 repeated failed passwords trigger lockout', lockout, ['R26'], ['A05']],
  ['R26 sign out everywhere revokes other sessions', logoutEverywhere, ['R26'], ['A07']],
  ['R26 second factor accepts correct code and rejects wrong code', secondFactor, ['R26'], ['A06']],
  ['R26 deleting account prevents later sign in', deletion, ['R26'], ['A16']],
  ['R26 account data export returns an owned archive', dataExport, ['R26', 'R7'], ['A15']],
  ['R27 cross-origin mutation is refused', wrongOrigin, ['R27'], ['A05']],
  ['R27 missing-origin mutation is refused', missingOrigin, ['R27'], ['A05']],
  ['R27 cross-site state changes are refused', csrf, ['R27'], ['A05']],
  ['R27 sign-in and reset mutations enforce rate controls', rateControls, ['R27','R26'], ['A05']],
  ['R27 separate accounts cannot read each other data', tenantIsolation, ['R27', 'R7']],
  ['R7 garment photo is interpreted without claiming ownership', garmentInterpretation, ['R7'], ['A08']],
  ['A08 asks consent and rejects corrupt or unsupported garment photos locally', photoConsent, ['R7'], ['A08']],
  ['R7 user correction persists and changes wardrobe state', correctionPersists, ['R7'], ['A09','A13']],
  ['R9 wardrobe ownership and provenance are explicit', wardrobeProvenance, ['R9'], ['A09','A10']],
  ['R5 explicit occasion weather and dress-code facts return complete outfits', completeOutfit, ['R5', 'R7'], ['A12']],
  ['R9 outfit recommendation reuses only owned wardrobe garments', wardrobeReuse, ['R9', 'R5'], ['A12']],
  ['R11 unavailable candidates yield no complete outfit', noCompleteOutfit, ['R11'], ['A14']],
  ['R19 missing required facts trigger one clarification or abstention', lowConfidence, ['R19', 'R7'], ['A11']],
  ['A-1 offline wardrobe state offers recovery', offlineRecovery, ['R9'], [a1AccessStatusId]],
  ['A17 server-down sign-in preserves fields and offers safe recovery', serverDownRecovery, ['R26'], ['A17']],
  ['A-1 responsive layout fits 320px through 1440px including 390px', responsive, [], ['A01', a1AccessStatusId]],
  ['A-1 keyboard reaches the primary action', keyboard, ['R26'], ['A01']],
  ['A-1 page passes automated WCAG accessibility checks', accessibility, [], [a1AccessStatusId]],
  ['A-1 browser has no console errors or exposed test credentials', browserConsole, [], [a1AccessStatusId]],
  ['R26 private account data is absent from service logs', logPrivacy, ['R26'], [a1AccessStatusId]],
  ['A-1 production page sends baseline security headers', securityHeaders, [], [a1AccessStatusId]],
  ['A-1 landing document meets the 2.5 second load budget', performanceBudget, [], [a1AccessStatusId]],
  ['A-1 app is reachable in a real browser', browserSmoke, []],
  ['A18 workflow-owned R13 regression is not copied into this suite', null, [], ['A18'], 'external'],
];

try {
  const requirements = await readRequirementStatus();
  const acceptanceStatuses = await readAcceptanceMatrix();
  assert(!selectedCase || cases.some(([name]) => name === selectedCase), `stub verifier selected an unknown acceptance case: ${selectedCase}`);
  const apiRequired = cases.some(([, , ids]) => ids.some(id => !pendingStatuses.has(requirements.get(id).status)));
  if (usingStub) {
    stub = spawn(process.execPath, [path.join(here, 'stub-server.mjs')], {
      env: { ...process.env, PORT: '4179' }, stdio: ['ignore','pipe','pipe'],
    });
    captureOutput(stub);
  } else {
    const build = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, stdio: 'inherit' });
    if (build.status !== 0) throw new Error(`production build failed with status ${build.status}`);
    dataDir = await mkdtemp(path.join(tmpdir(), 'gyf-acceptance-'));
    if (apiRequired) {
      const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
      assert(manifest.scripts?.start, 'API acceptance cases are applicable, but package.json has no product-owned npm start server contract; Vite preview cannot prove the API journeys');
      server = spawn('npm', ['start'], { cwd: projectRoot, env: { ...process.env, PORT: '4179', GYF_DATA_DIR: dataDir }, stdio: ['ignore','pipe','pipe'] });
    } else {
      server = spawn(process.execPath, [path.join(projectRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4179', '--strictPort'], {
        cwd: projectRoot, env: { ...process.env, GYF_DATA_DIR: dataDir }, stdio: ['ignore','pipe','pipe'],
      });
    }
    captureOutput(server);
  }
  await waitForServer(baseURL, usingStub ? stub : server);
  browser = await chromium.launch({ headless: true });
  for (const [name, check, ids, acceptanceIds = [], disposition] of cases) {
    if (selectedCase && name !== selectedCase) continue;
    const item = { name, requirement_ids: ids, acceptance_ids: acceptanceIds, status: 'passed', duration_ms: 0 };
    const t = Date.now();
    if (disposition === 'external') {
      item.status = 'not_yet_applicable';
      item.reason = 'A18 requires the workflow repository R13 regression and explicitly forbids copying or altering that case.';
      results.push(item);
      continue;
    }
    const pending = ids.filter(id => pendingStatuses.has(requirements.get(id).status));
    const acceptancePending = acceptanceIds.filter(id => /^A\d{2}$/.test(id) && acceptanceStatuses.get(id) === 'Pending');
    const a1Pending = acceptanceIds.filter(id => id.startsWith('A-1:') && pendingStatuses.has(requirements.get(id).status));
    if (pending.length || acceptancePending.length || a1Pending.length) {
      item.status = 'not_yet_applicable';
      item.reason = [
        ...pending.map(id => `${id} is ${requirements.get(id).status} in docs/requirements.md: ${requirements.get(id).treatment}`),
        ...acceptancePending.map(id => `${id} is Pending in docs/slice-1-acceptance.md`),
        ...a1Pending.map(id => `${id} is ${requirements.get(id).status} in docs/requirements.md: ${requirements.get(id).treatment}`),
      ].join(' ');
      results.push(item);
      continue;
    }
    try { await check(); }
    catch (error) {
      item.status = 'failed';
      item.error = String(error?.stack || error);
      fails.push(name);
      if (browser) {
        let page = activePage;
        if (!page || page.isClosed()) {
          page = await newBrowserPage();
          try { await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 10000 }); }
          catch {}
        }
        await page.screenshot({ path: path.join(screenshotDir, `${slug(name)}.png`), fullPage: true }).catch(() => {});
        if (page !== activePage) await page.close();
      }
    }
    item.duration_ms = Date.now() - t;
    results.push(item);
  }
  try {
    const elapsed = await landingTimingMeasurement();
    if (elapsed !== null) measurements.landing_dom_content_loaded_ms = elapsed;
  } catch {}
} catch (error) {
  fails.push('runner setup');
  results.push({ name: 'runner setup', status: 'failed', error: String(error?.stack || error) });
} finally {
  await browser?.close();
  await stopChild(stub);
  await stopChild(server);
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

const report = {
  schema: 'gyf-acceptance-report/v1',
  base_url: baseURL,
  source: usingStub ? 'contract-stub' : 'production-build',
  started_at: new Date(started).toISOString(),
  duration_ms: Date.now() - started,
  measurements,
  summary: { total: results.length, passed: results.filter(x => x.status === 'passed').length, failed: fails.length, not_yet_applicable: results.filter(x => x.status === 'not_yet_applicable').length },
  cases: results,
};
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
if (fails.length || results.some(item => item.status === 'not_yet_applicable')) process.exitCode = 1;

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function freshContext() {
  const context = await playwrightRequest.newContext({ baseURL });
  return context;
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), delay(1000).then(() => false)]);
  if (stopped || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await Promise.race([exited, delay(1000)]);
}
function captureOutput(child) {
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => { serverOutput += chunk.toString(); });
}
async function api(ctx, method, endpoint, body, headers = {}) {
  const originHeader = ['POST', 'PATCH', 'DELETE'].includes(method) ? { origin: baseURL } : {};
  return ctx.fetch(endpoint, { method, data: body, headers: { ...originHeader, ...headers } });
}
function assertSessionCookie(response) {
  const cookie = response.headers()['set-cookie'] || '';
  assert(/HttpOnly/i.test(cookie), 'session cookie is not HttpOnly');
  assert(/Secure/i.test(cookie), 'session cookie is not Secure');
  assert(/SameSite=(Strict|Lax)/i.test(cookie), 'session cookie has no strict or lax SameSite policy');
}
function totpCode(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    assert(value >= 0, 'TOTP enrollment secret is not valid base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map(byte => parseInt(byte, 2)) || []);
  let counter = BigInt(Math.floor(now / 30000));
  const message = Buffer.alloc(8);
  for (let index = 7; index >= 0; index--) { message[index] = Number(counter & 0xffn); counter >>= 8n; }
  const digest = createHmac('sha1', bytes).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}
function jpegFromMultipart(body) {
  assert(Buffer.isBuffer(body), 'garment upload did not include a request body');
  const start = body.indexOf(Buffer.from([0xff, 0xd8]));
  const end = body.lastIndexOf(Buffer.from([0xff, 0xd9]));
  assert(start >= 0 && end > start, 'garment upload did not contain a JPEG payload');
  return body.subarray(start, end + 2);
}
async function create(ctx, user = accounts.valid) {
  sensitiveValues.add(user.email);
  sensitiveValues.add(user.password);
  const response = await api(ctx, 'POST', contract.register, user);
  assert([200, 201, 202].includes(response.status()), `register returned ${response.status()}`);
  return response;
}
async function verifyAccount(ctx, email = accounts.valid.email, token = randomUUID()) {
  return api(ctx, 'POST', contract.verify, { email, token });
}
async function makeVerified(ctx, user = accounts.valid) {
  await create(ctx, user);
  const token = await mailToken(user.email, { purpose: 'verification' });
  const response = await verifyAccount(ctx, user.email, token);
  assert(response.ok(), `verify returned ${response.status()}`);
  return token;
}
async function signIn(ctx, user = accounts.valid, headers = {}) {
  return api(ctx, 'POST', contract.login, user, headers);
}
async function isolated(fn) {
  const ctx = await freshContext();
  caseIndex++;
  accounts.valid.email = `acceptance-${runId}-${caseIndex}@example.test`;
  accounts.other.email = `acceptance-${runId}-${caseIndex}-other@example.test`;
  accounts.weak.email = `acceptance-${runId}-${caseIndex}-weak@example.test`;
  accounts.unknown.email = `acceptance-${runId}-${caseIndex}-unknown@example.test`;
  try { if (usingStub) await api(ctx, 'POST', '/__reset', {}); await fn(ctx); } finally { await ctx.dispose(); }
}
function assert(value, message) { if (!value) throw new Error(message); }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
async function waitForServer(url, child) {
  const until = Date.now() + 15000;
  let last;
  while (Date.now() < until) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`server process exited with status ${child.exitCode}`);
    try { const res = await fetch(url); if (res.status < 500) return; }
    catch (e) { last = e; }
    await delay(150);
  }
  throw new Error(`server did not start at ${url}: ${last}`);
}
async function mailLink(email, { purpose = 'verification', after = 0, timeoutMs = 10000 } = {}) {
  if (usingStub) {
    const url = new URL('/__mail', baseURL);
    url.searchParams.set('email', email);
    url.searchParams.set('purpose', purpose);
    const response = await fetch(url);
    assert(response.ok, `stub mail lookup returned ${response.status}`);
    return new URL((await response.json()).url);
  }
  const mailbox = process.env.ACCEPTANCE_MAIL_CATCHER_URL;
  assert(mailbox, 'ACCEPTANCE_MAIL_CATCHER_URL is required for real email verification and password reset');
  const mailboxURL = new URL(mailbox);
  assert(['localhost','127.0.0.1','::1'].includes(mailboxURL.hostname), 'acceptance mail catcher must be local; external email is prohibited');
  const searchURL = new URL('/api/v1/search', mailbox);
  searchURL.searchParams.set('query', `to:${email}`);
  searchURL.searchParams.set('limit', '10');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(searchURL);
    assert(search.ok, `mail catcher search returned ${search.status}`);
    const result = await search.json();
    const messages = result.Messages || result.messages || [];
    for (const message of messages) {
      const created = Date.parse(message.Created || message.created || message.Date || message.date || '');
      if (after && Number.isFinite(created) && created < after) continue;
      const id = message.ID || message.id;
      if (!id) continue;
      const bodyResponse = await fetch(new URL(`/view/${encodeURIComponent(id)}.txt`, mailbox));
      if (!bodyResponse.ok) continue;
      const body = (await bodyResponse.text()).replaceAll('&amp;', '&');
      const links = body.match(/https?:\/\/[^\s<>"']+/g) || [];
      for (const link of links) {
        try {
          const url = new URL(link.replace(/[),.;]+$/, ''));
          const matchesPurpose = purpose === 'reset' ? /reset/i.test(url.pathname) : /verify|confirm/i.test(url.pathname);
          if (url.searchParams.has('token') && matchesPurpose) return url;
        } catch {}
      }
    }
    await delay(150);
  }
  throw new Error(`no new ${purpose} message with a token link arrived for ${email} in the local mail catcher`);
}
async function mailToken(email, options = {}) {
  const token = (await mailLink(email, options)).searchParams.get('token');
  assert(token, `message sent to ${email} did not contain a token`);
  sensitiveValues.add(token);
  return token;
}
async function assertNoMailLink(email, purpose = 'verification') {
  try {
    await mailLink(email, { purpose, timeoutMs: 1000 });
  } catch (error) {
    if (/no new .* message|stub mail lookup returned 404/.test(String(error))) return;
    throw error;
  }
  throw new Error(`unexpected ${purpose} email link was sent to ${email}`);
}
function tokenExpiry(url) {
  for (const key of ['expires_at', 'expiresAt', 'expires', 'exp']) {
    const raw = url.searchParams.get(key);
    if (!raw) continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const token = url.searchParams.get('token') || '';
  const claims = token.split('.')[1];
  if (claims) {
    try {
      const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
      if (Number.isFinite(payload.exp)) return payload.exp * 1000;
    } catch {}
  }
  throw new Error('issued email link exposes no verifiable expiration time, so expiry cannot be tested honestly');
}
async function waitUntilLinkExpired(url) {
  if (usingStub) {
    const response = await fetch(`${baseURL}/__expire`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: url.searchParams.get('token') }) });
    assert(response.ok, `stub expiry control returned ${response.status}`);
    return;
  }
  const wait = tokenExpiry(url) - Date.now() + 50;
  assert(wait <= 25 * 60 * 1000, 'issued email link expiry is outside this bounded acceptance run; expiry remains unverified');
  if (wait > 0) await delay(wait);
}

async function register() { await isolated(async c => {
  await create(c);
  const res = await signIn(c);
  assert(res.status() === 401 || res.status() === 403 || res.status() === 202, `unverified login returned ${res.status()}`);
}); }
async function verify() { await isolated(async c => {
  await create(c); const token = await mailToken(accounts.valid.email); const res = await verifyAccount(c, accounts.valid.email, token);
  assert(res.ok(), `verify returned ${res.status()}`);
  assert((await signIn(c)).ok(), 'verified account could not sign in');
}); }
async function login() { await isolated(async c => { await makeVerified(c); assert((await signIn(c)).ok(), 'valid sign-in refused'); }); }
async function sessionRefresh() { await isolated(async c => {
  await makeVerified(c); const loginRes = await signIn(c); assert(loginRes.ok(), 'sign-in failed');
  assertSessionCookie(loginRes);
  const body = await loginRes.json(); assert(!/session_token|access_token|bearer/i.test(JSON.stringify(body)), 'sign-in exposed a bearer session token');
  assert((await api(c, 'GET', '/api/auth/session')).ok(), 'session cookie was not accepted after sign-in');
  const fresh = await playwrightRequest.newContext({ baseURL, storageState: await c.storageState() });
  try { const res = await api(fresh, 'GET', '/api/auth/session'); assert(res.ok(), 'session cookie did not survive a fresh context'); }
  finally { await fresh.dispose(); }
}); }
async function logout() { await isolated(async c => {
  await makeVerified(c); const loginRes = await signIn(c); assert(loginRes.ok(), 'sign-in failed');
  const observer = await playwrightRequest.newContext({ baseURL, storageState: await c.storageState() });
  try {
  assert((await api(c, 'POST', contract.logout, {})).ok(), 'logout failed');
  assert(!(await api(observer, 'GET', '/api/auth/session')).ok(), 'session remained valid after local sign-out');
  } finally { await observer.dispose(); }
}); }
async function wrongPassword() { await isolated(async c => { await makeVerified(c); const res = await signIn(c, { ...accounts.valid, password: accounts.invalidPassword }); assert(!res.ok(), 'wrong password accepted'); }); }
async function unknownEmail() { await isolated(async c => {
  await makeVerified(c);
  const knownLogin = await signIn(c, { ...accounts.valid, password: accounts.invalidPassword });
  const unknownLogin = await signIn(c, { email: accounts.unknown.email, password: accounts.invalidPassword });
  assert(knownLogin.status() === unknownLogin.status(), 'sign-in status reveals whether the email exists');
  assert(JSON.stringify(await knownLogin.json()) === JSON.stringify(await unknownLogin.json()), 'sign-in response reveals whether the email exists');
  const a = await api(c, 'POST', contract.forgot, { email: accounts.valid.email });
  const b = await api(c, 'POST', contract.forgot, { email: accounts.unknown.email });
  assert(a.status() === b.status(), 'password reset status reveals whether account exists');
  assert(JSON.stringify(await a.json()) === JSON.stringify(await b.json()), 'password reset response reveals whether account exists');
  await assertNoMailLink(accounts.unknown.email, 'reset');
}); }
async function unverified() { await isolated(async c => { await create(c); const r = await signIn(c); assert(!r.ok(), 'unverified account signed in'); }); }
async function expiredLink() { await isolated(async c => {
  await create(c);
  const verification = await mailLink(accounts.valid.email, { purpose: 'verification' });
  await waitUntilLinkExpired(verification);
  const refusedVerification = await verifyAccount(c, accounts.valid.email, verification.searchParams.get('token'));
  assert([400,410,422].includes(refusedVerification.status()), `expired issued verification link returned ${refusedVerification.status()}`);
  await makeVerified(c, accounts.other);
  const requestedAt = Date.now();
  const request = await api(c, 'POST', contract.forgot, { email: accounts.other.email });
  assert(request.ok(), 'password reset request failed before expiry check');
  const resetLink = await mailLink(accounts.other.email, { purpose: 'reset', after: requestedAt });
  await waitUntilLinkExpired(resetLink);
  const refusedReset = await api(c, 'POST', contract.reset, { email: accounts.other.email, token: resetLink.searchParams.get('token'), password: accounts.resetPassword });
  assert([400,410,422].includes(refusedReset.status()), `expired issued reset link returned ${refusedReset.status()}`);
}); }
async function reusedLink() { await isolated(async c => {
  await create(c); const token = await mailToken(accounts.valid.email);
  assert((await verifyAccount(c, accounts.valid.email, token)).ok(), 'first verify failed');
  const r = await verifyAccount(c, accounts.valid.email, token); assert(!r.ok(), 'verification token reused');
}); }
async function passwordReset() { await isolated(async c => {
  await makeVerified(c); const login = await signIn(c); assert(login.ok(), 'pre-reset sign-in failed');
  const requestedAt = Date.now();
  const r = await api(c, 'POST', contract.forgot, { email: accounts.valid.email }); assert(r.ok(), 'reset request failed');
  const token = (await mailLink(accounts.valid.email, { purpose: 'reset', after: requestedAt })).searchParams.get('token');
  const reset = await api(c, 'POST', contract.reset, { email: accounts.valid.email, token, password: accounts.resetPassword }); assert(reset.ok(), 'reset failed');
  assert(!(await api(c, 'GET', '/api/auth/session')).ok(), 'password reset left the existing session active');
  assert((await signIn(c, { email: accounts.valid.email, password: accounts.resetPassword })).ok(), 'new password rejected');
  assert(!(await api(c, 'POST', contract.reset, { email: accounts.valid.email, token, password: accounts.reusedResetPassword })).ok(), 'reset token reused');
}); }
async function weakPassword() { await isolated(async c => {
  const r = await api(c, 'POST', contract.register, accounts.weak);
  assert([400,422].includes(r.status()), `weak password returned ${r.status()} instead of a validation response`);
  await assertNoMailLink(accounts.weak.email);
  assert([401,403].includes((await signIn(c, accounts.weak)).status()), 'weak-password registration left an account able to sign in');
}); }
async function duplicateEmail() { await isolated(async c => {
  await makeVerified(c);
  const duplicate = await api(c, 'POST', contract.register, { ...accounts.valid, password: accounts.takeoverPassword });
  assert([400,409,422].includes(duplicate.status()), `duplicate registration returned ${duplicate.status()}`);
  assert((await signIn(c)).ok(), 'duplicate registration changed the original account password');
  assert([401,403].includes((await signIn(c, { ...accounts.valid, password: accounts.takeoverPassword })).status()), 'duplicate registration took over the original account');
}); }
async function ageConfirmation() { await isolated(async c => {
  const res = await api(c, 'POST', contract.register, { ...accounts.valid, age_confirmed: false });
  assert([400,422].includes(res.status()), `missing age confirmation returned ${res.status()} instead of a validation response`);
  await assertNoMailLink(accounts.valid.email);
  assert([401,403].includes((await signIn(c)).status()), 'account was created without age confirmation');
}); }
async function lockout() { await isolated(async c => {
  await makeVerified(c);
  const fail = () => signIn(c, { ...accounts.valid, password: accounts.invalidPassword });
  assert([401,403].includes((await fail()).status()), 'wrong password did not return an authentication refusal');
  assert((await signIn(c)).ok(), 'successful sign-in after a failed attempt was refused');
  assert([401,403].includes((await fail()).status()), 'successful sign-in did not clear the failed-attempt state');
  let locked = false;
  for (let attempt = 0; attempt < 64; attempt++) {
    const response = await fail();
    if ([423,429].includes(response.status())) { locked = true; break; }
    assert([401,403].includes(response.status()), `repeated sign-in returned ${response.status()} instead of an authentication refusal or lockout`);
  }
  assert(locked, 'repeated failed sign-ins never produced the documented lockout/rate-limit response');
  assert([423,429].includes((await signIn(c)).status()), 'valid credentials bypassed an active sign-in lockout');
}); }
async function missingOrigin() { await isolated(async c => {
  const response = await c.fetch(contract.register, { method: 'POST', data: accounts.valid });
  assert([400,403].includes(response.status()), `state-changing request without Origin returned ${response.status()}`);
}); }
async function rateControls() { await isolated(async c => {
  const reset = () => api(c, 'POST', contract.forgot, { email: accounts.unknown.email });
  let limited = false;
  for (let attempt = 0; attempt < 64; attempt++) {
    const response = await reset();
    if ([423,429].includes(response.status())) { limited = true; break; }
    assert(response.status() === 200, `unknown-account reset returned ${response.status()} before rate limiting`);
  }
  assert(limited, 'repeated reset requests never produced the documented rate-limit response');
}); }
async function logoutEverywhere() { await isolated(async c => {
  await makeVerified(c); const one = await signIn(c); assert(one.ok(), 'first sign-in failed');
  const other = await freshContext();
  try {
    const two = await signIn(other); assert(two.ok(), 'second browser sign-in failed');
    await api(c, 'POST', contract.logoutEverywhere, {});
    for (const context of [c, other]) assert(!(await api(context, 'GET', '/api/auth/session')).ok(), 'a browser session survived global sign-out');
  } finally { await other.dispose(); }
}); }
async function secondFactor() { await isolated(async c => {
  await makeVerified(c); const initial = await signIn(c); assert(initial.ok(), 'initial sign-in failed');
  const enrollment = await api(c, 'POST', '/api/auth/2fa/enable', {});
  assert(enrollment.ok(), `2FA enrollment returned ${enrollment.status()}`);
  const setup = await enrollment.json();
  const provisioning = new URL(setup.provisioning_uri);
  assert(provisioning.protocol === 'otpauth:' && provisioning.searchParams.get('secret'), 'enrollment did not expose its TOTP provisioning secret');
  const secret = provisioning.searchParams.get('secret');
  await api(c, 'POST', contract.logout, {});
  const challenge = await signIn(c); assert(challenge.status() === 202, '2FA login challenge was not required');
  const challenged = await challenge.json();
  assert(challenged.challenge && !JSON.stringify(challenged).includes(secret), 'sign-in challenge exposed TOTP setup data');
  const validCode = totpCode(secret);
  const wrongCode = validCode === '000000' ? '000001' : '000000';
  const wrong = await api(c, 'POST', contract.twoFactor, { challenge: challenged.challenge, code: wrongCode });
  assert([400,401,403].includes(wrong.status()), `wrong TOTP code returned ${wrong.status()}`);
  const valid = await api(c, 'POST', contract.twoFactor, { challenge: challenged.challenge, code: validCode });
  assert(valid.ok(), `current enrolled TOTP code returned ${valid.status()}`);
  assertSessionCookie(valid);
}); }
async function deletion() { await isolated(async c => {
  await makeVerified(c); assert((await signIn(c)).ok(), 'pre-deletion sign-in failed');
  const item = await uploadGarment(c, { signedIn: true });
  const response = await api(c, 'DELETE', contract.account, {});
  assert(response.ok(), `confirmed account deletion returned ${response.status()}`);
  assert(!(await api(c, 'GET', '/api/auth/session')).ok(), 'account deletion left the active session valid');
  assert([401,403].includes((await api(c, 'GET', contract.export)).status()), 'deleted account data remained available to the deleted session');
  assert([401,403].includes((await api(c, 'GET', `${contract.wardrobe}/${item.id}`)).status()), 'deleted account garment remained available');
  assert([401,403].includes((await signIn(c)).status()), 'deleted account signed in again');
}); }
async function dataExport() { await isolated(async c => {
  const item = await uploadGarment(c);
  const correction = await api(c, 'PATCH', `${contract.wardrobe}/${item.id}`, { corrections: { color: 'cream' } });
  assert(correction.ok(), 'export fixture correction failed');
  const r = await api(c, 'GET', contract.export); assert(r.ok(), 'export failed');
  const body = await r.json();
  assert(body.email === accounts.valid.email && Array.isArray(body.wardrobe), 'export omitted user-owned data');
  const entry = body.wardrobe.find(value => value.id === item.id);
  assert(entry, 'export omitted the user wardrobe item');
  assert(entry.color === 'cream' || entry.corrections?.color === 'cream', 'export omitted the saved wearer correction');
  assert(entry.photo || entry.image || entry.photo_data || entry.image_data, 'export omitted the stored garment photo');
  assert(entry.provenance?.image && entry.provenance?.interpretation, 'export omitted garment provenance');
  assert(entry.interpretation?.confidence !== undefined && entry.interpretation?.model_version, 'export omitted classifier confidence or model version');
}); }
async function wrongOrigin() { await isolated(async c => {
  const register = await api(c, 'POST', contract.register, accounts.valid, { origin: 'https://attacker.invalid' });
  assert([400,403].includes(register.status()), `wrong-origin registration returned ${register.status()}`);
  await makeVerified(c); assert((await signIn(c)).ok(), 'valid sign-in failed');
  for (const [label, response] of [
    ['sign-in', await signIn(c, accounts.valid, { origin: 'https://attacker.invalid' })],
    ['password reset', await api(c, 'POST', contract.forgot, { email: accounts.valid.email }, { origin: 'https://attacker.invalid' })],
    ['sign-out', await api(c, 'POST', contract.logout, {}, { origin: 'https://attacker.invalid' })],
  ]) assert([400,403].includes(response.status()), `wrong-origin ${label} returned ${response.status()}`);
  assert((await api(c, 'GET', '/api/auth/session')).ok(), 'wrong-origin requests changed the existing session');
}); }
async function csrf() { await isolated(async c => {
  await makeVerified(c); assert((await signIn(c)).ok(), 'valid sign-in failed');
  const observer = await playwrightRequest.newContext({ baseURL, storageState: await c.storageState() });
  try {
  const r = await api(c, 'POST', contract.logout, {}, { 'sec-fetch-site': 'cross-site' });
  assert([400,403].includes(r.status()), `cross-site sign-out returned ${r.status()}`);
  assert((await api(observer, 'GET', '/api/auth/session')).ok(), 'cross-site request changed the existing session');
  } finally { await observer.dispose(); }
}); }
async function tenantIsolation() { await isolated(async c => {
  await makeVerified(c); assert((await signIn(c)).ok(), 'user A sign-in failed');
  const item = await uploadGarment(c, { signedIn: true });
  const own = await api(c, 'GET', `${contract.wardrobe}/${item.id}`); assert(own.ok(), 'user A cannot read their garment');
  const b = await freshContext();
  try {
    await makeVerified(b, accounts.other); assert((await signIn(b, accounts.other)).ok(), 'user B sign-in failed');
    const endpoint = `${contract.wardrobe}/${item.id}`;
    const read = await api(b, 'GET', endpoint);
    assert([403,404].includes(read.status()), `user B read user A garment with ${read.status()}`);
    const update = await api(b, 'PATCH', endpoint, { corrections: { color: 'stolen' } });
    assert([403,404].includes(update.status()), `user B changed user A garment with ${update.status()}`);
    const remove = await api(b, 'DELETE', endpoint, {});
    assert([403,404].includes(remove.status()), `user B deleted user A garment with ${remove.status()}`);
    const stillOwned = await api(c, 'GET', endpoint);
    assert(stillOwned.ok(), 'user B operation removed user A garment');
    assert(JSON.stringify(await stillOwned.json()) === JSON.stringify(await own.json()), 'user B operation changed user A garment facts');
  }
  finally { await b.dispose(); }
}); }
async function uploadGarment(ctx, { signedIn = false } = {}) {
  if (!signedIn) { await makeVerified(ctx); assert((await signIn(ctx)).ok(), 'garment owner sign-in failed'); }
  const photo = await readFile(path.join(root, 'fixtures/garment-photo.jpg'));
  const response = await ctx.post(contract.wardrobe, { headers: { origin: baseURL }, multipart: { photo: { name: 'garment-photo.jpg', mimeType: 'image/jpeg', buffer: photo }, ownership: 'unknown', photo_consent: 'true' } });
  assert(response.ok(), `garment upload returned ${response.status()}`);
  return response.json();
}
async function garmentInterpretation() { await isolated(async c => {
  const item = await uploadGarment(c);
  assert(item.interpretation?.category === 'shirt', 'vision interpretation did not identify a garment category');
  assert(item.interpretation?.color, 'vision interpretation omitted color');
  assert(item.interpretation?.provenance?.source === 'vision', 'interpretation provenance is missing');
  assert(item.interpretation?.model_version, 'classifier model version is missing');
  assert(Number.isFinite(item.interpretation?.confidence) && item.interpretation.confidence >= 0 && item.interpretation.confidence <= 1, 'classifier confidence is not a bounded probability');
  assert(item.ownership === 'unknown', 'uploaded garment was assumed to be owned');
}); }
async function photoConsent() { await isolated(async c => {
  await makeVerified(c); assert((await signIn(c)).ok(), 'photo owner sign-in failed');
  const context = await browser.newContext({ storageState: await c.storageState() });
  const page = await context.newPage(); activePage = page;
  const requests = [];
  page.on('request', request => requests.push(request));
  try {
    await page.goto(`${baseURL}/wardrobe`, { waitUntil: 'domcontentloaded' });
    const consent = page.getByLabel(/photo permission|photo consent|process.*device/i);
    const input = page.getByLabel(/garment photo|photo/i).first();
    const save = page.getByRole('button', { name: /save garment/i });
    const review = page.getByRole('button', { name: /review photo on this device/i });
    assert(await consent.isVisible(), 'photo consent is not requested in the browser');
    assert(!(await consent.isChecked()), 'photo processing consent was preselected');
    assert(await review.isDisabled(), 'photo review was enabled before consent');
    const corrupt = Buffer.from([0,1,2,3,4]);
    await input.setInputFiles({ name: 'damaged.jpg', mimeType: 'image/jpeg', buffer: corrupt });
    assert(await review.isDisabled(), 'photo review was enabled after choosing a photo but before consent');
    assert(!requests.some(request => new URL(request.url()).pathname === '/api/vision/classify'), 'photo was processed before consent');
    await consent.check();
    await review.click();
    await page.getByRole('status').getByText('This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.').waitFor();
    assert(await save.isDisabled(), 'save remained enabled for an undecodable photo');
    assert(!requests.some(request => new URL(request.url()).pathname === '/api/vision/classify'), 'corrupt image reached the classifier');
    await input.setInputFiles({ name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await review.click();
    assert(await save.isDisabled(), 'save remained enabled for an unsupported photo type');
    assert(!requests.some(request => new URL(request.url()).pathname === '/api/vision/classify'), 'unsupported image reached the classifier');
    await input.setInputFiles({ name: 'garment-photo.jpg', mimeType: 'image/jpeg', buffer: await readFile(path.join(root, 'fixtures/garment-photo.jpg')) });
    const classification = page.waitForRequest(request => new URL(request.url()).pathname === '/api/vision/classify', { timeout: 10000 });
    await review.click();
    const request = await classification;
    await page.getByRole('status').getByText(/photo reviewed/i).waitFor();
    assert(['localhost','127.0.0.1','::1'].includes(new URL(request.url()).hostname), 'garment photo was sent outside the local device');
    assert(await save.isEnabled(), `valid consented garment photo could not be saved: ${(await page.getByRole('status').innerText()).trim()}`);
    const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/wardrobe/items', { timeout: 10000 });
    await save.click();
    const uploadResponse = await uploaded;
    assert(uploadResponse.ok(), `local garment save returned ${uploadResponse.status()}`);
    if (usingStub) {
      const saved = await uploadResponse.json();
      const stored = await fetch(`${baseURL}/__photo-size?id=${encodeURIComponent(saved.id)}`).then(response => response.json());
      assert(stored.bytes < (await readFile(path.join(root, 'fixtures/garment-photo.jpg'))).byteLength, 'stored photo was not resized before local save');
    } else {
      const storedPhoto = jpegFromMultipart(uploadResponse.request().postDataBuffer());
      const dimensions = await page.evaluate(async encoded => {
        const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        return { width: image.width, height: image.height };
      }, storedPhoto.toString('base64'));
      assert(dimensions.width < 900 || dimensions.height < 1200, `stored photo was not resized before local save: ${dimensions.width}x${dimensions.height}`);
    }
  } finally { await context.close(); }
}); }
async function correctionPersists() { await isolated(async c => {
  const item = await uploadGarment(c);
  const update = await api(c, 'PATCH', `${contract.wardrobe}/${item.id}`, { corrections: { color: 'cream' } });
  assert(update.ok(), 'garment correction was refused');
  const read = await api(c, 'GET', `${contract.wardrobe}/${item.id}`); assert(read.ok(), 'corrected garment could not be read');
  const saved = await read.json(); assert(saved.color === 'cream', 'user correction did not persist');
  const correction = saved.correction || saved.provenance?.correction;
  assert(correction?.source === 'wearer-correction', 'saved correction lost its wearer-correction source');
  assert(correction?.model_version === null && correction?.confidence === 1, 'saved correction has incorrect model provenance or confidence');
}); }
async function wardrobeProvenance() { await isolated(async c => {
  const item = await uploadGarment(c);
  const read = await api(c, 'GET', `${contract.wardrobe}/${item.id}`); assert(read.ok(), 'wardrobe item missing');
  const saved = await read.json();
  assert(saved.ownership === 'unknown', `ownership was guessed as ${saved.ownership}`);
  assert(saved.provenance?.image === 'user-upload' && saved.provenance?.interpretation === 'vision', 'wardrobe source provenance was lost');
}); }
async function requestOutfit(ctx, message) {
  return api(ctx, 'POST', contract.outfits, { request: message });
}
function assertCompleteOutfit(outfit, facts = dinnerFacts) {
  const items = outfit.items || [];
  const categories = new Set(items.map(item => item.category));
  assert(['top','bottom','footwear'].every(category => categories.has(category)), 'outfit omitted top, bottom, or footwear');
  for (const item of items) {
    assert(item.ownership === 'owned', `outfit included a garment with ownership ${item.ownership}`);
    assert(item.available === true, `outfit included unavailable garment ${item.id}`);
    assert(item.fits === true, `outfit included garment without a supported fit ${item.id}`);
    assert(item.weather_compatible === true, `outfit violated known weather for ${item.id}`);
    assert(item.dress_code_compatible === true, `outfit violated known dress code for ${item.id}`);
    assert(item.weather === facts.weather && item.dress_code === facts.dress_code, `outfit omitted the applied weather or dress-code facts for ${item.id}`);
  }
}
async function completeOutfit() { await isolated(async c => {
  const garment = await uploadGarment(c);
  await api(c, 'PATCH', `${contract.wardrobe}/${garment.id}`, { ownership: 'owned', available: true, fits: true });
  const response = await requestOutfit(c, dinnerFacts);
  assert(response.ok(), `outfit request returned ${response.status()}`);
  const result = await response.json();
  assert(Array.isArray(result.outfits) && result.outfits.length > 0, 'no outfit options returned');
  for (const outfit of result.outfits) assertCompleteOutfit(outfit);
  assert(result.outfits.every(x => x.explanation?.trim()), 'outfits lack a decision explanation');
}); }
async function wardrobeReuse() { await isolated(async c => {
  const garment = await uploadGarment(c);
  await api(c, 'PATCH', `${contract.wardrobe}/${garment.id}`, { ownership: 'owned', available: true, fits: true });
  const response = await requestOutfit(c, dinnerFacts); assert(response.ok(), 'outfit request failed');
  const result = await response.json();
  assert(result.outfits.length > 0, 'owned wardrobe did not produce an outfit');
  for (const outfit of result.outfits) assertCompleteOutfit(outfit);
  assert(result.wardrobe_reuse === true, 'wardrobe reuse was not surfaced');
}); }
async function noCompleteOutfit() { await isolated(async c => {
  const garment = await uploadGarment(c);
  await api(c, 'PATCH', `${contract.wardrobe}/${garment.id}`, { ownership: 'owned', available: false, fits: false });
  const response = await requestOutfit(c, dinnerFacts);
  assert(response.ok(), `no-complete-outfit request returned ${response.status()}`);
  const result = await response.json();
  assert(['no_complete_outfit','abstained'].includes(result.status), `impossible constraints returned status ${result.status}`);
  assert(Array.isArray(result.outfits) && result.outfits.length === 0, 'impossible constraints returned a partial outfit');
}); }
async function lowConfidence() { await isolated(async c => {
  await uploadGarment(c);
  const response = await requestOutfit(c, { occasion: 'ceremony', weather: null, dress_code: null });
  assert(response.ok(), `low-confidence request returned ${response.status()}`);
  const result = await response.json();
  assert(result.status === 'needs_clarification' || result.status === 'abstained', 'low-confidence response pretended to know enough');
  assert(result.question?.trim() || result.status === 'abstained', 'low-confidence recovery did not ask a useful question or abstain');
}); }
async function browserSmoke() {
  const page = await newBrowserPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  assert((await page.title()).trim().length > 0, 'page title is empty');
  assert(await page.locator('main').isVisible(), 'main product content is not visible');
  assert((await page.locator('body').innerText()).trim().length > 20, 'product landing has no useful content');
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  await page.close();
}
async function readRequirementStatus(file = requirementsFile) {
  const statuses = new Map();
  let inAcceptanceA1 = false;
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    if (line.trim() === '## Acceptance A-1') { inAcceptanceA1 = true; continue; }
    if (inAcceptanceA1 && line.startsWith('## ')) inAcceptanceA1 = false;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (/^R\d+$/.test(cells[0] || '')) {
    const [id, status, treatment] = cells;
    assert(status && treatment, `${id} has an empty status or treatment in docs/requirements.md`);
      assert(['slice1-pending','slice1-ready','next','later','deferred-with-reason'].includes(status), `${id} has an unknown status ${status} in docs/requirements.md`);
      assert(!statuses.has(id), `${id} appears more than once in docs/requirements.md`);
      statuses.set(id, { status, treatment });
    } else if (inAcceptanceA1 && cells[0] && cells[0] !== 'Area' && !cells[0].startsWith('---')) {
      const key = `A-1:${slug(cells[0])}`;
      const [, status, treatment] = cells;
      assert(status && treatment, `${cells[0]} has an empty A-1 status or evidence boundary in docs/requirements.md`);
      assert(['slice1-pending','slice1-ready','next','later','deferred-with-reason'].includes(status), `${cells[0]} has an unknown A-1 status ${status}`);
      assert(!statuses.has(key), `${cells[0]} appears more than once under Acceptance A-1`);
      statuses.set(key, { status, treatment });
    }
  }
  for (let number = 1; number <= 37; number++) assert(statuses.has(`R${number}`), `R${number} has no status in docs/requirements.md`);
  for (const [name, , ids] of cases) {
    for (const id of ids.filter(value => value.startsWith('A-1:') || /^R\d+$/.test(value))) assert(statuses.has(id), `${name} cites ${id}, which has no status in docs/requirements.md`);
  }
  for (const [name, , , acceptanceIds = []] of cases) {
    for (const id of acceptanceIds.filter(value => value.startsWith('A-1:'))) assert(statuses.has(id), `${name} cites ${id}, which has no status in docs/requirements.md`);
  }
  assert([...statuses.keys()].some(id => id.startsWith('A-1:')), 'Acceptance A-1 has no status rows in docs/requirements.md');
  return statuses;
}
async function readAcceptanceMatrix(file = acceptanceFile) {
  const statuses = new Map();
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (!/^A\d{2}$/.test(cells[0] || '')) continue;
    const [id, , , result] = cells;
    assert(result, `${id} has no result in docs/slice-1-acceptance.md`);
    assert(['Pending','Ready','Failed'].includes(result), `${id} has unknown result ${result} in docs/slice-1-acceptance.md`);
    assert(!statuses.has(id), `${id} appears more than once in docs/slice-1-acceptance.md`);
    statuses.set(id, result);
  }
  for (let number = 1; number <= 18; number++) {
    const id = `A${String(number).padStart(2, '0')}`;
    assert(statuses.has(id), `${id} has no result in docs/slice-1-acceptance.md`);
  }
  for (const [name, , , acceptanceIds = []] of cases) {
    for (const id of acceptanceIds.filter(value => /^A\d{2}$/.test(value))) {
      assert(statuses.has(id), `${name} cites ${id}, which has no result in docs/slice-1-acceptance.md`);
    }
  }
  return statuses;
}
async function browserAccountJourney() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(10000);
  activePage = page;
  let registrationResult;
  page.on('response', async response => {
    if (response.url().endsWith(contract.register)) registrationResult = `${response.status()} ${await response.text().catch(() => '')}`;
  });
  await page.goto(`${baseURL}/sign-up`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).fill(accounts.valid.email);
  await page.getByLabel(/password/i).fill(accounts.valid.password);
  await page.getByLabel(/confirm.*age|age confirmation/i).check();
  await page.getByRole('button', { name: /create account|sign up/i }).click();
  await page.waitForTimeout(100);
  const signupStatus = await page.getByRole('status').innerText();
  assert(/check your email|verification/i.test(signupStatus), `sign-up response was: ${signupStatus}; API: ${registrationResult}`);
  const verify = await mailLink(accounts.valid.email);
  await page.goto(verify.href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').getByText(/verified|email confirmed/i).waitFor({ timeout: 5000 });
  await page.goto(`${baseURL}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).fill(accounts.valid.email);
  await page.getByLabel(/password/i).fill(accounts.valid.password);
  await page.getByRole('button', { name: /sign in|continue/i }).click();
  await page.getByRole('status').getByText(/signed in|welcome/i).waitFor({ timeout: 5000 });
  await page.goto(`${baseURL}/wardrobe`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').getByText(/wardrobe/i).waitFor({ timeout: 5000 });
  await page.reload();
  await page.getByRole('status').getByText(/wardrobe/i).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.getByRole('status').getByText(/signed out/i).waitFor({ timeout: 5000 });
  await context.close();
}
async function responsive() {
  const page = await newBrowserPage();
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert(dimensions.document <= dimensions.viewport, `horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
  }
  await page.close();
}
async function keyboard() {
  const page = await newBrowserPage(); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const primary = page.getByRole('link', { name: /get started|sign up|create account|start now/i }).or(page.getByRole('button', { name: /get started|sign up|create account|start now/i })).first();
  assert(await primary.isVisible(), 'the primary account action is missing or not visible');
  for (let tab = 0; tab < 20; tab++) {
    await page.keyboard.press('Tab');
    if (await primary.evaluate((element) => element === document.activeElement)) { await page.close(); return; }
  }
  await page.close();
  throw new Error('keyboard navigation did not reach the primary account action');
}
async function accessibility() {
  const page = await newBrowserPage({ bypassCSP: true }); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
  assert(result.violations.length === 0, `accessibility violations: ${result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(',')).join('; ')}`).join(' | ')}`);
  await page.close();
}
async function landingTimingMeasurement() {
  const page = await newBrowserPage(); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const elapsed = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd);
  await page.close();
  return Number.isFinite(elapsed) ? elapsed : null;
}
async function browserConsole() {
  const page = await newBrowserPage(); const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const text = errors.join('\n');
  assert(errors.length === 0, `console errors: ${text}`);
  assert(!text.includes(accounts.valid.email) && !text.includes(accounts.valid.password), 'test credentials appeared in browser console');
  await page.close();
}
async function logPrivacy() {
  await isolated(async c => {
    await makeVerified(c);
    assert((await signIn(c)).ok(), 'log privacy probe sign-in failed');
    await delay(50);
    for (const value of sensitiveValues) assert(!serverOutput.includes(value), 'service logs contain a test email, password, or issued link token');
    assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serverOutput), 'service logs contain an email address');
  });
}
async function securityHeaders() {
  const response = await fetch(baseURL, { redirect: 'manual' });
  assert(response.ok, `production landing response returned ${response.status}`);
  const headers = response.headers;
  assert(headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', 'X-Content-Type-Options nosniff is missing');
  assert(headers.has('content-security-policy'), 'Content-Security-Policy is missing');
  assert(headers.has('referrer-policy'), 'Referrer-Policy is missing');
  assert(headers.has('permissions-policy'), 'Permissions-Policy is missing');
}
async function performanceBudget() {
  const page = await newBrowserPage();
  const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `landing page returned ${response?.status()}`);
  const elapsed = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd);
  measurements.landing_dom_content_loaded_ms = elapsed;
  assert(Number.isFinite(elapsed) && elapsed <= 2500, `landing document exceeded the 2500ms load budget: ${elapsed}ms`);
  await page.close();
}
async function offlineRecovery() {
  const page = await newBrowserPage();
  await page.route('**/api/wardrobe', route => route.abort('internetdisconnected'));
  await page.goto(`${baseURL}/wardrobe`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').getByText(/offline|connection problem|try again/i).waitFor({ timeout: 3000 });
  assert(await page.getByRole('button', { name: /try again/i }).isVisible(), 'offline state has no retry action');
  await page.close();
}
async function serverDownRecovery() {
  const page = await newBrowserPage();
  await page.route('**/api/auth/login', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"SQLite database error: internal diagnostic detail"}' }));
  await page.goto(`${baseURL}/sign-in`, { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/email/i);
  const password = page.getByLabel(/password/i);
  await email.fill(accounts.valid.email);
  await password.fill(accounts.valid.password);
  await page.getByRole('button', { name: /sign in|continue/i }).click();
  await page.getByRole('status').getByText(/temporarily unavailable|service is unavailable|try again|connection problem/i).waitFor({ timeout: 3000 });
  assert(await email.inputValue() === accounts.valid.email, 'service-down response cleared the typed email');
  assert(await password.inputValue() === accounts.valid.password, 'service-down response cleared the typed password');
  const state = await page.getByRole('status').innerText();
  assert(!/sqlite|database|internal|diagnostic|stack|trace/i.test(state), `service-down state exposed server details: ${state}`);
  await page.close();
}
async function newBrowserPage(options = {}) {
  const page = await browser.newPage(options);
  page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(10000);
  return page;
}
