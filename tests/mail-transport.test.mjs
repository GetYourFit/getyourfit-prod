import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { startMockMailServer } from '../server/mock-mail.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mailModule = path.join(root, 'server/mail.mjs');

function runMailModule(env, script = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `const mail = await import(${JSON.stringify(mailModule)});\n${script}`], {
      cwd: root,
      env: { PATH: process.env.PATH, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('without SMTP values mail is unconfigured: enforced, honest and unable to send', async () => {
  const result = await runMailModule({ NODE_ENV: 'production' }, 'console.log(JSON.stringify({ enforced: mail.emailEnforced, connected: mail.emailConnected, mode: mail.emailDeliveryMode }));\nawait mail.sendMail({ to: "a@example.test", subject: "s", text: "t" }).catch((error) => console.log(error.message));');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['{"enforced":true,"connected":false,"mode":"unconfigured"}', 'Email delivery is not connected.']);
});

test('the mock mailbox delivers over authenticated SMTP outside production and is refused in production', async () => {
  const result = await runMailModule({ GYF_MAIL_TRANSPORT: 'local', GYF_MAILBOX_RUNNER_TOKEN: 'runner', GYF_MOCK_SMTP_PORT: '0' }, [
    'console.log(JSON.stringify({ connected: mail.emailConnected, mode: mail.emailDeliveryMode }));',
    'await mail.sendMail({ to: "A@Example.test", subject: "s", text: "t" });',
    'console.log(JSON.stringify(mail.localMailbox().map(({ subject, recipients, text }) => ({ subject, recipients, text }))));',
    'process.exit(0);',
  ].join('\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['{"connected":true,"mode":"local-test"}', '[{"subject":"s","recipients":["a@example.test"],"text":"t\\n"}]']);
  const production = await runMailModule({ NODE_ENV: 'production', GYF_MAIL_TRANSPORT: 'local', GYF_MAILBOX_RUNNER_TOKEN: 'runner' });
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /only in development and test mode/);
});

test('the mock mailbox refuses senders that do not hold the mock account password', async (t) => {
  const messages = [];
  const { port, close } = await startMockMailServer({ port: 0, credentials: { user: 'mock@example.invalid', pass: 'mock-one' }, messages });
  t.after(close);
  const send = (pass) => nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, ignoreTLS: true, auth: { user: 'mock@example.invalid', pass } })
    .sendMail({ from: 'mock@example.invalid', to: 'a@example.test', subject: 'hello', text: 'body' });
  await assert.rejects(send('wrong'), /Invalid mock mailbox credentials/);
  assert.equal(messages.length, 0);
  await send('mock-one');
  assert.deepEqual(messages.map(({ subject, recipients }) => ({ subject, recipients })), [{ subject: 'hello', recipients: ['a@example.test'] }]);
});

test('mail can be switched off explicitly and then refuses to send', async () => {
  const result = await runMailModule({ GYF_MAIL_TRANSPORT: 'disabled' }, 'console.log(JSON.stringify({ enabled: mail.emailEnabled, mode: mail.emailDeliveryMode }));\nawait mail.sendMail({ to: "a@example.test", subject: "s", text: "t" }).catch((error) => console.log(error.message));');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['{"enabled":false,"mode":"disabled"}', 'Email delivery is disabled.']);
});

test('invalid mail configuration stops startup with a clear message', async () => {
  const cases = [
    [{ GYF_MAIL_TRANSPORT: 'carrier-pigeon' }, /must be smtp, local or disabled/],
    [{ GYF_MAIL_TRANSPORT: 'http' }, /must be smtp, local or disabled/],
    [{ GYF_SMTP_HOST: 'smtp.example.test' }, /GYF_SMTP_HOST and GYF_MAIL_FROM are required/],
    [{ GYF_MAIL_TRANSPORT: 'smtp', GYF_SMTP_HOST: 'smtp.example.test', GYF_MAIL_FROM: 'a@example.test', GYF_SMTP_USER: 'u' }, /GYF_SMTP_USER and GYF_SMTP_PASS must be set together/],
    [{ GYF_MAIL_TRANSPORT: 'smtp' }, /GYF_SMTP_HOST and GYF_MAIL_FROM are required/],
  ];
  for (const [env, message] of cases) {
    const result = await runMailModule(env);
    assert.notEqual(result.status, 0, JSON.stringify(env));
    assert.match(result.stderr, message);
  }
});
