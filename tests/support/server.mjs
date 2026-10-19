import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { createTestDatabase } from './database.mjs';

// Starts the production server on a free port against its own database; both are removed when the test ends.
export async function start(t, overrides = {}) {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const database = await createTestDatabase();
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'production', DATABASE_URL: database.url, GYF_PORT: String(port),
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
    await database.drop();
  });
  function request({ method = 'GET', route = '/api/session', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const sized = payload === undefined ? headers : { ...headers, 'Content-Length': Buffer.byteLength(payload) };
      const connection = http.request({ host: '127.0.0.1', port, path: route, method, headers: sized }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : null }));
      });
      connection.on('error', reject);
      connection.setTimeout(5000, () => connection.destroy(new Error('Request timed out.')));
      connection.end(payload);
    });
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(server.exitCode, null, error);
    try {
      if ((await request()).status === 200) return { request, origin: `http://127.0.0.1:${port}`, database };
    } catch (failure) {
      if (failure.code !== 'ECONNREFUSED') throw failure;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('Production server did not start.');
}

