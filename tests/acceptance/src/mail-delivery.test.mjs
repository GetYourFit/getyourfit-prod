import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Signup, verification, sign-in and password reset in a real browser, with every message delivered by the
// application over STARTTLS and SMTP authentication to a real SMTP server. The provider values are generated
// per run and exist only in this process.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const smtpUser = `provider-${randomBytes(6).toString('hex')}`;
const smtpPass = randomBytes(24).toString('base64url');
const received = [];
let app, browser, server, smtp, directory, baseURL;
let logs = '';

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

before(async () => {
  await mkdir(new URL('../../../.gyf-data/', import.meta.url), { recursive: true });
  directory = await mkdtemp(`${root}.gyf-data/mail-delivery-`);
  const certificatePath = `${directory}/smtp-cert.pem`;
  const keyPath = `${directory}/smtp-key.pem`;
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyPath, '-out', certificatePath], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(openssl.status, 0, openssl.stderr);
  smtp = new SMTPServer({
    key: await readFile(keyPath),
    cert: await readFile(certificatePath),
    onAuth(auth, _session, callback) {
      if (auth.username === smtpUser && auth.password === smtpPass) return callback(null, { user: auth.username });
      callback(new Error('Invalid SMTP credentials.'));
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', async () => {
        const mail = await simpleParser(Buffer.concat(chunks));
        received.unshift({ subject: mail.subject, to: mail.to.value.map(({ address }) => address), text: mail.text, secure: session.secure, authenticated: Boolean(session.user) });
        callback();
      });
    },
  });
  smtp.listen(0, '127.0.0.1');
  await once(smtp.server, 'listening');

  const port = await freePort();
  app = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } } } });
  await app.listen();
  baseURL = `http://127.0.0.1:${app.httpServer.address().port}`;
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', GYF_PORT: String(port), GYF_DATA_DIR: directory,
      BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), NODE_EXTRA_CA_CERTS: certificatePath,
      GYF_SMTP_HOST: '127.0.0.1', GYF_SMTP_PORT: String(smtp.server.address().port), GYF_SMTP_USER: smtpUser, GYF_SMTP_PASS: smtpPass,
      GYF_MAIL_FROM: 'GetYourFit <wardrobe@example.test>', GYF_MAIL_TRANSPORT: '' },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, logs);
    try { ready = (await fetch(`http://127.0.0.1:${port}/api/session`)).ok; } catch { ready = false; }
    if (ready) break;
    await delay(100);
  }
  assert(ready, logs);
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await app?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  await new Promise(resolve => smtp ? smtp.close(resolve) : resolve());
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function messageFor(address, subject, count = 1) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const matching = received.filter(item => item.to.includes(address) && item.subject === subject);
    if (matching.length >= count) return matching[0];
    await delay(100);
  }
  assert.fail(`No "${subject}" message reached ${address}.`);
}

const linkIn = message => message.text.match(/https?:\/\/\S+/)[0];

test('signup, email verification, sign-in and password reset work end to end through a real SMTP server', async t => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(6000);
  t.after(() => context.close());
  const page = await context.newPage();
  const email = `wearer-${randomBytes(6).toString('hex')}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const newPassword = randomBytes(24).toString('base64url');

  const proof = async name => {
    if (!process.env.GYF_PROOF_DIR) return;
    await mkdir(process.env.GYF_PROOF_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.GYF_PROOF_DIR}/smtp-${name}.png`, fullPage: true });
  };

  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill('Mail wearer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();

  await proof('signup-sent');
  const verification = await messageFor(email, 'Verify your GetYourFit email');
  assert.equal(verification.secure, true, 'The verification message was not sent over STARTTLS.');
  assert.equal(verification.authenticated, true, 'The verification message was not sent with SMTP authentication.');

  await page.goto('/account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').filter({ hasText: 'Verify your email first' }).waitFor();

  await proof('unverified-signin-blocked');
  const freshVerification = await messageFor(email, 'Verify your GetYourFit email', 2);
  assert.notEqual(linkIn(freshVerification), linkIn(verification), 'The blocked sign-in did not send a fresh verification link.');
  await page.goto(linkIn(verification));
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.goto(linkIn(freshVerification));
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname === '/wardrobe');
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/');
  await page.goto('/account');

  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  const reset = await messageFor(email, 'Reset your GetYourFit password');
  assert.equal(reset.secure, true);
  assert.equal(reset.authenticated, true);

  await page.goto(linkIn(reset));
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
  await proof('reset-form');
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').filter({ hasText: 'We could not sign you in' }).waitFor();
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname === '/wardrobe');
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  await proof('reset-account');
  if (process.env.GYF_PROOF_DIR) await writeFile(`${process.env.GYF_PROOF_DIR}/smtp-delivery.json`, JSON.stringify(received.map(({ subject, to, secure, authenticated }) => ({ subject, to, secure, authenticated })), null, 2));
  assert(!logs.includes(smtpPass) && !logs.includes(newPassword), 'Service logs exposed credentials.');
});
