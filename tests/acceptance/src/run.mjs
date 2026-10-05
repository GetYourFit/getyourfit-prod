import { chromium, request as playwrightRequest } from 'playwright';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import axe from 'axe-core';
import { contract, accounts } from './contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const output = path.join(root, 'results');
const screenshotDir = path.join(output, 'screenshots');
const baseURL = process.env.ACCEPTANCE_BASE_URL || 'http://127.0.0.1:4179';
const usingStub = !process.env.ACCEPTANCE_BASE_URL;
const runId = randomUUID().slice(0, 8);
let caseIndex = 0;
let stub;

await rm(output, { recursive: true, force: true });
await mkdir(screenshotDir, { recursive: true });

if (usingStub) {
  stub = spawn(process.execPath, [path.join(here, 'stub-server.mjs')], {
    env: { ...process.env, PORT: '4179' }, stdio: 'ignore',
  });
}

const started = Date.now();
let browser;
const results = [];
const fails = [];
let activePage;
const cases = [
  ['R26 sign up creates account and verification mail', register],
  ['R26 browser account journey signs up verifies signs in refreshes and signs out', () => isolated(browserAccountJourney)],
  ['R26 email verification activates account', verify],
  ['R26 sign in establishes session', login],
  ['R26 session survives a fresh browser context', sessionRefresh],
  ['R26 sign out clears session', logout],
  ['R26 wrong password is refused', wrongPassword],
  ['R26 unknown email does not reveal account existence', unknownEmail],
  ['R26 unverified account cannot sign in', unverified],
  ['R26 expired verification link is refused', expiredLink],
  ['R26 verification link cannot be reused', reusedLink],
  ['R26 password reset works and reset link cannot be reused', passwordReset],
  ['R26 weak password is rejected', weakPassword],
  ['R26 duplicate email is refused without account takeover', duplicateEmail],
  ['R26 age confirmation is required without collecting birth date', ageConfirmation],
  ['R26 repeated failed passwords trigger lockout', lockout],
  ['R26 sign out everywhere revokes other sessions', logoutEverywhere],
  ['R26 second factor accepts correct code and rejects wrong code', secondFactor],
  ['R26 deleting account prevents later sign in', deletion],
  ['R26 account data export returns an owned archive', dataExport],
  ['R27 cross-origin mutation is refused', wrongOrigin],
  ['R27 state-changing request without CSRF protection is refused', csrf],
  ['R27 separate accounts cannot read each other data', tenantIsolation],
  ['R7 garment photo is interpreted without claiming ownership', garmentInterpretation],
  ['R7 user correction persists and changes wardrobe state', correctionPersists],
  ['R9 wardrobe ownership and provenance are explicit', wardrobeProvenance],
  ['R5 natural-language request returns complete outfits', completeOutfit],
  ['R9 outfit recommendation reuses owned garments', wardrobeReuse],
  ['R19 low-confidence request asks or abstains', lowConfidence],
  ['A-1 offline wardrobe state offers recovery', offlineRecovery],
  ['A-1 server-down wardrobe state offers retry', serverDownRecovery],
  ['A-1 responsive layout fits narrow and wide screens', responsive],
  ['A-1 keyboard can reach the primary action', keyboard],
  ['A-1 page passes automated WCAG accessibility checks', accessibility],
  ['R27 baseline security headers are present', securityHeaders],
  ['A-1 landing page loads within the performance budget', performanceBudget],
  ['A-1 browser has no console errors or exposed test credentials', browserConsole],
  ['A-1 app is reachable in a real browser', browserSmoke],
];

try {
  await waitForServer(baseURL);
  browser = await chromium.launch({ headless: true });
  for (const [name, check] of cases) {
    const item = { name, status: 'passed', duration_ms: 0 };
    const t = Date.now();
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
} catch (error) {
  fails.push('runner setup');
  results.push({ name: 'runner setup', status: 'failed', error: String(error?.stack || error) });
} finally {
  await browser?.close();
  if (stub) {
    const stopped = new Promise(resolve => stub.once('exit', resolve));
    stub.kill('SIGTERM');
    const closed = await Promise.race([stopped.then(() => true), delay(1000).then(() => false)]);
    if (!closed) { stub.kill('SIGKILL'); await stopped; }
  }
}

const report = {
  schema: 'gyf-acceptance-report/v1',
  base_url: baseURL,
  source: usingStub ? 'contract-stub' : 'configured-app',
  started_at: new Date(started).toISOString(),
  duration_ms: Date.now() - started,
  summary: { total: results.length, passed: results.filter(x => x.status === 'passed').length, failed: fails.length },
  cases: results,
};
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
if (fails.length) process.exitCode = 1;

async function freshContext() {
  const context = await playwrightRequest.newContext({ baseURL });
  return context;
}
async function api(ctx, method, endpoint, body, headers = {}) {
  return ctx.fetch(endpoint, { method, data: body, headers });
}
async function create(ctx, user = accounts.valid) {
  const response = await api(ctx, 'POST', contract.register, user);
  assert([200, 201, 202].includes(response.status()), `register returned ${response.status()}`);
  return response;
}
async function verifyAccount(ctx, email = accounts.valid.email, token = 'verify-valid') {
  return api(ctx, 'POST', contract.verify, { email, token });
}
async function makeVerified(ctx, user = accounts.valid) {
  await create(ctx, user);
  const token = usingStub ? 'verify-valid' : await mailToken(user.email);
  const response = await verifyAccount(ctx, user.email, token);
  assert(response.ok(), `verify returned ${response.status()}`);
  return token;
}
async function signIn(ctx, user = accounts.valid) {
  return api(ctx, 'POST', contract.login, user);
}
async function isolated(fn) {
  const ctx = await freshContext();
  caseIndex++;
  accounts.valid.email = `acceptance-${runId}-${caseIndex}@example.test`;
  accounts.other.email = `acceptance-${runId}-${caseIndex}-other@example.test`;
  accounts.weak.email = `acceptance-${runId}-${caseIndex}-weak@example.test`;
  try { if (usingStub) await api(ctx, 'POST', '/__reset', {}); await fn(ctx); } finally { await ctx.dispose(); }
}
function assert(value, message) { if (!value) throw new Error(message); }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
async function waitForServer(url) {
  const until = Date.now() + 15000;
  let last;
  while (Date.now() < until) {
    try { const res = await fetch(url); if (res.status < 500) return; }
    catch (e) { last = e; }
    await delay(150);
  }
  throw new Error(`server did not start at ${url}: ${last}`);
}
async function mailLink(email) {
  if (usingStub) return new URL(`/verify?email=${encodeURIComponent(email)}&token=verify-valid`, baseURL);
  const mailbox = process.env.ACCEPTANCE_MAIL_CATCHER_URL;
  assert(mailbox, 'ACCEPTANCE_MAIL_CATCHER_URL is required for real email verification and password reset');
  const searchURL = new URL('/api/v1/search', mailbox);
  searchURL.searchParams.set('query', `to:${email}`);
  searchURL.searchParams.set('limit', '10');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const search = await fetch(searchURL);
    assert(search.ok, `mail catcher search returned ${search.status}`);
    const result = await search.json();
    const messages = result.Messages || result.messages || [];
    if (messages.length) {
      const message = messages[0];
      const id = message.ID || message.id;
      assert(id, 'mail catcher message omitted its id');
      const bodyResponse = await fetch(new URL(`/view/${encodeURIComponent(id)}.txt`, mailbox));
      assert(bodyResponse.ok, `mail catcher message body returned ${bodyResponse.status}`);
      const body = (await bodyResponse.text()).replaceAll('&amp;', '&');
      const links = body.match(/https?:\/\/[^\s<>"']+/g) || [];
      for (const link of links) {
        try {
          const url = new URL(link.replace(/[),.;]+$/, ''));
          if (url.searchParams.has('token')) return url;
        } catch {}
      }
      throw new Error(`message sent to ${email} did not contain a token link`);
    }
    await delay(150);
  }
  throw new Error(`no message arrived for ${email} in the local mail catcher`);
}
async function mailToken(email) {
  const token = (await mailLink(email)).searchParams.get('token');
  assert(token, `message sent to ${email} did not contain a token`);
  return token;
}

async function register() { await isolated(async c => {
  await create(c);
  const res = await signIn(c);
  assert(res.status() === 401 || res.status() === 403 || res.status() === 202, `unverified login returned ${res.status()}`);
}); }
async function verify() { await isolated(async c => {
  await create(c); const token = usingStub ? 'verify-valid' : await mailToken(accounts.valid.email); const res = await verifyAccount(c, accounts.valid.email, token);
  assert(res.ok(), `verify returned ${res.status()}`);
  assert((await signIn(c)).ok(), 'verified account could not sign in');
}); }
async function login() { await isolated(async c => { await makeVerified(c); assert((await signIn(c)).ok(), 'valid sign-in refused'); }); }
async function sessionRefresh() { await isolated(async c => {
  await makeVerified(c); const loginRes = await signIn(c); assert(loginRes.ok(), 'sign-in failed');
  const state = await loginRes.json(); assert(state.session_token, 'login response omitted session_token');
  const fresh = await freshContext();
  try { const res = await api(fresh, 'GET', '/api/auth/session', undefined, { authorization: `Bearer ${state.session_token}` }); assert(res.ok(), 'refreshed session invalid'); }
  finally { await fresh.dispose(); }
}); }
async function logout() { await isolated(async c => {
  await makeVerified(c); const loginRes = await signIn(c); assert(loginRes.ok(), 'sign-in failed');
  const token = (await loginRes.json()).session_token;
  assert((await api(c, 'POST', contract.logout, {})).ok(), 'logout failed');
  assert(!(await api(c, 'GET', '/api/auth/session', undefined, { authorization: `Bearer ${token}` })).ok(), 'session survived logout');
}); }
async function wrongPassword() { await isolated(async c => { await makeVerified(c); const res = await signIn(c, { ...accounts.valid, password: 'incorrect' }); assert(!res.ok(), 'wrong password accepted'); }); }
async function unknownEmail() { await isolated(async c => {
  await makeVerified(c);
  const knownLogin = await signIn(c, { ...accounts.valid, password: 'wrong-password' });
  const unknownLogin = await signIn(c, { email: 'nobody@example.test', password: 'wrong-password' });
  assert(knownLogin.status() === unknownLogin.status(), 'sign-in status reveals whether the email exists');
  assert(JSON.stringify(await knownLogin.json()) === JSON.stringify(await unknownLogin.json()), 'sign-in response reveals whether the email exists');
  const a = await api(c, 'POST', contract.forgot, { email: accounts.valid.email });
  const b = await api(c, 'POST', contract.forgot, { email: 'nobody@example.test' });
  assert(a.status() === b.status(), 'password reset status reveals whether account exists');
  assert(JSON.stringify(await a.json()) === JSON.stringify(await b.json()), 'password reset response reveals whether account exists');
}); }
async function unverified() { await isolated(async c => { await create(c); const r = await signIn(c); assert(!r.ok(), 'unverified account signed in'); }); }
async function expiredLink() { await isolated(async c => {
  await create(c); const r = await verifyAccount(c, accounts.valid.email, 'verify-expired'); assert(!r.ok(), 'expired verification token accepted');
  await makeVerified(c, accounts.other); await api(c, 'POST', contract.forgot, { email: accounts.other.email });
  const reset = await api(c, 'POST', contract.reset, { email: accounts.other.email, token: 'reset-expired', password: 'New-Password-72!fine' });
  assert(!reset.ok(), 'expired password reset token accepted');
}); }
async function reusedLink() { await isolated(async c => {
  await create(c); const token = usingStub ? 'verify-valid' : await mailToken(accounts.valid.email);
  assert((await verifyAccount(c, accounts.valid.email, token)).ok(), 'first verify failed');
  const r = await verifyAccount(c, accounts.valid.email, token); assert(!r.ok(), 'verification token reused');
}); }
async function passwordReset() { await isolated(async c => {
  await makeVerified(c); const r = await api(c, 'POST', contract.forgot, { email: accounts.valid.email }); assert(r.ok(), 'reset request failed');
  const token = usingStub ? 'reset-valid' : await mailToken(accounts.valid.email);
  const reset = await api(c, 'POST', contract.reset, { email: accounts.valid.email, token, password: 'New-Password-72!fine' }); assert(reset.ok(), 'reset failed');
  assert((await signIn(c, { email: accounts.valid.email, password: 'New-Password-72!fine' })).ok(), 'new password rejected');
  assert(!(await api(c, 'POST', contract.reset, { email: accounts.valid.email, token, password: 'Another-Password-72!fine' })).ok(), 'reset token reused');
}); }
async function weakPassword() { await isolated(async c => { const r = await api(c, 'POST', contract.register, accounts.weak); assert(!r.ok(), 'weak password accepted'); }); }
async function duplicateEmail() { await isolated(async c => { await create(c); const r = await api(c, 'POST', contract.register, accounts.valid); assert(!r.ok(), 'duplicate email accepted'); }); }
async function ageConfirmation() { await isolated(async c => {
  const res = await api(c, 'POST', contract.register, { ...accounts.valid, age_confirmed: false });
  assert(!res.ok(), 'registration succeeded without age confirmation');
}); }
async function lockout() { await isolated(async c => { await makeVerified(c); for (let i=0;i<8;i++) await signIn(c, { ...accounts.valid, password: 'wrong-password' }); const r = await signIn(c); assert(!r.ok(), 'account not locked after repeated failures'); }); }
async function logoutEverywhere() { await isolated(async c => {
  await makeVerified(c); const one = await signIn(c); const token1 = (await one.json()).session_token;
  const other = await freshContext();
  try {
    const two = await signIn(other); const token2 = (await two.json()).session_token;
    await api(c, 'POST', contract.logoutEverywhere, {});
    for (const token of [token1, token2]) { const r = await api(other, 'GET', '/api/auth/session', undefined, { authorization: `Bearer ${token}` }); assert(!r.ok(), 'a session survived global sign-out'); }
  } finally { await other.dispose(); }
}); }
async function secondFactor() { await isolated(async c => {
  await makeVerified(c); const initial = await signIn(c); assert(initial.ok(), 'initial sign-in failed');
  await api(c, 'POST', '/api/auth/2fa/enable', {});
  await api(c, 'POST', contract.logout, {});
  const challenge = await signIn(c); assert(challenge.status() === 202, '2FA login challenge was not required');
  const id = (await challenge.json()).challenge;
  assert((await api(c, 'POST', contract.twoFactor, { challenge: id, code: '123456' })).ok(), 'valid 2FA code rejected');
  const wrong = await api(c, 'POST', contract.twoFactor, { challenge: id, code: '000000' }); assert(!wrong.ok(), 'wrong 2FA code accepted');
}); }
async function deletion() { await isolated(async c => { await makeVerified(c); await signIn(c); const r = await api(c, 'DELETE', contract.account, {}); assert(r.ok(), 'account deletion failed'); assert(!(await signIn(c)).ok(), 'deleted account signed in'); }); }
async function dataExport() { await isolated(async c => { const item = await uploadGarment(c); const r = await api(c, 'GET', contract.export); assert(r.ok(), 'export failed'); const body = await r.json(); assert(body.email === accounts.valid.email && Array.isArray(body.wardrobe), 'export omitted user-owned data'); assert(body.wardrobe.some(entry => entry.id === item.id), 'export omitted the user wardrobe item'); }); }
async function wrongOrigin() { await isolated(async c => { const r = await api(c, 'POST', contract.register, accounts.valid, { origin: 'https://attacker.invalid' }); assert([401, 403].includes(r.status()), `wrong-origin request returned ${r.status()}`); }); }
async function csrf() { await isolated(async c => { const r = await api(c, 'POST', contract.register, accounts.valid, { origin: baseURL, 'sec-fetch-site': 'cross-site' }); assert([401, 403].includes(r.status()), `cross-site mutation returned ${r.status()}`); }); }
async function tenantIsolation() { await isolated(async c => {
  await makeVerified(c); await signIn(c); const r = await api(c, 'GET', '/api/wardrobe'); assert(r.ok(), 'user A wardrobe unavailable');
  const b = await freshContext();
  try { await makeVerified(b, accounts.other); await signIn(b, accounts.other); const other = await api(b, 'GET', `/api/users/${encodeURIComponent(accounts.valid.email)}/wardrobe`); assert([403,404].includes(other.status()), 'user B read user A data'); }
  finally { await b.dispose(); }
}); }
async function uploadGarment(ctx) {
  await makeVerified(ctx); await signIn(ctx);
  const photo = await readFile(path.join(root, 'fixtures/garment-photo.jpg'));
  const response = await ctx.post(contract.wardrobe, { multipart: { photo: { name: 'garment-photo.jpg', mimeType: 'image/jpeg', buffer: photo }, ownership: 'unknown' } });
  assert(response.ok(), `garment upload returned ${response.status()}`);
  return response.json();
}
async function garmentInterpretation() { await isolated(async c => {
  const item = await uploadGarment(c);
  assert(item.interpretation?.category === 'shirt', 'vision interpretation did not identify a garment category');
  assert(item.interpretation?.color, 'vision interpretation omitted color');
  assert(item.interpretation?.provenance?.source === 'vision', 'interpretation provenance is missing');
  assert(item.ownership === 'unknown', 'uploaded garment was assumed to be owned');
}); }
async function correctionPersists() { await isolated(async c => {
  const item = await uploadGarment(c);
  const update = await api(c, 'PATCH', `${contract.wardrobe}/${item.id}`, { corrections: { color: 'cream' } });
  assert(update.ok(), 'garment correction was refused');
  const read = await api(c, 'GET', `${contract.wardrobe}/${item.id}`); assert(read.ok(), 'corrected garment could not be read');
  const saved = await read.json(); assert(saved.color === 'cream', 'user correction did not persist');
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
function hasCompleteOutfit(outfit) {
  const categories = new Set((outfit.items || []).map(item => item.category));
  return ['top','bottom','footwear'].every(category => categories.has(category));
}
async function completeOutfit() { await isolated(async c => {
  const garment = await uploadGarment(c);
  await api(c, 'PATCH', `${contract.wardrobe}/${garment.id}`, { ownership: 'owned' });
  const response = await requestOutfit(c, 'Dinner tonight, confident but not overdressed, under 6000 rupees');
  assert(response.ok(), `outfit request returned ${response.status()}`);
  const result = await response.json();
  assert(Array.isArray(result.outfits) && result.outfits.length > 0, 'no outfit options returned');
  assert(result.outfits.every(hasCompleteOutfit), 'an outfit omitted top, bottom, or footwear');
  assert(result.outfits.every(x => x.explanation?.trim()), 'outfits lack a decision explanation');
}); }
async function wardrobeReuse() { await isolated(async c => {
  const garment = await uploadGarment(c);
  await api(c, 'PATCH', `${contract.wardrobe}/${garment.id}`, { ownership: 'owned' });
  const response = await requestOutfit(c, 'Use my wardrobe for a relaxed dinner'); assert(response.ok(), 'outfit request failed');
  const result = await response.json();
  assert(result.outfits.some(o => o.items.some(item => item.ownership === 'owned')), 'recommendation did not reuse any owned garment');
  assert(result.wardrobe_reuse === true, 'wardrobe reuse was not surfaced');
}); }
async function lowConfidence() { await isolated(async c => {
  await uploadGarment(c);
  const response = await requestOutfit(c, 'Style this for an unfamiliar ceremonial event with no details');
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
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert(dimensions.document <= dimensions.viewport, `horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
  }
  await page.close();
}
async function keyboard() {
  const page = await newBrowserPage(); await page.goto(baseURL, { waitUntil: 'domcontentloaded' }); await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement?.tagName === 'A' || document.activeElement?.tagName === 'BUTTON'), 'keyboard focus did not reach an actionable control');
  await page.close();
}
async function accessibility() {
  const page = await newBrowserPage({ bypassCSP: true }); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
  assert(result.violations.length === 0, `accessibility violations: ${result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(',')).join('; ')}`).join(' | ')}`);
  await page.close();
}
async function securityHeaders() { await isolated(async c => {
  const response = await c.get('/'); const headers = response.headers();
  assert(headers['content-security-policy']?.includes('default-src'), 'Content-Security-Policy missing');
  assert(headers['x-content-type-options']?.toLowerCase() === 'nosniff', 'X-Content-Type-Options missing');
  assert(headers['referrer-policy'], 'Referrer-Policy missing');
  assert(headers['x-frame-options'] || headers['content-security-policy']?.includes('frame-ancestors'), 'frame embedding protection missing');
}); }
async function performanceBudget() {
  const page = await newBrowserPage(); await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const elapsed = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd);
  assert(Number.isFinite(elapsed) && elapsed <= Number(process.env.ACCEPTANCE_DOM_CONTENT_BUDGET_MS || 2500), `DOMContentLoaded took ${elapsed}ms`);
  await page.close();
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
  await page.route('**/api/wardrobe', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
  await page.goto(`${baseURL}/wardrobe`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status').getByText(/temporarily unavailable|server problem|try again/i).waitFor({ timeout: 3000 });
  assert(await page.getByRole('button', { name: /try again/i }).isVisible(), 'server-down state has no retry action');
  await page.close();
}
async function newBrowserPage(options = {}) {
  const page = await browser.newPage(options);
  page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(10000);
  return page;
}
