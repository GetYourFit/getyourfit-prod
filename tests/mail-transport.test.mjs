import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
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

async function mailApi(respond = () => 202) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      response.writeHead(respond(requests.length), { 'Content-Type': 'application/json' }).end('{"error":"detail that must not be surfaced"}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, url: `http://127.0.0.1:${server.address().port}/v1/send`, close: () => new Promise((resolve) => server.close(resolve)) };
}

const httpEnv = { GYF_MAIL_TRANSPORT: 'http', MAIL_API_TOKEN: 'test-token-value', MAIL_FROM: 'GetYourFit <wardrobe@example.test>' };

test('mail stays disabled by default and refuses to send', async () => {
  const result = await runMailModule({}, 'console.log(JSON.stringify({ enabled: mail.emailEnabled, mode: mail.emailDeliveryMode }));\nawait mail.sendMail({ to: "a@example.test", subject: "s", text: "t" }).catch((error) => console.log(error.message));');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['{"enabled":false,"mode":"disabled"}', 'Email delivery is disabled.']);
});

test('http transport posts the message as JSON with a bearer token', async (t) => {
  const api = await mailApi();
  t.after(api.close);
  const result = await runMailModule({ ...httpEnv, MAIL_API_URL: api.url },
    'await mail.sendMail({ to: "Wearer@Example.test", subject: "Reset", text: "link" }); console.log(mail.emailDeliveryMode);');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'http');
  assert.equal(api.requests.length, 1);
  const [request] = api.requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/v1/send');
  assert.equal(request.headers.authorization, 'Bearer test-token-value');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual(request.body, { from: 'GetYourFit <wardrobe@example.test>', to: ['Wearer@Example.test'], subject: 'Reset', text: 'link' });
});

test('http transport rejects provider refusals without surfacing the response body or token', async (t) => {
  const api = await mailApi(() => 422);
  t.after(api.close);
  const result = await runMailModule({ ...httpEnv, MAIL_API_URL: api.url },
    'await mail.sendMail({ to: "a@example.test", subject: "s", text: "t" }).catch((error) => console.log(error.message));');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'The mail API refused the message with status 422.');
});

test('invalid mail configuration stops startup with a clear message', async () => {
  const cases = [
    [{ GYF_MAIL_TRANSPORT: 'carrier-pigeon' }, /must be disabled, local, smtp or http/],
    [{ ...httpEnv }, /MAIL_API_URL must contain an absolute HTTPS URL/],
    [{ ...httpEnv, MAIL_API_URL: 'http://mail.example.test/send' }, /HTTPS URL \(HTTP is allowed only for loopback\)/],
    [{ ...httpEnv, MAIL_API_URL: 'https://user:pass@mail.example.test/send' }, /without credentials/],
    [{ ...httpEnv, MAIL_API_URL: 'https://mail.example.test/send', MAIL_API_TOKEN: '' }, /MAIL_API_TOKEN is required/],
    [{ ...httpEnv, MAIL_API_URL: 'https://mail.example.test/send', MAIL_FROM: '' }, /MAIL_FROM is required/],
    [{ GYF_MAIL_TRANSPORT: 'smtp' }, /SMTP_HOST and SMTP_FROM are required/],
  ];
  for (const [env, message] of cases) {
    const result = await runMailModule(env);
    assert.notEqual(result.status, 0, JSON.stringify(env));
    assert.match(result.stderr, message);
    assert.ok(!result.stderr.includes('test-token-value'), 'A startup error printed the mail token.');
  }
});

test('a complete HTTPS configuration starts', async () => {
  const result = await runMailModule({ ...httpEnv, MAIL_API_URL: 'https://mail.example.test/v1/send' }, 'console.log(mail.emailEnabled, mail.emailDeliveryMode);');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'true http');
});
