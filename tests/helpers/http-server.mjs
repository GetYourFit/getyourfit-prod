import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function start(t, overrides = {}) {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), 'gyf-boundary-'));
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'production', GYF_MAIL_TRANSPORT: 'disabled',
      GYF_DATA_DIR: directory, GYF_PORT: String(port),
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      BETTER_AUTH_URL: '', GYF_ALLOWED_ORIGINS: '', GYF_TRUSTED_PROXIES: '', ...overrides,
    },
  });
  let error = '';
  server.stderr.on('data', (chunk) => { error += chunk; });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  function request({ method = 'GET', route = '/api/session', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const connection = http.request({ host: '127.0.0.1', port, path: route, method, headers }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          const body = response.headers['content-type']?.includes('application/json') ? JSON.parse(bytes.toString()) : bytes;
          resolve({ status: response.statusCode, headers: response.headers, body });
        });
      });
      connection.on('error', reject);
      connection.setTimeout(5000, () => connection.destroy(new Error('Request timed out.')));
      connection.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(server.exitCode, null, error);
    try {
      if ((await request()).status === 200) return { request, origin: `http://127.0.0.1:${port}` };
    } catch (failure) {
      if (failure.code !== 'ECONNREFUSED') throw failure;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('Production server did not start.');
}
