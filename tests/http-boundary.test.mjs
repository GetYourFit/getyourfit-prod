import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import { createTestDatabase } from './support/database.mjs';
import { backends, start } from './support/server.mjs';

const publicOrigin = 'https://app.getyourfit.co';

for (const backend of backends) {
  test(`malformed JSON and oversized bodies never disclose request data in stderr [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const markers = [];
    const expected = [];
    for (const route of ['/api/auth/sign-in/email', '/api/funnel']) {
      for (const field of ['p', 'password', 'email']) {
        const marker = `S${randomBytes(3).toString('hex')}`;
        markers.push(marker);
        const response = await fetch(`${server.origin}${route}`, {
          method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: `{"${field}":${marker}}`,
        });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: 'Something went wrong on our side. Try again.' });
        expected.push({ type: 'entity.parse.failed', status: 400 });
      }
      const marker = randomBytes(16).toString('hex');
      markers.push(marker);
      const response = await fetch(`${server.origin}${route}`, {
        method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: marker, padding: 'x'.repeat(route === '/api/funnel' ? 1100 : 33_000) }),
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Something went wrong on our side. Try again.' });
      expected.push({ type: 'entity.too.large', status: 413 });
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((server.stderr.match(/^request failed: .*\n/gm) ?? []).length >= expected.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (const marker of markers) assert.equal(server.stderr.includes(marker), false, 'Submitted sensitive data reached stderr.');
    const records = server.stderr.split('\n').filter((line) => line.startsWith('request failed: '))
      .map((line) => JSON.parse(line.slice('request failed: '.length)));
    assert.deepEqual(records, expected);
    assert.equal((await server.request()).status, 200);
    assert.equal((await server.request({ method: 'POST', route: '/api/funnel',
      headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: { event: 'plan_opened' } })).status, 204);
  });
}

for (const backend of backends) {
  test(`partial garment patches preserve other facts and provenance [${backend}]`, async (t) => {
    const { request, origin } = await start(t, {}, { backend });
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
}

test('health check answers from the database without a session', async (t) => {
  const { request, origin } = await start(t);
  const health = await request({ route: '/api/health', headers: { Origin: origin } });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
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

for (const backend of backends) {
  test(`public signup issues a secure private cookie and retains the account session without email confirmation [${backend}]`, async (t) => {
    const { request } = await start(t, { BETTER_AUTH_URL: publicOrigin }, { backend });
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
    assert.deepEqual(session.body, { signedIn: true, email: session.body.email, twoFactorEnabled: false });
  });
}

for (const backend of backends) {
  test(`email reset is unavailable and password changes require the current password [${backend}]`, async (t) => {
    const { request, origin } = await start(t, {}, { backend });
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    const email = `wearer-${randomBytes(8).toString('hex')}@example.test`;
    const password = randomBytes(32).toString('base64url');
    const signedUp = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: { name: 'Wearer', email, password, adultConfirmed: true } });
    assert.equal(signedUp.status, 200);
    assert.equal(typeof signedUp.body.token, 'string', 'Signup must sign the wearer in without confirming email.');
    const duplicate = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: { name: 'Taker', email, password: randomBytes(32).toString('base64url'), adultConfirmed: true } });
    assert.notEqual(duplicate.status, 200, 'A second signup for a registered address must not create a session.');
    assert.equal(duplicate.headers['set-cookie'], undefined);
    for (const route of ['/api/auth/request-password-reset', '/api/auth/forget-password', '/api/auth/reset-password', '/api/auth/send-verification-email']) {
      const refused = await request({ method: 'POST', route, headers, body: { email, token: 'x', newPassword: password } });
      assert.equal(refused.status, 503, route);
      assert.equal(refused.body.code, 'EMAIL_NOT_AVAILABLE', route);
      assert.match(refused.body.message, /Changing your password from Account requires your current password/);
      assert.match(refused.body.message, /A forgotten password cannot be recovered until email reset is connected, even if you are signed in/);
    }
    assert.equal((await request({ route: '/api/auth/verify-email?token=x', headers: { Origin: origin } })).status, 404);
    const cookie = signedUp.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
    const newPassword = randomBytes(32).toString('base64url');
    const wrong = await request({ method: 'POST', route: '/api/auth/change-password', headers: { ...headers, Cookie: cookie },
      body: { currentPassword: randomBytes(32).toString('base64url'), newPassword, revokeOtherSessions: true } });
    assert.notEqual(wrong.status, 200, 'A wrong current password changed the password.');
    const changed = await request({ method: 'POST', route: '/api/auth/change-password', headers: { ...headers, Cookie: cookie },
      body: { currentPassword: password, newPassword, revokeOtherSessions: true } });
    assert.equal(changed.status, 200);
    assert.notEqual((await request({ method: 'POST', route: '/api/auth/sign-in/email', headers, body: { email, password } })).status, 200, 'The old password still works.');
    assert.equal((await request({ method: 'POST', route: '/api/auth/sign-in/email', headers, body: { email, password: newPassword } })).status, 200);
  });
}

async function rateLimit(request, origin, forwarded) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const headers = {
      Origin: origin, 'Content-Type': 'application/json',
      'X-Forwarded-For': forwarded(attempt), 'X-GYF-Client-IP': `203.0.113.${attempt}`,
      'CF-Connecting-IP': `203.0.113.${attempt}`,
    };
    for (const route of ['/api/auth/sign-up/email', '/api/auth/sign-in/email']) {
      const response = await request({ method: 'POST', route, headers, body: {} });
      assert.equal(response.status, attempt <= 5 ? 400 : 429, `Better Auth rate limit trusted a forged client address on ${route}.`);
    }
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
  const secondSignup = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers: {
    Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.23, 192.0.2.4',
  }, body: {} });
  assert.equal(secondSignup.status, 400);
  assert.equal((await request({ headers: { 'X-Forwarded-For': 'invalid, 192.0.2.4' } })).status, 400);
});

test('invalid public origins and proxy settings refuse startup before creating account data', async (t) => {
  const database = await createTestDatabase();
  const dataDir = path.join(await mkdtemp(path.join(tmpdir(), 'gyf-invalid-boundary-')), 'data');
  t.after(async () => { await database.drop(); await rm(path.dirname(dataDir), { recursive: true, force: true }); });
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
    const refused = spawnSync(process.execPath, ['server/index.mjs'], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000,
      env: {
        ...process.env, NODE_ENV: 'production', DATABASE_URL: '', GYF_DATA_DIR: dataDir,
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
        BETTER_AUTH_URL: '', GYF_ALLOWED_ORIGINS: '', GYF_TRUSTED_PROXIES: '', [setting]: value,
      },
    });
    assert.notEqual(refused.status, 0, `${setting} accepted invalid configuration.`);
    assert.match(refused.stderr, new RegExp(setting));
    assert.equal(existsSync(dataDir), false, 'Invalid configuration created persistent account data.');
    const postgres = spawnSync(process.execPath, ['server/index.mjs'], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000,
      env: {
        ...process.env, NODE_ENV: 'production', DATABASE_URL: database.url, GYF_DATA_DIR: dataDir,
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
        BETTER_AUTH_URL: '', GYF_ALLOWED_ORIGINS: '', GYF_TRUSTED_PROXIES: '', [setting]: value,
      },
    });
    assert.notEqual(postgres.status, 0, `${setting} accepted invalid configuration on Postgres.`);
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const tables = (await client.query("SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].count;
    await client.end();
    assert.equal(tables, '0', 'Invalid configuration created account data.');
  }
});
