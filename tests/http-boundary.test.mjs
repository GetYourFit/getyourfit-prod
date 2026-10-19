import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const publicOrigin = 'https://app.getyourfit.co';

async function start(t, overrides = {}) {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), 'gyf-boundary-'));
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'],
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
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(text) }));
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

test('partial garment patches preserve other facts and provenance', async (t) => {
  const { request, origin } = await start(t);
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  const signedUp = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {
    name: 'Wearer', email: 'patches@example.test', password: randomBytes(32).toString('base64url'), adultConfirmed: true,
  } });
  assert.equal(signedUp.status, 200);
  headers.Cookie = signedUp.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  const image = (await sharp(new URL('./fixtures/top.jpg', import.meta.url).pathname)
    .resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
  const created = await request({ method: 'POST', route: '/api/wardrobe', headers, body: {
    consent: true, image, facts: { name: 'Tee', category: 'top', color: 'grey', size: 'M', fit: 'unknown',
      owned: true, available: true, weather: ['mild'], dressCode: ['casual'] },
  } });
  assert.equal(created.status, 201);
  const route = `/api/wardrobe/${created.body.id}`;
  let current = created.body;
  for (const body of [{ fit: 'fits' }, { name: 'Renamed tee' }, { weather: ['warm', 'cold'] }, { dressCode: ['formal'] },
    { available: false }, { category: 'one-piece' }, { color: 'olive' }, { size: 'L' }, { owned: true }]) {
    const updated = await request({ method: 'PATCH', route, headers, body });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.facts, { ...current.facts, ...body });
    for (const key of Object.keys(current.facts)) {
      if (key in body && JSON.stringify(current.facts[key]) !== JSON.stringify(body[key])) {
        assert.deepEqual(updated.body.provenance[key], { source: 'wearer-correction', modelVersion: null, confidence: 1, recordedAt: updated.body.updatedAt });
      } else assert.deepEqual(updated.body.provenance[key], current.provenance[key]);
    }
    current = updated.body;
  }
  for (const body of [{}, { unexpected: true }, { name: 'Ignored', unexpected: true }, { fit: 'invalid' }, { weather: [] }]) {
    assert.equal((await request({ method: 'PATCH', route, headers, body })).status, 400);
    const listed = await request({ route: '/api/wardrobe', headers });
    assert.deepEqual(listed.body, [current]);
  }
  const facts = { ...current.facts, name: 'Full update' };
  const full = await request({ method: 'PATCH', route, headers, body: facts });
  assert.equal(full.status, 200);
  assert.deepEqual(full.body.facts, facts);
  assert.equal(full.body.provenance.name.source, 'wearer-correction');
  for (const key of Object.keys(facts).filter((key) => key !== 'name')) assert.deepEqual(full.body.provenance[key], current.provenance[key]);
  assert.deepEqual((await request({ route: '/api/wardrobe', headers })).body, [full.body]);
});

test('loopback remains allowed and foreign Host, Origin, and originless writes are rejected', async (t) => {
  const { request, origin } = await start(t);
  assert.equal((await request()).status, 200);
  assert.equal((await request({ headers: { Origin: origin } })).status, 200);
  assert.equal((await request({ headers: { Host: 'foreign.example', 'X-Forwarded-Host': new URL(origin).host } })).status, 403);
  for (const Origin of ['https://foreign.example', 'null']) {
    assert.equal((await request({ headers: { Origin } })).status, 403);
  }
  assert.equal((await request({ method: 'POST', route: '/api/auth/request-password-reset' })).status, 403);
});

test('configured public Host and Origins are allowed without expanding the Host allowlist', async (t) => {
  const { request } = await start(t, { BETTER_AUTH_URL: publicOrigin, GYF_ALLOWED_ORIGINS: 'https://wardrobe.example' });
  for (const Origin of [publicOrigin, 'https://wardrobe.example']) {
    assert.equal((await request({ headers: { Host: 'app.getyourfit.co', Origin } })).status, 200);
    assert.equal((await request({ method: 'POST', route: '/api/auth/sign-up/email', headers: {
      Host: 'app.getyourfit.co', Origin, 'Content-Type': 'application/json',
    }, body: {} })).status, 400);
  }
  assert.equal((await request({ headers: { Host: 'wardrobe.example', Origin: publicOrigin } })).status, 403);
  assert.equal((await request({ headers: { Host: 'app.getyourfit.co', Origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await request({ method: 'POST', route: '/api/auth/sign-up/email', headers: { Host: 'app.getyourfit.co' }, body: {} })).status, 403);
});

test('public signup issues a secure private cookie and retains the account session without mail', async (t) => {
  const { request } = await start(t, { BETTER_AUTH_URL: publicOrigin });
  const headers = { Host: 'app.getyourfit.co', Origin: publicOrigin, 'Content-Type': 'application/json' };
  const signedUp = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {
    name: 'Wearer', email: `wearer-${randomBytes(8).toString('hex')}@example.test`,
    password: randomBytes(32).toString('base64url'), adultConfirmed: true,
  } });
  assert.equal(signedUp.status, 200);
  const cookies = signedUp.headers['set-cookie'];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('__Secure-gyf.session_token='));
  assert.ok(sessionCookie);
  const attributes = new Set(sessionCookie.split(';').slice(1).map((attribute) => attribute.trim()));
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(attributes.has(attribute));
  const session = await request({ headers: { Host: 'app.getyourfit.co', Cookie: sessionCookie.split(';')[0] } });
  assert.equal(session.body.signedIn, true);
  assert.equal(session.body.emailDeliveryMode, 'disabled');
});

async function rateLimit(request, origin, forwarded) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const headers = {
      Origin: origin, 'Content-Type': 'application/json',
      'X-Forwarded-For': forwarded(attempt), 'X-GYF-Client-IP': `203.0.113.${attempt}`,
      'CF-Connecting-IP': `203.0.113.${attempt}`,
    };
    const reset = await request({ method: 'POST', route: '/api/auth/request-password-reset', headers, body: {} });
    assert.equal(reset.status, attempt <= 3 ? 404 : 429, 'Application rate limit trusted a forged client address.');
    const signup = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {} });
    assert.equal(signup.status, attempt <= 5 ? 400 : 429, 'Better Auth rate limit trusted a forged client address.');
  }
}

test('untrusted senders cannot bypass either rate limiter with forged forwarding headers', async (t) => {
  const { request, origin } = await start(t);
  await rateLimit(request, origin, (attempt) => `198.51.100.${attempt}`);
});

test('configured proxies do not grant trust to a different immediate sender', async (t) => {
  const { request, origin } = await start(t, { GYF_TRUSTED_PROXIES: '192.0.2.4' });
  await rateLimit(request, origin, (attempt) => `198.51.100.${attempt}, 192.0.2.4`);
});

test('trusted ingress chains use the closest untrusted address, preserving separate client limits', async (t) => {
  const { request, origin } = await start(t, { GYF_TRUSTED_PROXIES: '127.0.0.1/32,192.0.2.4/32' });
  await rateLimit(request, origin, (attempt) => `203.0.113.${attempt}, 198.51.100.22, 192.0.2.4`);
  const secondClient = await request({ method: 'POST', route: '/api/auth/request-password-reset', headers: {
    Origin: origin, 'X-Forwarded-For': '198.51.100.23, 192.0.2.4',
  } });
  assert.equal(secondClient.status, 404, 'Different clients behind the ingress shared one limit.');
  const secondSignup = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers: {
    Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.23, 192.0.2.4',
  }, body: {} });
  assert.equal(secondSignup.status, 400);
  assert.equal((await request({ headers: { 'X-Forwarded-For': 'invalid, 192.0.2.4' } })).status, 400);
});

test('invalid public origins and proxy settings refuse startup before creating account data', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gyf-invalid-boundary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [setting, value] of [
    ['BETTER_AUTH_URL', 'http://app.getyourfit.co'],
    ['BETTER_AUTH_URL', 'https://app.getyourfit.co/path'],
    ['BETTER_AUTH_URL', 'https://app.getyourfit.co?query'],
    ['GYF_ALLOWED_ORIGINS', 'https://*.example'],
    ['GYF_ALLOWED_ORIGINS', 'null'],
    ['GYF_ALLOWED_ORIGINS', 'https://wardrobe.example/path'],
    ['GYF_TRUSTED_PROXIES', 'true'],
    ['GYF_TRUSTED_PROXIES', '1'],
    ['GYF_TRUSTED_PROXIES', '0.0.0.0/0'],
    ['GYF_TRUSTED_PROXIES', '127.0.0.1/33'],
  ]) {
    const dataDir = path.join(directory, 'data');
    const refused = spawnSync(process.execPath, ['server/index.mjs'], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000,
      env: {
        ...process.env, NODE_ENV: 'production', GYF_MAIL_TRANSPORT: 'disabled',
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), GYF_DATA_DIR: dataDir,
        BETTER_AUTH_URL: '', GYF_ALLOWED_ORIGINS: '', GYF_TRUSTED_PROXIES: '', [setting]: value,
      },
    });
    assert.notEqual(refused.status, 0, `${setting} accepted invalid configuration.`);
    assert.match(refused.stderr, new RegExp(setting));
    assert.equal(existsSync(dataDir), false, 'Invalid configuration created persistent account data.');
  }
});
