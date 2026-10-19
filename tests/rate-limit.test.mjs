import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { rateLimit } from '../server/rate-limit.mjs';

test('full counter storage fails closed without evicting an active attacker and recovers after expiry', async (t) => {
  let time = 1_000;
  const app = express();
  app.use(rateLimit({ max: 2, maxKeys: 2, windowMs: 1_000, key: (request) => request.path, now: () => time }));
  app.use((_request, response) => response.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const get = (route) => fetch(`http://127.0.0.1:${server.address().port}${route}`);
  assert.equal((await get('/a')).status, 204);
  assert.equal((await get('/a')).status, 204);
  assert.equal((await get('/b')).status, 204);
  assert.equal((await get('/c')).status, 429);
  const blocked = await get('/a');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '1');
  time = 2_000;
  assert.equal((await get('/c')).status, 204);
  assert.equal((await get('/a')).status, 204);
  assert.equal((await get('/b')).status, 429);
});
