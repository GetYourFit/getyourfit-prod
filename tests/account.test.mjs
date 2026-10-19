import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { backends, inspect, start } from './support/server.mjs';

const facts = { name: 'Tee', category: 'top', color: 'grey', size: 'M', fit: 'fits', owned: true, available: true, weather: ['mild'], dressCode: ['casual'] };
const image = (await sharp(new URL('./fixtures/top.jpg', import.meta.url).pathname).resize(96, 96, { fit: 'inside' }).jpeg().toBuffer()).toString('base64');

async function signUp(server, label = 'wearer') {
  const headers = { Origin: server.origin, 'Content-Type': 'application/json' };
  const email = `${label}-${randomBytes(6).toString('hex')}@example.test`;
  const password = randomBytes(32).toString('base64url');
  const signedUp = await server.request({ method: 'POST', route: '/api/auth/sign-up/email', headers, body: {
    name: label, email, password, adultConfirmed: true } });
  assert.equal(signedUp.status, 200);
  const cookie = signedUp.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  const as = { ...headers, Cookie: cookie };
  const add = (changes = {}, timeout = 5000) => server.request({ method: 'POST', route: '/api/wardrobe', headers: as, timeout, body: { consent: true, image, facts: { ...facts, ...changes } } });
  return { email, password, headers: as, add, call: (options) => server.request({ ...options, headers: as }) };
}

for (const backend of backends) {
  test(`one wearer cannot read, change, delete, correct or list another wearer's garments [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const [owner, other] = [await signUp(server, 'owner'), await signUp(server, 'other')];
    const garment = (await owner.add()).body;
    const context = { occasion: 'Lunch', weather: 'mild', dressCode: 'casual' };
    assert.equal((await other.call({ route: `/api/wardrobe/${garment.id}/photo` })).status, 404);
    assert.equal((await other.call({ method: 'PATCH', route: `/api/wardrobe/${garment.id}`, body: { name: 'Taken' } })).status, 404);
    assert.equal((await other.call({ method: 'DELETE', route: `/api/wardrobe/${garment.id}` })).status, 404);
    assert.equal((await other.call({ method: 'POST', route: '/api/wardrobe/correction', body: { context, garmentId: garment.id, excluded: true } })).status, 404);
    assert.deepEqual((await other.call({ route: '/api/wardrobe' })).body, []);
    assert.equal((await owner.call({ route: '/api/wardrobe' })).body.length, 1);
    assert.equal((await server.request({ route: `/api/wardrobe/${garment.id}/photo`, headers: { Origin: server.origin } })).status, 401);
  });
}

for (const backend of backends) {
  test(`the 50 garment limit holds under concurrent uploads [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const wearer = await signUp(server);
    const results = await Promise.all(Array.from({ length: 56 }, (_, index) => wearer.add({ name: `Tee ${index}` }, 30_000)));
    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 201).length, 50);
    assert.equal(statuses.filter((status) => status === 409).length, 6);
    assert.equal((await wearer.call({ route: '/api/wardrobe' })).body.length, 50);
  });
}

for (const backend of backends) {
  test(`retrying a visitor save retains its chosen look exactly once and stays private [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const owner = await signUp(server, 'owner');
    const other = await signUp(server, 'other');
    const input = { occasion: 'Dinner', outfitType: 'separates', budget: 0, currency: 'INR', weather: 'mild', dressCode: 'casual', mustHave: '', ownedRoles: [], selectedLook: 3 };
    const requestId = randomUUID();
    const save = (wearer) => wearer.call({ method: 'POST', route: '/api/wardrobe/starter-plans', body: { ...input, requestId } });
    const responses = await Promise.all([save(owner), save(owner), save(owner)]);
    for (const response of responses) {
      assert.equal(response.status, 201);
      assert.equal(response.body.id, requestId);
      assert.deepEqual(response.body.input, input);
      assert.deepEqual(response.body, responses[0].body);
    }
    assert.deepEqual((await owner.call({ route: '/api/wardrobe/starter-plans' })).body, [responses[0].body]);
    assert.notEqual((await save(other)).status, 201);
    assert.deepEqual((await other.call({ route: '/api/wardrobe/starter-plans' })).body, []);
    const exported = await owner.call({ route: '/api/data/export' });
    assert.equal(exported.body.starterPlans[0].input.selectedLook, 3);
    assert.deepEqual((await owner.call({ route: '/api/wardrobe' })).body, []);
  });

  test(`outfit corrections, starter plans and export round-trip through the database [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const wearer = await signUp(server);
    const items = [];
    for (const [category, name] of [['top', 'Tee'], ['bottom', 'Chinos'], ['footwear', 'Trainers']]) items.push((await wearer.add({ category, name })).body);
    const context = { occasion: 'Lunch', weather: 'mild', dressCode: 'casual' };
    const outfit = await wearer.call({ method: 'POST', route: '/api/wardrobe/outfit', body: context });
    assert.equal(outfit.body.kind, 'complete');
    assert.equal((await wearer.call({ method: 'POST', route: '/api/wardrobe/correction', body: { context, garmentId: items[0].id, excluded: true } })).status, 200);
    assert.equal((await wearer.call({ method: 'POST', route: '/api/wardrobe/correction', body: { context, garmentId: items[0].id, excluded: true } })).status, 200, 'Repeating a correction must be idempotent.');
    assert.notEqual((await wearer.call({ method: 'POST', route: '/api/wardrobe/outfit', body: context })).body.kind, 'complete');

    const input = { occasion: 'Interview', outfitType: 'separates', budget: 5000, currency: 'INR', weather: 'mild', dressCode: 'smart-casual', mustHave: '', ownedRoles: [] };
    const plan = await wearer.call({ method: 'POST', route: '/api/wardrobe/starter-plans', body: input });
    assert.equal(plan.status, 201);
    const replaced = await wearer.call({ method: 'PATCH', route: `/api/wardrobe/starter-plans/${plan.body.id}`, body: { action: 'replace-plan', input: { ...input, occasion: 'Wedding' } } });
    assert.equal(replaced.status, 201);
    const plans = (await wearer.call({ route: '/api/wardrobe/starter-plans' })).body;
    assert.deepEqual(plans.map((entry) => entry.status).sort(), ['active', 'replaced']);
    assert.equal((await wearer.call({ method: 'PATCH', route: `/api/wardrobe/starter-plans/${plan.body.id}`, body: { action: 'reject' } })).status, 409);

    const exported = await wearer.call({ route: '/api/data/export' });
    assert.equal(exported.status, 200);
    assert.equal(exported.body.wardrobe.length, 3);
    assert.equal(exported.body.outfitCorrections.length, 1);
    assert.equal(exported.body.outfitCorrections[0].garmentId, items[0].id);
    assert.equal(exported.body.starterPlans.length, 2);
    assert.equal(Buffer.from(exported.body.wardrobe[0].photo.base64, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
    assert.equal(exported.body.account.email, wearer.email);
    assert.equal('password' in exported.body.account, false);
  });
}

for (const backend of backends) {
  test(`sign out everywhere ends every session, and deleting the account erases its rows [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const wearer = await signUp(server);
    await wearer.add();
    const headers = { Origin: server.origin, 'Content-Type': 'application/json' };
    const second = await server.request({ method: 'POST', route: '/api/auth/sign-in/email', headers, body: { email: wearer.email, password: wearer.password } });
    assert.equal(second.status, 200);
    const secondCookie = second.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
    assert.equal((await server.request({ headers: { ...headers, Cookie: secondCookie } })).body.signedIn, true);
    assert.equal((await wearer.call({ method: 'POST', route: '/api/auth/sign-out-everywhere', body: {} })).status, 200);
    assert.equal((await wearer.call({ route: '/api/session' })).body.signedIn, false);
    assert.equal((await server.request({ headers: { ...headers, Cookie: secondCookie } })).body.signedIn, false, 'The second session survived.');

    const doomed = await signUp(server, 'doomed');
    await doomed.add();
    assert.equal((await doomed.call({ method: 'DELETE', route: '/api/data', body: { confirm: 'wrong' } })).status, 400);
    const erased = await doomed.call({ method: 'DELETE', route: '/api/data', body: { confirm: 'delete my account' } });
    assert.equal(erased.status, 200, JSON.stringify(erased.body));
    const count = async (text, values) => Number((await inspect(server, text, values))[0].count);
    for (const table of ['garments', 'outfit_exclusions', 'starter_plans']) {
      assert.equal(await count(`SELECT count(*) AS count FROM ${table} WHERE user_id NOT IN (SELECT id FROM "user" WHERE email = $1)`, [wearer.email]), 0, `${table} kept rows of the deleted account`);
    }
    assert.equal(await count('SELECT count(*) AS count FROM "user" WHERE email = $1', [doomed.email]), 0);
    assert.ok(await count("SELECT count(*) AS count FROM auth_audit WHERE action = 'account-deleted'") >= 1);
  });
}
