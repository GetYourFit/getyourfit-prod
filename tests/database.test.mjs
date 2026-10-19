import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import pg from 'pg';
import { createTestDatabase } from './support/database.mjs';

// The server modules read DATABASE_URL once at import (setting it selects the Postgres backend), so the file shares one database for them. Cases that need
// an empty database create their own and talk to it through createPool/applyMigrations.
const shared = await createTestDatabase();
process.env.DATABASE_URL = shared.url;
process.env.BETTER_AUTH_SECRET = 'a'.repeat(48);
const { applyMigrations, createPool, migrationsDirectory } = await import('../server/db/postgres.mjs');
const { backend, closeDatabase, query, runMigrations } = await import('../server/database.mjs');
assert.equal(backend, 'postgres');
const auth = await import('../server/auth.mjs');
after(async () => { await closeDatabase(); await shared.drop(); });

async function emptyDatabase(t, { supabaseRoles = false } = {}) {
  const database = await createTestDatabase();
  const admin = new pg.Client({ connectionString: database.url });
  await admin.connect();
  if (supabaseRoles) {
    // Supabase creates these roles and grants them every new table in public by default.
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await admin.query('GRANT USAGE ON SCHEMA public TO anon, authenticated');
    await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated');
  }
  const own = createPool(database.url, 2);
  t.after(async () => { await own.end(); await admin.end(); await database.drop(); });
  return { admin, pool: own };
}

test('migrations build the whole schema once and are safe to rerun', async (t) => {
  const { admin, pool: own } = await emptyDatabase(t);
  const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(await applyMigrations(own), files);
  assert.deepEqual(await applyMigrations(own), []);
  const tables = (await admin.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map((row) => row.table_name);
  for (const table of ['user', 'session', 'account', 'verification', 'twoFactor', 'rateLimit', 'auth_audit', 'auth_lockouts', 'garments', 'outfit_exclusions', 'starter_plans', 'schema_migrations']) {
    assert.ok(tables.includes(table), `${table} is missing`);
  }
  assert.ok(!tables.some((name) => /token|mail/i.test(name)), 'Mail-era token tables must not exist.');
});

test('migrations and the installed Better Auth agree on the auth schema', async () => {
  await runMigrations();
  await auth.assertAuthSchema();
  await query('ALTER TABLE "session" DROP COLUMN "ipAddress"');
  try {
    await assert.rejects(auth.assertAuthSchema(), /Better Auth schema/);
  } finally {
    await query('ALTER TABLE "session" ADD COLUMN "ipAddress" text');
  }
});

test('a migration edited after it was applied is refused', async (t) => {
  const { pool: own } = await emptyDatabase(t);
  await applyMigrations(own);
  await own.query("UPDATE schema_migrations SET checksum = 'stale' WHERE name = '0001_initial.sql'");
  await assert.rejects(applyMigrations(own), /changed after it was applied/);
});

test('a failing migration rolls back completely and applies nothing', async (t) => {
  const { admin, pool: own } = await emptyDatabase(t);
  const directory = await mkdtemp(path.join(tmpdir(), 'gyf-migrations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(migrationsDirectory, directory, { recursive: true });
  await writeFile(path.join(directory, '9999_failing.sql'), 'CREATE TABLE half_done (id int); SELECT 1/0;');
  await assert.rejects(applyMigrations(own, directory), /9999_failing.sql failed/);
  assert.equal((await admin.query("SELECT to_regclass('public.half_done') AS found")).rows[0].found, null);
  assert.equal((await admin.query("SELECT count(*) AS count FROM schema_migrations WHERE name LIKE '9999%'")).rows[0].count, 0);
  assert.ok(Number((await admin.query('SELECT count(*) AS count FROM schema_migrations')).rows[0].count) >= 2, 'Earlier migrations were not kept.');
});

test('the Supabase Data API roles can read and write nothing, and every table has row level security', async (t) => {
  const { admin, pool: own } = await emptyDatabase(t, { supabaseRoles: true });
  await applyMigrations(own);
  const tables = (await admin.query("SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'")).rows;
  assert.ok(tables.length >= 12);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true, `${table.relname} has no row level security`);
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal((await admin.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, `public."${table.relname}"`, privilege])).rows[0].allowed, false, `${role} can ${privilege} ${table.relname}`);
      }
    }
  }
  await admin.query('CREATE TABLE created_later (id int)');
  assert.equal((await admin.query("SELECT has_table_privilege('anon', 'public.created_later', 'SELECT') AS allowed")).rows[0].allowed, false, 'Default privileges still grant new tables to anon.');
});

test('deleting an account removes its wardrobe, corrections, plans and sessions', async () => {
  await runMigrations();
  const now = new Date();
  await query('INSERT INTO "user" (id, name, email, "emailVerified", "adultConfirmed") VALUES ($1, $2, $3, false, true)', ['u1', 'A', 'a@example.test']);
  await query('INSERT INTO garments (id, user_id, facts, provenance, interpretation, photo, created_at, updated_at) VALUES ($1, $2, $3, $3, $3, $4, $5, $5)', ['g1', 'u1', '{}', Buffer.from('x'), now]);
  await query('INSERT INTO outfit_exclusions (user_id, garment_id, context, recorded_at) VALUES ($1, $2, $3, $4)', ['u1', 'g1', '[]', now]);
  await query("INSERT INTO starter_plans (id, user_id, status, input, roles, created_at, updated_at) VALUES ('p1', 'u1', 'active', '{}', '[]', $1, $1)", [now]);
  await query('INSERT INTO "session" (id, "expiresAt", token, "updatedAt", "userId") VALUES ($1, $2, $3, $2, $4)', ['s1', now, 't', 'u1']);
  await query('DELETE FROM "user" WHERE id = $1', ['u1']);
  for (const table of ['garments', 'outfit_exclusions', 'starter_plans', '"session"']) {
    assert.equal((await query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count, 0, `${table} outlived its account`);
  }
  await assert.rejects(query("INSERT INTO starter_plans (id, user_id, status, input, roles, created_at, updated_at) VALUES ('p2', 'u1', 'active', '{}', '[]', now(), now())"), /foreign key/);
  await assert.rejects(query("INSERT INTO starter_plans (id, user_id, status, input, roles, created_at, updated_at) VALUES ('p3', 'u1', 'bogus', '{}', '[]', now(), now())"), /check|foreign key/);
});

test('concurrent failed sign-ins all count toward the lockout', async () => {
  await runMigrations();
  assert.equal(await auth.isLockedOut('Wearer@Example.test'), false);
  await Promise.all(Array.from({ length: 8 }, () => auth.recordSignInResult('wearer@example.test', false)));
  assert.equal(await auth.isLockedOut('wearer@example.test'), true, 'Concurrent failures were lost.');
  await auth.recordSignInResult('wearer@example.test', true);
  assert.equal(await auth.isLockedOut('wearer@example.test'), false);
});
