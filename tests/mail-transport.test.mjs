import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

test('mail stays disabled by default and refuses to send', async () => {
  const result = await runMailModule({}, 'console.log(JSON.stringify({ enabled: mail.emailEnabled, mode: mail.emailDeliveryMode }));\nawait mail.sendMail({ to: "a@example.test", subject: "s", text: "t" }).catch((error) => console.log(error.message));');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['{"enabled":false,"mode":"disabled"}', 'Email delivery is disabled.']);
});

test('invalid mail configuration stops startup with a clear message', async () => {
  const cases = [
    [{ GYF_MAIL_TRANSPORT: 'carrier-pigeon' }, /must be disabled, local or smtp/],
    [{ GYF_MAIL_TRANSPORT: 'http' }, /must be disabled, local or smtp/],
    [{ GYF_MAIL_TRANSPORT: 'smtp' }, /SMTP_HOST and SMTP_FROM are required/],
  ];
  for (const [env, message] of cases) {
    const result = await runMailModule(env);
    assert.notEqual(result.status, 0, JSON.stringify(env));
    assert.match(result.stderr, message);
  }
});
