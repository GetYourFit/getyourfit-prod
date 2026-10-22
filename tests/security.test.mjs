import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { start } from './support/server.mjs';

async function account(request, origin, label) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  const result = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {
    name: label, email: `${label}@example.test`, password: randomBytes(32).toString('base64url'), adultConfirmed: true,
  } });
  assert.equal(result.status, 200);
  headers.Cookie = result.headers['set-cookie'].map((cookie) => cookie.split(';')[0]).join('; ');
  return headers;
}
const facts = { name: 'Private tee', category: 'top', color: 'grey', size: 'M', fit: 'fits', owned: true,
  available: true, weather: ['mild'], dressCode: ['casual'] };
const context = { occasion: 'Private occasion', weather: 'mild', dressCode: 'casual' };
const input = { ...context, outfitType: 'separates', budget: 300, currency: 'USD', mustHave: '', ownedRoles: [] };

test('production security headers restrict browser capabilities and framing', async (t) => {
  const { origin } = await start(t);
  const routes = [
    { route: '/' }, { route: '/sign-in' }, { route: '/api/session' }, { route: '/api/unknown' },
    ...['/index.html', '/sign-in'].map((route) => ({ route, headers: { Range: 'bytes=999999999999-' } })),
  ];
  for (const method of ['GET', 'HEAD']) for (const { route, headers: requestHeaders } of routes) {
    const response = await fetch(`${origin}${route}`, { method, headers: requestHeaders });
    const headers = Object.fromEntries(response.headers);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(headers['content-security-policy'], /object-src 'none'/);
    assert.match(headers['strict-transport-security'], /max-age=31536000; includeSubDomains/);
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.equal(headers['permissions-policy'], 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (requestHeaders?.Range) {
      assert.equal(response.status, 500);
      if (method === 'GET') assert.deepEqual(await response.json(), { error: 'Something went wrong on our side. Try again.' });
    }
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
});

test('upload budget applies before parsing and cannot be bypassed by rotating spoofed IPs or upload routes', async (t) => {
  const { request, origin } = await start(t);
  const headers = await account(request, origin, 'upload-budget');
  for (let i = 0; i < 11; i += 1) {
    const result = await request({ method: 'POST', route: i % 2 ? '/api/wardrobe/review' : '/api/wardrobe',
      headers: { ...headers, 'X-Forwarded-For': `203.0.113.${i}`, 'X-GYF-Client-IP': `203.0.113.${i}` },
      body: i < 10 ? {} : { image: 'x'.repeat(2_100_000) } });
    assert.equal(result.status, i < 10 ? 400 : 429);
    if (i === 10) assert.ok(Number(result.headers['retry-after']) > 0);
  }
});

test('signup early rejections and failed logins consume abuse budgets', async (t) => {
  const { request, origin } = await start(t);
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  for (let i = 0; i < 6; i += 1) {
    const result = await request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {} });
    assert.equal(result.status, i < 5 ? 400 : 429);
  }
  for (let i = 0; i < 6; i += 1) {
    const result = await request({ method: 'POST', route: '/api/auth/sign-in/email', headers,
      body: { email: 'missing@example.test', password: randomBytes(32).toString('base64url') } });
    assert.equal(result.status, i < 5 ? 401 : 429);
  }
});

test('plan writes share a finite budget across new plans and updates', async (t) => {
  const { request, origin } = await start(t);
  const headers = await account(request, origin, 'plan-budget');
  for (let i = 0; i < 31; i += 1) {
    const result = await request({ method: 'POST', route: '/api/wardrobe/starter-plans', headers, body: {} });
    assert.equal(result.status, i < 30 ? 400 : 429);
  }
});

test('every private garment, photo, correction, export and plan route rejects cross-account access', async (t) => {
  const { request, origin } = await start(t);
  const owner = await account(request, origin, 'owner');
  const attacker = await account(request, origin, 'attacker');
  const image = (await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).jpeg().toBuffer()).toString('base64');
  const created = await request({ method: 'POST', route: '/api/wardrobe', headers: owner, body: { facts, consent: true, image } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const plan = await request({ method: 'POST', route: '/api/wardrobe/starter-plans', headers: owner, body: input });
  assert.equal(plan.status, 201);
  const routes = [
    ['GET', `/api/wardrobe/${id}/photo`],
    ['PATCH', `/api/wardrobe/${id}`, { name: 'Stolen' }],
    ['DELETE', `/api/wardrobe/${id}`],
    ['POST', '/api/wardrobe/correction', { context, garmentId: id, excluded: true }],
    ...[{ action: 'reject' }, { action: 'replace-plan', input }, { action: 'confirm-owned', role: 'top' },
      { action: 'replace-need', role: 'top', need: 'Stolen' }].map((body) => ['PATCH', `/api/wardrobe/starter-plans/${plan.body.id}`, body]),
  ];
  for (const [method, route, body] of routes) {
    assert.equal((await request({ method, route, headers: attacker, body })).status, 404, `${method} ${route}`);
    assert.equal((await request({ method, route, headers: { Origin: origin, 'Content-Type': 'application/json' }, body })).status, 401);
  }
  for (const route of ['/api/wardrobe', '/api/wardrobe/starter-plans']) {
    assert.deepEqual((await request({ route, headers: attacker })).body, []);
    assert.equal((await request({ route })).status, 401);
  }
  const outfit = await request({ method: 'POST', route: '/api/wardrobe/outfit', headers: attacker, body: context });
  assert.equal(outfit.body.kind, 'incomplete');
  const exported = await request({ route: '/api/data/export', headers: attacker });
  assert.deepEqual(exported.body.wardrobe, []);
  assert.deepEqual(exported.body.starterPlans, []);
  assert.deepEqual(exported.body.outfitCorrections, []);
  assert.equal((await request({ route: '/api/data/export' })).status, 401);
  for (const route of ['/api/wardrobe', '/api/wardrobe/review', '/api/wardrobe/outfit', '/api/wardrobe/starter-plans']) {
    assert.equal((await request({ method: 'POST', route, headers: { Origin: origin }, body: {} })).status, 401);
  }
  assert.deepEqual((await request({ route: '/api/wardrobe', headers: owner })).body, [created.body]);
  assert.deepEqual((await request({ route: '/api/wardrobe/starter-plans', headers: owner })).body, [plan.body]);
  assert.equal((await fetch(`${origin}/api/wardrobe/${id}/photo`, { headers: owner })).status, 200);
});

test('uploads sniff bytes, reject oversize and bomb images, and strip stored metadata', async (t) => {
  const { request, origin } = await start(t);
  const headers = await account(request, origin, 'photo-security');
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'blue' } })
    .withMetadata({ exif: { IFD0: { Artist: 'Private photographer', Copyright: 'Private location' } } }).png().toBuffer();
  const bomb = await sharp({ create: { width: 4001, height: 4001, channels: 3, background: 'red' } }).png().toBuffer();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  for (const bytes of [svg, Buffer.from('not an image'), Buffer.alloc(1_000_001), bomb, png.subarray(0, 30)]) {
    const refused = await request({ method: 'POST', route: '/api/wardrobe', headers,
      body: { facts, consent: true, image: bytes.toString('base64') } });
    assert.equal(refused.status, 400);
  }
  const created = await request({ method: 'POST', route: '/api/wardrobe', headers, body: { facts, consent: true, image: png.toString('base64') } });
  assert.equal(created.status, 201);
  const stored = await fetch(`${origin}${created.body.photoUrl}`, { headers });
  assert.equal(stored.status, 200);
  const bytes = Buffer.from(await stored.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'jpeg');
  for (const field of ['exif', 'xmp', 'iptc', 'icc']) assert.equal(metadata[field], undefined);
  const exported = await request({ route: '/api/data/export', headers });
  assert.equal(exported.body.wardrobe[0].photo.base64, bytes.toString('base64'));
});

test('sign-out everywhere invalidates captured session cookies', async (t) => {
  const { request, origin } = await start(t);
  const headers = await account(request, origin, 'revocation');
  assert.equal((await request({ route: '/api/session', headers })).body.signedIn, true);
  assert.equal((await request({ method: 'POST', route: '/api/auth/sign-out-everywhere', headers, body: {} })).status, 200);
  assert.equal((await request({ route: '/api/session', headers })).body.signedIn, false);
  assert.equal((await request({ route: '/api/wardrobe', headers })).status, 401);
});
