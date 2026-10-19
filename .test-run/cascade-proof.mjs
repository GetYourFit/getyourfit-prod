import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { start } from '../tests/support/server.mjs';
const evidence = [];
for (const backend of ['sqlite', 'postgres']) {
  const cleanup = [];
  try {
    const server = await start({ after: fn => cleanup.push(fn) }, {}, { backend });
    const email = `cascade-${randomBytes(10).toString('hex')}@example.test`;
    const signup = await server.request({ method: 'POST', route: '/api/auth/sign-up/email', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: { name: 'Cascade proof', email, password: randomBytes(32).toString('base64url'), adultConfirmed: true } });
    assert.equal(signup.status, 200);
    const headers = { Origin: server.origin, 'Content-Type': 'application/json', Cookie: signup.headers['set-cookie'].map(x => x.split(';')[0]).join('; ') };
    const call = options => server.request({ ...options, headers });
    const [{ id: ownerId }] = await server.store.query('SELECT id FROM "user" WHERE email = $1', [email]);
    const photo = await sharp('tests/fixtures/top.jpg').resize(1200,1200,{ fit: 'inside' }).jpeg().toBuffer();
    const garment = await call({ method: 'POST', route: '/api/wardrobe', body: { consent: true, image: photo.toString('base64'), facts: { name: 'Licensed real top', category: 'top', color: 'grey', size: 'M', fit: 'fits', owned: true, available: true, weather: ['mild'], dressCode: ['casual'] } } });
    assert.equal(garment.status, 201);
    const corrected = await call({ method: 'POST', route: '/api/wardrobe/correction', body: { context: { occasion: 'Lunch', weather: 'mild', dressCode: 'casual' }, garmentId: garment.body.id, excluded: true } });
    assert.equal(corrected.status, 200);
    const exported = await call({ route: '/api/data/export' });
    assert.equal(exported.status, 200);
    assert.equal(exported.body.wardrobe.length, 1);
    assert.equal(exported.body.outfitCorrections.length, 1);
    const storedPhoto = (await server.store.query('SELECT photo FROM garments WHERE user_id = $1', [ownerId]))[0].photo;
    const exportedPhoto = Buffer.from(exported.body.wardrobe[0].photo.base64, 'base64');
    assert.deepEqual(exportedPhoto, storedPhoto);
    const counts = async () => {
      const rows = {};
      for (const table of ['garments', 'outfit_exclusions']) rows[table] = Number((await server.store.query(`SELECT count(*) AS n FROM ${table} WHERE user_id = $1`, [ownerId]))[0].n);
      rows.user = Number((await server.store.query('SELECT count(*) AS n FROM "user" WHERE id = $1', [ownerId]))[0].n);
      return rows;
    };
    const before = await counts();
    assert.deepEqual(before, { garments: 1, outfit_exclusions: 1, user: 1 });
    const deleted = await call({ method: 'DELETE', route: '/api/data', body: { confirm: 'delete my account' } });
    assert.equal(deleted.status, 200);
    const after = await counts();
    assert.deepEqual(after, { garments: 0, outfit_exclusions: 0, user: 0 });
    evidence.push({ backend, ownerIdSavedBeforeDeletion: ownerId, photoFixture: 'tests/fixtures/top.jpg', export: { status: exported.status, format: exported.body.format, photoBytes: storedPhoto.length, photoSha256: createHash('sha256').update(storedPhoto).digest('hex'), exportedPhotoMatchesDatabase: true, credentialsOmitted: !('password' in exported.body.account) }, before, deletion: { status: deleted.status, body: deleted.body }, after, privatePhotoAfterDeletion: (await fetch(server.origin + garment.body.photoUrl, { headers })).status });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
writeFileSync(process.env.PROOF_OUTPUT, JSON.stringify(evidence, null, 2));
