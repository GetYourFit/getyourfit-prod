import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:4174';
const email = 'alice@example.test';
const password = 'LocalTestOnly-2026-EnoughLength!';
const updatedPassword = 'LocalTestOnly-NewPassword-2026!';
const mailboxRunnerToken = randomBytes(32).toString('base64url');
const sessionA = 'gyf-auth-verify-a';
const sessionB = 'gyf-auth-verify-b';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyf-auth-'));
const databasePath = path.join(dataDir, 'getyourfit.sqlite');
let server;
let serverWasStopped = false;
let enabledTotpUri = '';
let serverOutput = '';
let serverOutputRemainder = '';
let serverErrorOutput = '';
let currentStage = 'startup';
const verificationEvents = [];
const verificationMailer = nodemailer.createTransport({ host: '127.0.0.1', port: 1025, secure: false, ignoreTLS: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 45_000,
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function chrome(session, args) {
  if (session === sessionB) process.stdout.write(`session B command: ${args.join(' ')}\n`);
  try {
    return run('chrome-devtools-axi', args, {
      env: { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: session },
    });
  } catch (error) {
    throw new Error(`chrome-devtools-axi ${args.join(' ')} failed during ${currentStage}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function readRefs(session) {
  return chrome(session, ['snapshot']);
}

function findRef(session, role, name) {
  const snapshot = readRefs(session);
  const line = snapshot.split('\n').find((entry) => entry.includes(` ${role} "${name}"`));
  assert.ok(line, `Browser did not show ${role} "${name}".`);
  return line.match(/uid=([^ ]+)/)?.[1];
}

function click(session, role, name) {
  const uid = findRef(session, role, name);
  return chrome(session, ['click', `@${uid}`]);
}

function fill(session, name, value) {
  const uid = findRef(session, 'textbox', name);
  return chrome(session, ['fill', `@${uid}`, value]);
}

async function waitForPage(session, phrase, timeout = 12_000) {
  const until = Date.now() + timeout;
  let last = '';
  while (Date.now() < until) {
    last = readRefs(session);
    if (last.includes(phrase)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Browser did not show "${phrase}". ${last.slice(-500)}`);
}

function evalInBrowser(session, expression) {
  return chrome(session, ['eval', expression]);
}

function evalResult(output) {
  const line = output.split('\n').find((entry) => entry.startsWith('result:'));
  assert.ok(line, 'Browser evaluation returned no result.');
  const parsed = JSON.parse(line.slice('result:'.length).trim());
  return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}

async function api(pathname, body, { method = 'POST', requestOrigin = origin } = {}) {
  try {
    const response = await fetch(`${origin}${pathname}`, {
      method,
      headers: { Origin: requestOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    await response.arrayBuffer();
    return response;
  } catch (error) {
    throw new Error(`Request to ${pathname} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function requestPasswordReset(email) {
  const response = await fetch(`${origin}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: await response.json() };
}

async function mailLink(recipient, subject) {
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    const messages = await mailboxMessages();
    const message = messages.find((entry) => entry.recipients.includes(recipient.trim().toLowerCase()) && entry.subject === subject);
    const link = message?.text.match(/https?:\/\/[^\s"'<>]+/)?.[0];
    if (link) {
      if (!subject.includes('Verify')) return link;
      const token = new URL(link).searchParams.get('token');
      const database = new Database(databasePath);
      const stored = database.prepare('SELECT token_hash FROM email_verification_tokens WHERE user_id = (SELECT id FROM user WHERE email = ?)').get(recipient);
      database.close();
      if (token && stored?.token_hash === createHash('sha256').update(token).digest('hex')) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Local mail catcher has no current "${subject}" message for the test account.`);
}

async function mailboxMessages() {
  const response = await fetch(`${origin}/__mail`, {
    headers: { Authorization: `Bearer ${mailboxRunnerToken}` },
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(response.status, 200, 'Verification runner could not read the local mailbox.');
  return (await response.json()).messages;
}

async function waitForVerificationEvent(count, timeout = 5_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (verificationEvents.length >= count) return verificationEvents[count - 1];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Expected ${count} email verification redirect observations. Server output: ${serverOutput.slice(-1000)}`);
}

function totp(uri) {
  const secret = new URL(uri).searchParams.get('secret');
  assert.ok(secret, 'Authenticator setup returned no secret.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(char);
    assert.notEqual(index, -1, 'Authenticator secret is not valid base32.');
    bits += index.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((part) => parseInt(part, 2)) ?? []);
  const counter = Math.floor(Date.now() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, '0');
}

function wrongTotp(uri) {
  const current = totp(uri);
  return current === '999999' ? '888888' : '999999';
}

function pageContains(session, text) {
  assert.ok(readRefs(session).includes(text), `Browser did not show: ${text}`);
}

function openMailAction(session, link) {
  chrome(session, ['open', link]);
}

function queryError(location) {
  if (!location) return null;
  return new URL(location, origin).searchParams.get('error');
}

async function browserSignup(session, accountEmail, accountPassword) {
  click(session, 'button', 'Create an account');
  fill(session, 'YOUR NAME', 'Auth verification');
  fill(session, 'EMAIL ADDRESS', accountEmail);
  fill(session, 'PASSWORD', accountPassword);
  click(session, 'checkbox', 'I confirm I am at least 18 years old. GetYourFit does not create an account for minors.');
  click(session, 'button', 'Create account');
  await waitForPage(session, 'Request received.');
}

async function browserSignin(session, accountEmail, accountPassword, code) {
  currentStage = `browser sign-in ${accountEmail}: wait for form`;
  await waitForPage(session, 'Welcome back.');
  currentStage = `browser sign-in ${accountEmail}: fill email`;
  fill(session, 'EMAIL ADDRESS', accountEmail);
  currentStage = `browser sign-in ${accountEmail}: fill password`;
  fill(session, 'PASSWORD', accountPassword);
  currentStage = `browser sign-in ${accountEmail}: submit credentials`;
  click(session, 'button', 'Sign in');
  if (code !== undefined) {
    currentStage = `browser sign-in ${accountEmail}: wait for TOTP challenge`;
    await waitForPage(session, 'One more step.');
    currentStage = `browser sign-in ${accountEmail}: submit TOTP`;
    fill(session, 'AUTHENTICATOR CODE', code);
    click(session, 'button', 'Verify code');
  }
}

async function browserSignout(session) {
  click(session, 'button', 'Privacy');
  click(session, 'button', 'Sign out');
  await waitForPage(session, 'Welcome back.');
}

async function enableTotpInBrowser(session, accountPassword) {
  click(session, 'button', 'Privacy');
  fill(session, 'CONFIRM PASSWORD', accountPassword);
  click(session, 'button', 'Set up TOTP');
  await waitForPage(session, 'VERIFY SETUP CODE');
  const uri = evalResult(evalInBrowser(session, '() => document.querySelector("input[readonly]")?.value ?? null'));
  assert.ok(typeof uri === 'string' && uri.startsWith('otpauth://totp/'), 'Authenticator setup did not show a TOTP URI.');
  enabledTotpUri = uri;
  fill(session, 'VERIFY SETUP CODE', wrongTotp(uri));
  click(session, 'button', 'Enable authenticator');
  pageContains(session, 'That authenticator code is incorrect. Try again.');
  fill(session, 'VERIFY SETUP CODE', totp(uri));
  click(session, 'button', 'Enable authenticator');
  await waitForPage(session, 'Your account, in your hands.');
  click(session, 'button', 'Privacy');
  await waitForPage(session, 'Enabled');
}

async function signInWithTotp(session, accountEmail, accountPassword) {
  await waitForPage(session, 'Welcome back.');
  fill(session, 'EMAIL ADDRESS', accountEmail);
  fill(session, 'PASSWORD', accountPassword);
  click(session, 'button', 'Sign in');
  await waitForPage(session, 'One more step.');
  const uri = evalResult(evalInBrowser(session, '() => document.querySelector("input[readonly]")?.value ?? null'));
  assert.ok(!uri, 'Sign-in challenge exposed authenticator setup data.');
  fill(session, 'AUTHENTICATOR CODE', wrongTotp(enabledTotpUri));
  click(session, 'button', 'Verify code');
  pageContains(session, 'That code is incorrect. Try again.');
  assert.ok(enabledTotpUri, `No authenticator URI was captured while enabling TOTP for ${accountEmail}.`);
  fill(session, 'AUTHENTICATOR CODE', totp(enabledTotpUri));
  click(session, 'button', 'Verify code');
  await waitForPage(session, 'Your account, in your hands.');
}

function assertApiResponse(response, expected, message) {
  assert.equal(response.status, expected, `${message} (HTTP ${response.status})`);
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(true));
  });
}

async function startServer() {
  for (const port of [4174, 1025]) assert.ok(await portIsAvailable(port), `Port ${port} is already in use. Stop the local service and retry.`);
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      GYF_MAILBOX_RUNNER_TOKEN: mailboxRunnerToken,
      GYF_DATA_DIR: dataDir,
      GYF_PORT: '4174',
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      GYF_TRACE_AUTH_REDIRECTS: '1',
    },
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => {
    serverOutput += chunk;
    serverOutputRemainder += chunk;
    const lines = serverOutputRemainder.split('\n');
    serverOutputRemainder = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event === 'email-verification') verificationEvents.push(event);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  });
  let serverError = '';
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverError += chunk; serverErrorOutput += chunk; });
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`Local service stopped during startup: ${serverError}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local service did not start on port 4174: ${serverError}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null || serverWasStopped) return;
  serverWasStopped = true;
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
}

async function main() {
  currentStage = 'production build';
  run('npm', ['run', 'build']);
  currentStage = 'reset verifier browser sessions';
  for (const session of [sessionA, sessionB]) {
    try { chrome(session, ['stop']); } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
  }
  currentStage = 'production service startup';
  await startServer();
  currentStage = 'browser signup and first email verification';
  chrome(sessionA, ['open', origin]);
  await waitForPage(sessionA, 'Welcome back.');

  await browserSignup(sessionA, email, password);
  const anonymousSession = evalResult(evalInBrowser(sessionA, 'async () => await (await fetch("/api/session")).json()'));
  assert.equal(anonymousSession.signedIn, false, 'The unverified browser unexpectedly has an account session.');
  const anonymousMailboxStatus = evalResult(evalInBrowser(sessionA, 'async () => await (await fetch("/__mail")).status'));
  assert.equal(anonymousMailboxStatus, 404, 'An unauthenticated browser could read the local mailbox.');
  const verificationLink = await mailLink(email, 'Verify your GetYourFit email');
  openMailAction(sessionA, verificationLink);
  await waitForPage(sessionA, 'Your account, in your hands.');
  const firstUseEvent = await waitForVerificationEvent(1);
  process.stdout.write(`Verification first use: status=${firstUseEvent.status} Location=${firstUseEvent.location ?? '(none)'} error=${firstUseEvent.error ?? '(none)'}\n`);
  assert.equal(firstUseEvent.status, 302, 'First verification did not redirect after acceptance.');
  assert.equal(firstUseEvent.error, null, 'First verification reported an error.');
  const sessionState = evalResult(evalInBrowser(sessionA, 'async () => await (await fetch("/api/session")).json()'));
  assert.equal(sessionState.signedIn, true, 'Verified signup did not create a session.');
  const verificationDb = new Database(databasePath);
  const sessionsAfterFirstUse = verificationDb.prepare('SELECT count(*) AS count FROM session WHERE userId = (SELECT id FROM user WHERE email = ?)').get(email).count;
  verificationDb.close();
  assert.ok(sessionsAfterFirstUse > 0, 'First verification did not create a session.');
  chrome(sessionA, ['open', origin]);
  await waitForPage(sessionA, 'Your account, in your hands.');

  const reusedVerification = await fetch(verificationLink, { redirect: 'manual' });
  await reusedVerification.arrayBuffer();
  const reusedLocation = reusedVerification.headers.get('location');
  const reusedError = queryError(reusedLocation);
  const reusedEvent = await waitForVerificationEvent(2);
  assert.equal(reusedEvent.status, reusedVerification.status, 'The observed verification event did not match the reuse response status.');
  assert.equal(reusedEvent.location, reusedLocation, 'The observed verification event did not match the reuse response Location.');
  process.stdout.write(`Verification reuse: status=${reusedVerification.status} location=${reusedLocation ?? '(none)'} error=${reusedError ?? '(none)'} set-cookie=${reusedVerification.headers.get('set-cookie') ? 'present' : 'absent'}\n`);
  assert.ok(reusedVerification.status >= 300 && reusedVerification.status < 400, 'Reusing a verification link returned a success response.');
  assert.ok(reusedError && /invalid|used|expired/i.test(reusedError), `Reusing a verification link did not report an invalid, used, or expired token (observed error=${reusedError ?? 'none'}).`);
  const reusedDb = new Database(databasePath);
  const sessionsAfterReuse = reusedDb.prepare('SELECT count(*) AS count FROM session WHERE userId = (SELECT id FROM user WHERE email = ?)').get(email).count;
  reusedDb.close();
  assert.equal(sessionsAfterReuse, sessionsAfterFirstUse, 'Reusing a verification link created another session.');

  currentStage = 'second account and safe auth errors';
  const secondEmail = `auth-second-${Date.now()}@example.test`;
  currentStage = 'create second user through the auth API';
  const secondSignup = await api('/api/auth/sign-up/email', { name: 'Second account', email: secondEmail, password, adultConfirmed: true, callbackURL: origin });
  assertApiResponse(secondSignup, 200, 'A second account could not be created while the first account existed');
  currentStage = 'duplicate signup response';
  const duplicateSignup = await api('/api/auth/sign-up/email', { name: 'Second account', email: secondEmail, password, adultConfirmed: true, callbackURL: origin });
  assert.equal(duplicateSignup.status, secondSignup.status, 'Duplicate signup disclosed whether the email was registered.');

  currentStage = 'underage signup rejection';
  const underAge = await api('/api/auth/sign-up/email', { name: 'Under age', email: `minor-${Date.now()}@example.test`, password, adultConfirmed: false, callbackURL: origin });
  assert.ok(!underAge.ok, 'The server accepted signup without adult confirmation.');
  currentStage = 'weak password signup rejection';
  const weakPassword = await api('/api/auth/sign-up/email', { name: 'Weak password', email: `weak-${Date.now()}@example.test`, password: 'short', adultConfirmed: true, callbackURL: origin });
  assert.ok(!weakPassword.ok, 'The API accepted a weak password.');

  currentStage = 'unknown and wrong-password response comparison';
  const unknownSignIn = await api('/api/auth/sign-in/email', { email: `unknown-${Date.now()}@example.test`, password });
  const wrongPassword = await api('/api/auth/sign-in/email', { email, password: 'wrong-password-for-test' });
  assert.equal(unknownSignIn.status, wrongPassword.status, 'Unknown email and wrong password have different responses.');

  currentStage = 'launch second browser session';
  chrome(sessionB, ['open', origin]);
  await waitForPage(sessionB, 'Welcome back.');
  currentStage = 'unverified account browser sign-in and resend';
  try {
    await browserSignin(sessionB, secondEmail, password);
    await waitForPage(sessionB, 'We could not sign you in. Check your email and password');
  } catch (error) {
    const network = (() => { try { return chrome(sessionB, ['network', '--type', 'fetch', '--limit', '20']); } catch (cause) { return String(cause); } })();
    const consoleOutput = (() => { try { return chrome(sessionB, ['console']); } catch (cause) { return String(cause); } })();
    const snapshot = (() => { try { return readRefs(sessionB); } catch (cause) { return String(cause); } })();
    process.stderr.write(`Browser auth diagnostics:\nnetwork=${network}\nconsole=${consoleOutput}\nsnapshot=${snapshot}\n`);
    throw error;
  }
  currentStage = 'read the resent verification message';
  const secondLink = await mailLink(secondEmail, 'Verify your GetYourFit email');
  currentStage = 'second account email verification';
  openMailAction(sessionB, secondLink);
  await waitForPage(sessionB, 'Your account, in your hands.');
  const secondUserSession = evalResult(evalInBrowser(sessionB, 'async () => await (await fetch("/api/session")).json()'));
  assert.equal(secondUserSession.signedIn, true, 'The second account browser did not establish its own session.');
  const secondUserMailboxStatus = evalResult(evalInBrowser(sessionB, 'async () => await (await fetch("/__mail")).status'));
  assert.equal(secondUserMailboxStatus, 404, 'A different signed-in user could read the local mailbox.');
  const reusedSecondLink = await fetch(secondLink, { redirect: 'manual' });
  await reusedSecondLink.arrayBuffer();
  assert.match(reusedSecondLink.headers.get('location') ?? '', /error=INVALID_TOKEN/, `A second user verification link was reusable or not consumed: status=${reusedSecondLink.status}, location=${reusedSecondLink.headers.get('location')}.`);

  const resetRequested = await requestPasswordReset(email);
  assert.equal(resetRequested.status, 200, 'Password reset request failed');
  const unknownReset = await requestPasswordReset(`unknown-reset-${Date.now()}@example.test`);
  assert.equal(unknownReset.status, 200, 'Unknown-account password reset request failed');
  assert.deepEqual(unknownReset.body, resetRequested.body, 'Known and unknown password reset requests have different responses.');
  currentStage = 'password reset valid, reused, and expired cases';
  const resetLink = await mailLink(email, 'Reset your GetYourFit password');
  const resetToken = new URL(resetLink).searchParams.get('token');
  assert.ok(resetToken, 'Reset email had no token.');
  const validReset = await api('/api/auth/reset-password', { token: resetToken, newPassword: updatedPassword });
  assertApiResponse(validReset, 200, 'A valid reset token was rejected');
  const reusedReset = await api('/api/auth/reset-password', { token: resetToken, newPassword: `${updatedPassword}A` });
  assert.ok(!reusedReset.ok, 'A reset token was accepted twice.');

  const expiredRequest = await requestPasswordReset(email);
  assert.equal(expiredRequest.status, 200, 'Expired reset test could not request a token');
  const expiredLink = await mailLink(email, 'Reset your GetYourFit password');
  const expiredToken = new URL(expiredLink).searchParams.get('token');
  const db = new Database(databasePath);
  const expiredHash = createHash('sha256').update(expiredToken).digest('hex');
  db.prepare('UPDATE password_reset_tokens SET expires_at = 0 WHERE token_hash = ?').run(expiredHash);
  const rejectedExpiredReset = await api('/api/auth/reset-password', { token: expiredToken, newPassword: `${updatedPassword}B` });
  assert.ok(!rejectedExpiredReset.ok, 'An expired reset token was accepted.');
  db.close();

  for (let i = 0; i < 2; i += 1) {
    const invalidReset = await api('/api/auth/reset-password', { token: `invalid-reset-${i}`, newPassword: updatedPassword });
    assert.equal(invalidReset.status, 400, 'Password reset rate limit triggered before its configured threshold.');
  }
  const limitedPasswordReset = await api('/api/auth/reset-password', { token: 'invalid-reset-limit', newPassword: updatedPassword });
  assert.equal(limitedPasswordReset.status, 429, 'Password reset endpoint rate limit did not trigger.');

  const limitedReset = await api('/api/auth/request-password-reset', { email: `rate-${Date.now()}@example.test` });
  assert.equal(limitedReset.status, 429, 'Password reset rate limiting did not trigger.');

  currentStage = 'sign-in rate limiting after invalid credentials';
  let limitedSignIn;
  for (let index = 0; index < 3; index += 1) {
    limitedSignIn = await api('/api/auth/sign-in/email', { email: `rate-signin-${Date.now()}-${index}@example.test`, password });
  }
  assert.equal(limitedSignIn.status, 429, 'Sign-in rate limiting did not trigger.');
  const rateLimitDb = new Database(databasePath);
  rateLimitDb.prepare('DELETE FROM rateLimit').run();
  rateLimitDb.close();

  const wrongOrigin = await api('/api/auth/sign-in/email', { email, password: updatedPassword }, { requestOrigin: 'https://attacker.example' });
  assert.equal(wrongOrigin.status, 403, 'A wrong-origin request was accepted.');
  const noOrigin = await fetch(`${origin}/api/auth/sign-out`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await noOrigin.arrayBuffer();
  assert.equal(noOrigin.status, 403, 'A state-changing request without an origin was accepted.');

  currentStage = 'concurrent sessions, TOTP, export, deletion, and offline UI';
  await browserSignout(sessionA);
  await browserSignout(sessionB);
  await browserSignin(sessionA, email, updatedPassword);
  await waitForPage(sessionA, 'Your account, in your hands.');
  await browserSignin(sessionB, email, updatedPassword);
  await waitForPage(sessionB, 'Your account, in your hands.');
  const concurrentA = evalResult(evalInBrowser(sessionA, 'async () => await (await fetch("/api/session")).json()'));
  const concurrentB = evalResult(evalInBrowser(sessionB, 'async () => await (await fetch("/api/session")).json()'));
  assert.equal(concurrentA.signedIn, true, 'First concurrent session is missing.');
  assert.equal(concurrentB.signedIn, true, 'Second concurrent session is missing.');

  await enableTotpInBrowser(sessionA, updatedPassword);
  const enabledState = evalResult(evalInBrowser(sessionA, 'async () => await (await fetch("/api/session")).json()'));
  assert.equal(enabledState.twoFactorEnabled, true, 'Authenticator setup did not persist.');
  click(sessionA, 'button', 'Privacy');
  click(sessionA, 'button', 'Revoke sessions');
  const revokedB = evalResult(evalInBrowser(sessionB, 'async () => await (await fetch("/api/session")).json()'));
  const sessionsAfterRevoke = new Database(databasePath);
  const activeSessionCount = sessionsAfterRevoke.prepare('SELECT count(*) AS count FROM session WHERE userId = (SELECT id FROM user WHERE email = ?)').get(email).count;
  sessionsAfterRevoke.close();
  assert.equal(revokedB.signedIn, false, `Sign out everywhere left a second session active (database sessions=${activeSessionCount}).`);

  chrome(sessionA, ['open', origin]);
  await waitForPage(sessionA, 'Welcome back.');
  await signInWithTotp(sessionA, email, updatedPassword);
  await waitForPage(sessionA, 'Your account, in your hands.');
  click(sessionA, 'button', 'Privacy');
  const initialExport = evalResult(evalInBrowser(sessionA, 'async () => { const r = await fetch("/api/data/export"); const data = await r.json(); return { ok: r.ok, format: data.format, account: data.account.email }; }'));
  assert.equal(initialExport.ok, true, 'Data export failed.');
  assert.equal(initialExport.format, 'getyourfit-account-export-v1', 'Data export format is incorrect.');
  const foreignRecipient = `xx${email}`.toLowerCase();
  await verificationMailer.sendMail({ from: 'GetYourFit <wardrobe@localhost>', to: foreignRecipient, subject: 'Recipient deletion isolation', text: 'This message belongs to a different recipient.' });
  assert.ok((await mailboxMessages()).some((message) => message.recipients.includes(foreignRecipient)), 'The recipient-isolation message was not parsed by the local mailbox.');
  const mailboxBeforeDelete = await mailboxMessages();
  assert.ok(mailboxBeforeDelete.some((message) => message.recipients.includes(email.toLowerCase())), 'The account mailbox had no message to clean up.');
  click(sessionA, 'button', 'Delete my data');
  click(sessionA, 'button', 'Erase permanently');
  await waitForPage(sessionA, 'Welcome back.');
  const mailboxAfterDelete = await mailboxMessages();
  assert.ok(!mailboxAfterDelete.some((message) => message.recipients.includes(email.toLowerCase())), 'Account deletion left its verification or reset mail in the local mailbox.');
  assert.ok(mailboxAfterDelete.some((message) => message.recipients.includes(foreignRecipient)), 'Deleting alice@example.test removed mail addressed to xxalice@example.test.');
  const deletedSignIn = await api('/api/auth/sign-in/email', { email, password: updatedPassword });
  assert.ok(!deletedSignIn.ok, 'A deleted account could sign in.');

  await stopServer();
  const offlineForm = readRefs(sessionA);
  if (!offlineForm.includes('Welcome back.')) chrome(sessionA, ['open', origin]);
  await waitForPage(sessionA, 'Welcome back.');
  fill(sessionA, 'EMAIL ADDRESS', email);
  fill(sessionA, 'PASSWORD', updatedPassword);
  click(sessionA, 'button', 'Sign in');
  pageContains(sessionA, 'The local service is unavailable. Check that it is running, then try again.');

  chrome(sessionA, ['stop']);
  chrome(sessionB, ['stop']);
  process.stdout.write('verify:auth passed: production build, browser signup/verification/session/sign-out, multi-user signup, no-enumeration responses, password validation/reset expiry and reuse, rate limits, CSRF/origin, concurrent sessions, TOTP wrong and right codes, revocation, export/deletion, and server-down UI.\n');
}

try {
  await main();
} catch (error) {
  const browserPages = (() => { try { return chrome(sessionB, ['pages']); } catch (cause) { return String(cause); } })();
  const browserConsole = (() => { try { return chrome(sessionB, ['console']); } catch (cause) { return String(cause); } })();
  const browserNetwork = (() => { try { return chrome(sessionB, ['network', '--type', 'all', '--limit', '30']); } catch (cause) { return String(cause); } })();
  const sessionANetwork = (() => { try { return chrome(sessionA, ['network', '--type', 'all', '--limit', '30']); } catch (cause) { return String(cause); } })();
  const detailedConsole = (() => { try { return chrome(sessionB, ['console-get', '3']); } catch (cause) { return String(cause); } })();
  let responseDetail = 'no sign-in response was captured';
  const requestId = browserNetwork.match(/reqid=(\S+) POST https?:\/\/[^\s]+\/api\/auth\/sign-in\/email \[403\]/)?.[1];
  if (requestId) {
    const responsePath = path.join(dataDir, 'browser-auth-response.json');
    try {
      chrome(sessionB, ['network-get', requestId, '--response-file', responsePath]);
      const responseBody = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
      responseDetail = JSON.stringify({ requestId, status: 403, code: responseBody.code ?? null, message: responseBody.message ?? null });
    } catch (cause) {
      responseDetail = `Could not read the 403 response: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }
  process.stderr.write(`Browser pages at failure:\n${browserPages}\nBrowser console at failure:\n${browserConsole}\nDetailed browser console:\n${detailedConsole}\nBrowser network:\n${browserNetwork}\nSession A network:\n${sessionANetwork}\nSign-in response=${responseDetail}\nverify:auth failed during ${currentStage}: ${error instanceof Error ? error.stack ?? error.message : String(error)}${serverOutput ? `\nserver trace=${serverOutput.slice(-3000)}` : ''}${serverErrorOutput ? `\n${serverErrorOutput}` : ''}\n`);
  await stopServer();
  for (const session of [sessionA, sessionB]) {
    try { chrome(session, ['stop']); } catch (stopError) {
      if (stopError instanceof Error) process.stderr.write(`Could not stop browser session ${session}: ${stopError.message}\n`);
    }
  }
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (serverWasStopped) process.stdout.write('Stopped the production-mode verification service.\n');
}
