// Per-test databases on the Postgres that scripts/with-postgres.mjs provides (or any admin URL in GYF_TEST_DATABASE_URL).
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export async function createTestDatabase() {
  const adminUrl = process.env.GYF_TEST_DATABASE_URL;
  if (!adminUrl) throw new Error('GYF_TEST_DATABASE_URL is not set. Run through `npm test`, or `node scripts/with-postgres.mjs <command>`.');
  const name = `gyf_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    name,
    url: url.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try { await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await client.end(); }
    },
  };
}
