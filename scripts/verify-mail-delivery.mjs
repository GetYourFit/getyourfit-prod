import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portProbe = net.createServer();
await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const email = `delivery-${Date.now()}@example.test`;
const insecureEmail = `insecure-${Date.now()}@example.test`;
const password = `Verify-${randomBytes(32).toString('base64url')}!`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyf-mail-delivery-'));
const browserSession = `gyf-smtp-mail-${process.pid}`;
const proofDir = process.env.GYF_PROOF_DIR;
if (proofDir) fs.mkdirSync(proofDir, { recursive: true, mode: 0o700 });
function recordProof(event) {
  if (proofDir) fs.appendFileSync(path.join(proofDir, 'smtp-observations.jsonl'), `${JSON.stringify(event)}\n`);
}
const receivedMessages = [];
const receivers = [];
let server;
let serverStopPromise;
let serverOutput = '';
let serverErrorOutput = '';
let resolveHeldDelivery;
let releaseHeldDelivery;
const heldDelivery = new Promise((resolve) => { resolveHeldDelivery = resolve; });
const deliveryGate = new Promise((resolve) => { releaseHeldDelivery = resolve; });

function timeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

async function waitUntil(predicate, message, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function createTestCertificate() {
  const keyPath = path.join(dataDir, 'smtp-test-key.pem');
  const certificatePath = path.join(dataDir, 'smtp-test-cert.pem');
  const result = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certificatePath,
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  if (result.error || result.status !== 0) throw new Error('Could not create the temporary SMTP test certificate.');
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certificatePath), certificatePath };
}

async function startMailReceiver({ certificate, noStartTls = false } = {}) {
  const observations = { connections: 0, acceptedMessages: 0 };
  const receiver = new SMTPServer({
    authOptional: true,
    ...(certificate ? { key: certificate.key, cert: certificate.cert } : {}),
    ...(noStartTls ? { disabledCommands: ['AUTH', 'STARTTLS'] } : {}),
    onConnect(session, callback) {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(session.remoteAddress)) return callback(new Error('Local test mail only.'));
      observations.connections += 1;
      callback();
    },
    onData(stream, _session, callback) {
      observations.acceptedMessages += 1;
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        try {
          const parsed = await simpleParser(Buffer.concat(chunks));
          const message = {
            subject: parsed.subject || '',
            from: parsed.from?.value?.[0]?.address,
            recipients: parsed.to?.value?.map(({ address }) => address?.trim().toLowerCase()).filter(Boolean) ?? [],
            text: parsed.text || '',
          };
          if (message.subject === 'Reset your GetYourFit password' && message.recipients.includes(email)) {
            resolveHeldDelivery();
            await deliveryGate;
          }
          receivedMessages.unshift(message);
          recordProof({ event: 'received-mail', subject: message.subject, from: message.from, recipients: message.recipients, secure: _session.secure });
          callback();
        } catch {
          callback(new Error('The test mail receiver could not read this message.'));
        }
      });
    },
  });
  await new Promise((resolve, reject) => {
    receiver.once('error', reject);
    receiver.listen(0, '127.0.0.1', () => {
      receiver.removeListener('error', reject);
      resolve();
    });
  });
  const result = { receiver, port: receiver.server.address().port, observations };
  receivers.push(receiver);
  return result;
}

async function startService(smtpPort, serviceDataDir, extraEnv = {}) {
  fs.mkdirSync(serviceDataDir, { recursive: true });
  serverStopPromise = undefined;
  serverOutput = '';
  serverErrorOutput = '';
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      GYF_MAIL_TRANSPORT: 'smtp',
      GYF_DATA_DIR: serviceDataDir,
      GYF_PORT: String(port),
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_SECURE: 'false',
      SMTP_FROM: 'GetYourFit <wardrobe@example.test>',
      ...extraEnv,
    },
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverErrorOutput += chunk; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The mail delivery service stopped during startup: ${serverErrorOutput}`);
    try {
      const response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
      await response.arrayBuffer();
    } catch (error) { if (!(error instanceof Error)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The mail delivery service did not start: ${serverErrorOutput}`);
}

async function api(pathname, body, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method: options.method || 'POST',
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  recordProof({ event: 'http-response', path: pathname, status: response.status,
    ...(['/api/session', '/api/auth/request-password-reset', '/api/auth/reset-password', '/api/data'].includes(pathname)
      ? { body: responseText ? JSON.parse(responseText) : null } : {}),
  });
  return {
    status: response.status,
    body: responseText ? JSON.parse(responseText) : null,
    headers: response.headers,
  };
}

async function mailFor(subject, address = email) {
  await waitUntil(() => receivedMessages.some((message) => message.subject === subject && message.recipients.includes(address)), `No ${subject} email reached the configured SMTP server.`);
  return receivedMessages.find((message) => message.subject === subject && message.recipients.includes(address));
}

function linkFrom(message) {
  const link = message.text.match(/https?:\/\/[^\s"'<>]+/)?.[0];
  assert.ok(link, `The ${message.subject} message had no link.`);
  return link;
}

function stopService() {
  if (!server || server.exitCode !== null) return Promise.resolve();
  if (serverStopPromise) return serverStopPromise;
  serverStopPromise = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  return serverStopPromise;
}

function browser(args) {
  const result = spawnSync('chrome-devtools-axi', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: browserSession },
  });
  if (result.error || result.status !== 0) throw new Error(`Browser ${args[0]} command failed.`);
  return result.stdout.trim();
}

function browserSnapshot() {
  return browser(['snapshot']);
}

function browserRef(role, name) {
  const entry = browserSnapshot().split('\n').find((line) => line.includes(` ${role} "${name}"`) || line.includes(` ${role} "${name} `));
  assert.ok(entry, `Browser did not show ${role} "${name}".`);
  return entry.match(/uid=([^ ]+)/)?.[1];
}

function browserClick(role, name) {
  browser(['click', `@${browserRef(role, name)}`]);
}

function browserFill(name, value) {
  browser(['fill', `@${browserRef('textbox', name)}`, value]);
}

async function browserWait(phrase) {
  const deadline = Date.now() + 12_000;
  let snapshot = '';
  while (Date.now() < deadline) {
    snapshot = browserSnapshot();
    if (snapshot.includes(phrase)) {
      if (proofDir) browser(['screenshot', path.join(proofDir, `${phrase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`)]);
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Browser did not show the expected account state: ${phrase}. ${snapshot.slice(-500)}`);
}

function browserResult(output) {
  const line = output.split('\n').find((entry) => entry.startsWith('result:'));
  assert.ok(line, 'Browser evaluation returned no result.');
  const result = JSON.parse(line.slice('result:'.length).trim());
  return typeof result === 'string' ? JSON.parse(result) : result;
}

function verifyCliDefaultView() {
  const defaultView = spawnSync(process.execPath, ['scripts/gyf.mjs'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.ok(!defaultView.error, 'The no-argument readiness command could not run.');
  assert.match(defaultView.stdout, /executable:/, 'The no-argument readiness view omitted its executable path.');
  assert.match(defaultView.stdout, /checks\[2\]/, 'The no-argument readiness view omitted service checks.');
  const homeAlias = spawnSync(process.execPath, ['scripts/gyf.mjs', 'home'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(homeAlias.status, 2, 'The removed home command still succeeds.');
  assert.match(homeAlias.stdout, /Unknown command home\./, 'The removed home command did not return a usage error.');
}

async function verifySmtpUi() {
  browser(['stop']);
  browser(['open', `${origin}/account`]);
  await browserWait('Welcome back.');
  const session = browserResult(browser(['eval', 'async () => await (await fetch("/api/session")).json()']));
  assert.deepEqual(session, { signedIn: false, emailDeliveryMode: 'smtp' }, 'The signed-out browser did not receive the safe SMTP delivery mode.');
  assert.ok(browserSnapshot().includes('Verification and recovery messages are sent by email.'), 'The sign-in privacy note did not describe SMTP delivery accurately.');
  browserClick('button', 'Create an account');
  await browserWait('Make it yours.');
  assert.ok(browserSnapshot().includes('Verification and recovery messages are sent by email.'), 'The signup page did not describe SMTP delivery accurately.');
  browserClick('button', 'Already have an account? Sign in');
  await browserWait('Welcome back.');
  browserClick('button', 'Forgot password?');
  await browserWait('Find your way back.');
  browserFill('EMAIL ADDRESS', `unknown-${Date.now()}@example.test`);
  browserClick('button', 'Send reset link');
  await browserWait('Request received.');
  assert.ok(browserSnapshot().includes('We could not confirm delivery.'), 'The sent state overstated SMTP delivery.');
}

async function signInInBrowser() {
  browser(['open', `${origin}/account`]);
  await browserWait('Welcome back.');
  browserFill('EMAIL ADDRESS', email);
  browserFill('PASSWORD', password);
  browserClick('button', 'Sign in');
  await browserWait('Your account, in your hands.');
  assert.ok(browserSnapshot().includes('Verification and recovery messages are sent by email.'), 'The account page did not describe SMTP delivery accurately.');
}

async function verifySmtpAccountFlow(smtpPort, certificatePath) {
  const flowEmail = `smtp-browser-${Date.now()}@example.test`;
  const newPassword = `Renewed-${randomBytes(32).toString('base64url')}!`;
  try {
    await startService(smtpPort, path.join(dataDir, 'browser-flow'), { NODE_EXTRA_CA_CERTS: certificatePath });
    const signedOut = await api('/api/session', undefined, { method: 'GET' });
    assert.deepEqual(signedOut.body, { signedIn: false, emailDeliveryMode: 'smtp' }, 'The signed-out session exposed incorrect SMTP delivery state.');

    browser(['stop']);
    browser(['open', `${origin}/sign-up`]);
    await browserWait('Make it yours.');
    assert.ok(browserSnapshot().includes('Verification and recovery messages are sent by email.'), 'The signup page did not describe SMTP delivery accurately.');
    browserFill('YOUR NAME', 'SMTP delivery verification');
    browserFill('EMAIL ADDRESS', flowEmail);
    browserFill('PASSWORD', password);
    browserClick('checkbox', 'I confirm I am at least 18 years old. GetYourFit does not create an account for minors.');
    browserClick('button', 'Create account');
    await browserWait('Request received.');
    assert.ok(browserSnapshot().includes('We could not confirm delivery.'), 'The signup sent state overstated SMTP delivery.');

    const verificationMail = await mailFor('Verify your GetYourFit email', flowEmail);
    assert.equal(verificationMail.from, 'wardrobe@example.test', 'The verification email used the wrong sender.');
    const unverified = await api('/api/auth/sign-in/email', { email: flowEmail, password });
    assert.equal(unverified.status, 403, 'An unverified account could sign in.');
    const verificationMailsFor = () => receivedMessages.filter((message) => message.subject === verificationMail.subject && message.recipients.includes(flowEmail));
    await waitUntil(() => verificationMailsFor().length >= 2, 'Signing in before verification did not send a fresh verification link.');
    browser(['open', linkFrom(verificationMailsFor()[0])]);
    const flowDb = new Database(path.join(dataDir, 'browser-flow', 'getyourfit.sqlite'), { readonly: true });
    try {
      await waitUntil(() => flowDb.prepare('SELECT emailVerified FROM user WHERE email = ?').get(flowEmail)?.emailVerified === 1, 'The emailed verification link did not verify the account.');
    } finally { flowDb.close(); }

    browser(['open', `${origin}/account`]);
    await browserWait('Your account, in your hands.');
    browserClick('button', 'Sign out');
    await waitUntil(() => !browserSnapshot().includes('Your account, in your hands.'), 'Sign out did not leave the account page.');
    browser(['open', `${origin}/account`]);
    await browserWait('Welcome back.');
    browserClick('button', 'Forgot password?');
    await browserWait('Find your way back.');
    browserFill('EMAIL ADDRESS', flowEmail);
    browserClick('button', 'Send reset link');
    await browserWait('Request received.');
    const resetMail = await mailFor('Reset your GetYourFit password', flowEmail);
    browser(['open', linkFrom(resetMail)]);
    await browserWait('Choose a new password.');
    browserFill('NEW PASSWORD', newPassword);
    browserClick('button', 'Save new password');
    await browserWait('Welcome back.');
    browserFill('EMAIL ADDRESS', flowEmail);
    browserFill('PASSWORD', newPassword);
    browserClick('button', 'Sign in');
    await browserWait('Your account, in your hands.');
    assert.equal((await api('/api/auth/sign-in/email', { email: flowEmail, password })).status, 401, 'The replaced password still signed in.');
  } finally {
    await stopService();
    browser(['stop']);
  }
}

async function main() {
  const insecureRelay = await startMailReceiver({ noStartTls: true });
  try {
    await startService(insecureRelay.port, path.join(dataDir, 'insecure-relay'));

    await timeout(api('/api/auth/sign-up/email', {
      name: 'Insecure relay verification',
      email: insecureEmail,
      password,
      adultConfirmed: true,
      callbackURL: origin,
    }), 10_000, 'The insecure SMTP relay check did not return.');
    await waitUntil(() => insecureRelay.observations.connections > 0, 'The insecure SMTP relay did not receive a connection attempt.');
    const insecureDb = new Database(path.join(dataDir, 'insecure-relay', 'getyourfit.sqlite'));
    try {
      await waitUntil(() => insecureDb.prepare("SELECT count(*) AS count FROM auth_audit WHERE action = 'mail-delivery-failed'").get().count > 0, 'The application did not report rejecting the insecure relay.');
    } finally { insecureDb.close(); }
    assert.equal(insecureRelay.observations.acceptedMessages, 0, 'The app sent account mail through SMTP without STARTTLS.');
    recordProof({ event: 'insecure-relay-rejected', ...insecureRelay.observations });
  } finally {
    await stopService();
  }

  const certificate = createTestCertificate();
  const { port: smtpPort } = await startMailReceiver({ certificate });
  try {
    await startService(smtpPort, path.join(dataDir, 'tls-relay'), { NODE_EXTRA_CA_CERTS: certificate.certificatePath });
    verifyCliDefaultView();
    const signedOut = await api('/api/session', undefined, { method: 'GET' });
    assert.deepEqual(signedOut.body, { signedIn: false, emailDeliveryMode: 'smtp' }, 'The signed-out session exposed incorrect delivery state.');
    await verifySmtpUi();

    const signup = await api('/api/auth/sign-up/email', {
      name: 'SMTP delivery verification',
      email,
      password,
      adultConfirmed: true,
      callbackURL: origin,
    });
    assert.equal(signup.status, 200, 'Account creation did not queue verification through SMTP.');
    const verificationLink = linkFrom(await mailFor('Verify your GetYourFit email'));
    const verification = await fetch(verificationLink, { redirect: 'manual' });
    await verification.arrayBuffer();
    assert.ok(verification.status >= 300 && verification.status < 400, 'The SMTP verification link did not reach the verification route.');
    assert.ok(!/error=INVALID_TOKEN/.test(verification.headers.get('location') || ''), 'The SMTP verification link was rejected.');

    const signin = await api('/api/auth/sign-in/email', { email, password });
    assert.equal(signin.status, 200, 'The verified SMTP account could not sign in.');
    const cookieHeaders = signin.headers.getSetCookie?.() ?? [signin.headers.get('set-cookie')].filter(Boolean);
    const cookie = cookieHeaders.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
    assert.match(cookie, /session_token=/, 'Sign-in returned no session cookie for the deletion request.');
    const signedIn = await api('/api/session', undefined, { method: 'GET', cookie });
    assert.deepEqual(signedIn.body, { signedIn: true, email, twoFactorEnabled: false, emailDeliveryMode: 'smtp' }, 'The signed-in session exposed incorrect delivery state.');
    await signInInBrowser();

    const mailboxStatus = await fetch(`${origin}/__mail`, { headers: { Authorization: 'Bearer local-test-token' } });
    await mailboxStatus.arrayBuffer();
    assert.equal(mailboxStatus.status, 404, 'The SMTP service exposed the local test mailbox route.');

    const resetRequest = api('/api/auth/request-password-reset', { email });
    await timeout(heldDelivery, 5000, 'The reset request did not reach SMTP.');
    const resetResponse = await timeout(resetRequest, 1500, 'A known-account reset response waited for SMTP delivery.');
    const unknownResetResponse = await api('/api/auth/request-password-reset', { email: `unknown-${Date.now()}@example.test` });
    assert.equal(resetResponse.status, 200, 'Password reset did not return its generic response while SMTP was blocked.');
    assert.deepEqual(resetResponse.body, unknownResetResponse.body, 'Known and unknown reset responses differed.');

    let deletionSettled = false;
    const deletionRequest = api('/api/data', { confirm: 'delete my account' }, { method: 'DELETE', cookie })
      .then((result) => { deletionSettled = true; return result; });
    await waitUntil(async () => {
      const session = await api('/api/session', undefined, { method: 'GET', cookie });
      return session.body?.signedIn === false;
    }, 'Account deletion did not remove the active session while delivery was held.');
    assert.equal(deletionSettled, false, 'Account deletion returned before its registered SMTP delivery settled.');

    releaseHeldDelivery();
    const [delivery, deletion] = await Promise.all([
      timeout(mailFor('Reset your GetYourFit password'), 5000, 'The reset email was not accepted by SMTP after release.'),
      timeout(deletionRequest, 5000, 'Account deletion did not finish after SMTP accepted the reset email.'),
    ]);
    assert.equal(deletion.status, 200, 'Account deletion failed after the delivery settled.');
    assert.equal(deletion.body?.deleted, true, 'The account deletion response did not confirm deletion.');

    const resetToken = new URL(linkFrom(delivery)).searchParams.get('token');
    assert.ok(resetToken, 'The reset email contained no token.');
    const reusedAfterDeletion = await api('/api/auth/reset-password', { token: resetToken, newPassword: `${password}A` });
    assert.equal(reusedAfterDeletion.status, 400, 'A reset link remained usable after its account was deleted.');

  } finally {
    releaseHeldDelivery();
    await stopService();
    browser(['stop']);
  }

  await verifySmtpAccountFlow(smtpPort, certificate.certificatePath);
  process.stdout.write('verify:mail-delivery passed: STARTTLS enforcement, SMTP delivery UI, safe session mode, private mailbox isolation, non-enumerating reset response, deletion waiting for an accepted in-flight delivery, and SMTP signup verification, forgot-password and reset through the real browser.\n');
}

try {
  await main();
} catch (error) {
  process.stderr.write(`verify:mail-delivery failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}${serverOutput ? `\nservice output=${serverOutput}` : ''}${serverErrorOutput ? `\nservice errors=${serverErrorOutput}` : ''}\n`);
  process.exitCode = 1;
} finally {
  releaseHeldDelivery();
  if (server && server.exitCode === null) await stopService();
  for (const receiver of receivers) {
    if (receiver.server.listening) await new Promise((resolve) => receiver.close(resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
