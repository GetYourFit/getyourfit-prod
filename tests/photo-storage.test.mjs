import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { startFakeStorage } from './support/fake-storage.mjs';
import { inspect, start } from './support/server.mjs';

const facts = { name: 'Tee', category: 'top', color: 'grey', size: 'M', fit: 'fits', owned: true, available: true, weather: ['mild'], dressCode: ['casual'] };
const image = (await sharp(new URL('./fixtures/top.jpg', import.meta.url).pathname).resize(96, 96, { fit: 'inside' }).jpeg().toBuffer()).toString('base64');

async function withStorage(t) {
  const storage = await startFakeStorage(t);
  const server = await start(t, { SUPABASE_URL: storage.url, SUPABASE_SECRET_KEY: storage.key }, { backend: 'postgres' });
  const wearers = [];
  async function wearer(label) {
    const headers = { Origin: server.origin, 'Content-Type': 'application/json' };
    const signedUp = await server.request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {
      name: label, email: `${label}-${randomBytes(6).toString('hex')}@example.test`, password: randomBytes(32).toString('base64url'), adultConfirmed: true } });
    assert.equal(signedUp.status, 200);
    const as = { ...headers, Cookie: signedUp.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ') };
    const person = { id: signedUp.body.user.id, as, call: (options) => server.request({ ...options, headers: as }),
      add: (changes = {}) => server.request({ method: 'POST', route: '/api/wardrobe', headers: as, body: { consent: true, image, facts: { ...facts, ...changes } } }) };
    wearers.push(person);
    return person;
  }
  return { storage, server, wearer };
}

test('photos go to a private bucket under the owner\'s folder and the row holds only the path', async (t) => {
  const { storage, server, wearer } = await withStorage(t);
  assert.equal(storage.buckets.get('garment-photos').public, false, 'The bucket must be private.');
  const owner = await wearer('owner');
  const created = await owner.add();
  assert.equal(created.status, 201);
  const path = `garment-photos/${owner.id}/${created.body.id}.jpg`;
  assert.ok(storage.objects.has(path), 'The photo was not uploaded under the account folder.');
  const [row] = await inspect(server, 'SELECT photo, photo_object FROM garments WHERE id = $1', [created.body.id]);
  assert.equal(row.photo, null, 'Photo bytes must not also be stored in the database.');
  assert.equal(row.photo_object, `${owner.id}/${created.body.id}.jpg`);
  const photo = await server.request({ route: created.body.photoUrl, headers: owner.as });
  assert.equal(photo.status, 200);
  assert.ok(storage.log.every((entry) => !entry.path.includes('/public/')), 'Public object URLs must never be used.');
  const exported = await owner.call({ route: '/api/data/export' });
  assert.equal(Buffer.from(exported.body.wardrobe[0].photo.base64, 'base64').equals(storage.objects.get(path)), true);
});

test('another wearer, or nobody, cannot reach a stored photo, and the server never asks Storage for it', async (t) => {
  const { storage, server, wearer } = await withStorage(t);
  const [owner, other] = [await wearer('owner'), await wearer('other')];
  const garment = (await owner.add()).body;
  const before = storage.log.length;
  assert.equal((await other.call({ route: garment.photoUrl })).status, 404);
  assert.equal((await server.request({ route: garment.photoUrl, headers: { Origin: server.origin } })).status, 401);
  assert.equal((await other.call({ method: 'DELETE', route: `/api/wardrobe/${garment.id}` })).status, 404);
  assert.deepEqual(storage.log.slice(before), [], 'A request for someone else\'s photo reached Storage.');
  assert.equal(storage.objects.size, 1);
});

test('removing a garment or an account erases its stored photos, including strays', async (t) => {
  const { storage, server, wearer } = await withStorage(t);
  const owner = await wearer('owner');
  const survivor = await wearer('survivor');
  const [first, second] = [(await owner.add({ name: 'One' })).body, (await owner.add({ name: 'Two' })).body];
  const kept = (await survivor.add()).body;
  storage.objects.set(`garment-photos/${owner.id}/stray.jpg`, Buffer.from('left behind by a crashed upload'));
  assert.equal((await owner.call({ method: 'DELETE', route: `/api/wardrobe/${first.id}` })).status, 200);
  assert.equal(storage.objects.has(`garment-photos/${owner.id}/${first.id}.jpg`), false);
  assert.equal((await owner.call({ method: 'DELETE', route: '/api/data', body: { confirm: 'delete my account' } })).status, 200);
  assert.deepEqual([...storage.objects.keys()], [`garment-photos/${survivor.id}/${kept.id}.jpg`], `Photos of the deleted account remained (${second.id}).`);
  assert.equal(Number((await inspect(server, 'SELECT count(*) AS count FROM garments'))[0].count), 1);
});

test('a Storage outage never loses or half-saves a garment', async (t) => {
  const { storage, server, wearer } = await withStorage(t);
  const owner = await wearer('owner');
  const garment = (await owner.add()).body;
  storage.state.failing = true;
  assert.equal((await owner.add({ name: 'Second' })).status, 503);
  assert.equal((await owner.call({ route: garment.photoUrl })).status, 503);
  assert.equal((await owner.call({ method: 'DELETE', route: `/api/wardrobe/${garment.id}` })).status, 503);
  assert.equal((await owner.call({ method: 'DELETE', route: '/api/data', body: { confirm: 'delete my account' } })).status, 503);
  storage.state.failing = false;
  assert.equal(Number((await inspect(server, 'SELECT count(*) AS count FROM garments'))[0].count), 1, 'A failed upload or delete changed the garments.');
  assert.equal((await owner.call({ route: '/api/session' })).body.signedIn, true, 'A failed account deletion removed the account.');
  assert.equal((await owner.call({ method: 'DELETE', route: `/api/wardrobe/${garment.id}` })).status, 200);
});

test('storage settings are validated at startup', async () => {
  const run = (env) => spawnSync(process.execPath, ['server/index.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, NODE_ENV: 'production', BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'), GYF_PORT: '45999', ...env } });
  assert.match(run({ DATABASE_URL: '', SUPABASE_URL: 'https://example.supabase.co' }).stderr, /together/);
  assert.match(run({ DATABASE_URL: '', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }).stderr, /requires the Postgres backend/);
  assert.match(run({ DATABASE_URL: process.env.GYF_TEST_DATABASE_URL, SUPABASE_URL: 'http://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }).stderr, /HTTPS/);
});
