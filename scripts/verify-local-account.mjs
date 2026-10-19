import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '../tests/support/database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portProbe = net.createServer();
await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const session = `gyf-local-account-${process.pid}`;
const database = await createTestDatabase();
const email = `wearer-${randomBytes(8).toString('hex')}@example.test`;
let password = randomBytes(32).toString('base64url');
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

function element(role, name) {
  const entry = chrome(['snapshot']).split('\n').find((line) => line.includes(` ${role} "${name}"`));
  assert.ok(entry, `Missing ${role}: ${name}`);
  const uid = entry.match(/uid=(\S+)/)?.[1];
  assert.ok(uid);
  return `@${uid}`;
}

function click(name) { chrome(['click', element('button', name)]); }
function fill(name, value) { chrome(['fill', element('textbox', name), value]); }
function follow(name) { chrome(['click', element('link', name)]); }

function evaluate(expression) {
  const output = chrome(['eval', expression]);
  const entry = output.split('\n').find((line) => line.startsWith('result:'));
  assert.ok(entry, 'Browser returned no evaluation result.');
  const parsed = JSON.parse(entry.slice(7).trim());
  return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}

async function shown(text) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (chrome(['snapshot']).includes(text)) return;
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
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: database.url, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, GYF_PORT: String(port) },
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

try {
  run('npm', ['run', 'build']);
  const refused = spawnSync(process.execPath, ['server/index.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, BETTER_AUTH_SECRET: '', DATABASE_URL: database.url },
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /stable random key/);

  await startServer();
  chrome(['open', `${origin}/sign-in`]);
  await shown('Welcome back.');
  if (proofDir) {
    fs.mkdirSync(proofDir, { recursive: true, mode: 0o700 });
    chrome(['resize', '1440', '1000']);
    chrome(['screenshot', path.join(proofDir, 'v01-signin-desktop.png')]);
  }
  click('Forgot password?');
  await shown('We can’t email password reset links yet.');
  click('Back to sign in');
  await shown('Welcome back.');
  click('Create an account');
  fill('Your name', 'Local wearer');
  fill('Email', email);
  fill('Password', password);
  click('Create account');
  await shown('18 or older to create an account');
  chrome(['click', element('checkbox', 'I’m 18 or older. GetYourFit doesn’t create accounts for minors.')]);
  click('Create account');
  await shown('Your wardrobe');
  follow('Account');
  await shown('Signed in as');
  if (proofDir) {
    chrome(['screenshot', path.join(proofDir, 'v01-account-desktop.png')]);
    chrome(['emulate', '--viewport', '390x844x1,mobile,touch']);
    assert.equal(evaluate('() => window.innerWidth'), 390, 'Mobile emulation did not establish the requested viewport.');
    chrome(['screenshot', path.join(proofDir, 'v01-account-mobile.png')]);
    assert.equal(evaluate('() => document.documentElement.scrollWidth <= window.innerWidth'), true, 'Mobile account layout overflows.');
    chrome(['emulate', '--viewport', '1440x1000x1']);
  }
  const firstSession = evaluate('async () => await (await fetch("/api/session")).json()');
  assert.equal(firstSession.signedIn, true);
  for (const route of ['send-verification-email', 'request-password-reset', 'reset-password']) {
    assert.equal(evaluate(`async () => (await fetch("/api/auth/${route}", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status`), 503);
  }
  const exported = evaluate('async () => await (await fetch("/api/data/export")).json()');
  assert.equal(exported.account.email, email);
  assert.equal(exported.account.emailVerified, false);
  assert.equal('password' in exported.account, false);

  const nextPassword = randomBytes(32).toString('base64url');
  fill('Current password', password);
  fill('New password', nextPassword);
  click('Change password');
  await shown('Your password is changed.');
  password = nextPassword;

  await stopServer();
  await startServer();
  assert.equal(evaluate('async () => (await (await fetch("/api/session")).json()).signedIn'), true, 'Restart lost the browser session.');
  click('Sign out');
  await shown('Example outfit');
  chrome(['open', `${origin}/sign-in`]);
  await shown('Welcome back.');
  fill('Email', email);
  fill('Password', randomBytes(32).toString('base64url'));
  click('Sign in');
  await shown('We could not sign you in.');
  fill('Password', password);
  click('Sign in');
  await shown('Your wardrobe');
  follow('Account');
  await shown('Signed in as');
  click('Delete my data');
  click('Erase permanently');
  await shown('Example outfit');
  chrome(['open', `${origin}/sign-in`]);
  await shown('Welcome back.');
  assert.equal(evaluate('async () => (await fetch("/api/data/export")).status'), 401);
  fill('Email', email);
  fill('Password', password);
  click('Sign in');
  await shown('We could not sign you in.');
  process.stdout.write('verify:local-account passed: production browser signup without email confirmation, adult consent, honest email-reset notice, signed-in password change, unverified export, stable-key restart, wrong password, sign-out/sign-in, and permanent deletion.\n');
} finally {
  await stopServer();
  try { chrome(['stop']); } catch (error) { process.stderr.write(`Browser cleanup failed: ${String(error)}\n`); }
  await database.drop();
}
