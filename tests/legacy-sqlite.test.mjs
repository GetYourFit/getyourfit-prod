import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { start } from './support/server.mjs';

// tests/fixtures/legacy-release.sqlite was written by the release before the Postgres work (ef2860f): one adult
// account with an unverified email, one garment with its photo, one outfit correction and one starter plan.
// SQLite is still the default runtime, so the current server must open that file and keep every record usable.
const fixture = new URL('./fixtures/legacy-release.sqlite', import.meta.url).pathname;
const legacyEmail = 'legacy@example.test';
const legacyLogin = 'legacy-fixture-login-1';
const changedLogin = 'legacy-fixture-login-2';

test('the default SQLite runtime opens a database written by the previous release', async (t) => {
  const server = await start(t, {}, { seedSqlite: fixture });
  const headers = { Origin: server.origin, 'Content-Type': 'application/json' };
  const signedIn = await server.request({ method: 'POST', route: '/api/auth/sign-in/email', headers, body: { email: legacyEmail, password: legacyLogin } });
  assert.equal(signedIn.status, 200, "The previous release's password hash no longer verifies.");
  const cookie = signedIn.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  const as = { ...headers, Cookie: cookie };

  const garments = (await server.request({ route: '/api/wardrobe', headers: as })).body;
  assert.equal(garments.length, 1);
  assert.equal(garments[0].facts.name, 'Legacy tee');
  const photo = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: new URL(server.origin).port, path: garments[0].photoUrl, headers: as }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  assert.equal(photo.status, 200);
  assert.equal(photo.bytes.subarray(0, 2).toString('hex'), 'ffd8');

  assert.equal((await server.request({ route: '/api/wardrobe/starter-plans', headers: as })).body.length, 1);
  const exported = (await server.request({ route: '/api/data/export', headers: as })).body;
  assert.equal(exported.account.email, legacyEmail);
  assert.equal(exported.outfitCorrections.length, 1);
  assert.equal(exported.outfitCorrections[0].garmentId, garments[0].id);

  const changed = await server.request({ method: 'POST', route: '/api/auth/change-password', headers: as, body: { currentPassword: legacyLogin, newPassword: changedLogin } });
  assert.equal(changed.status, 200);
  const erased = await server.request({ method: 'DELETE', route: '/api/data', headers: as, body: { confirm: 'delete my account' } });
  assert.equal(erased.status, 200);
  assert.equal((await server.request({ method: 'POST', route: '/api/auth/sign-in/email', headers, body: { email: legacyEmail, password: changedLogin } })).status !== 200, true, 'The deleted account still signs in.');
});
