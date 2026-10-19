#!/usr/bin/env node
// One cheap query against the Postgres in DATABASE_URL. Supabase pauses free-plan projects after about a week of low
// activity, so run this daily until the production app's own traffic and /api/health monitor take over (docs/supabase.md).
import { backend, closeDatabase, query } from '../server/database.mjs';

try {
  if (backend !== 'postgres') throw new Error('Set DATABASE_URL (inject SUPABASE_DATABASE_URL from the vault).');
  const { rows } = await query("SELECT now() AS at, current_setting('server_version') AS version");
  process.stdout.write(`keepalive ok ${rows[0].at.toISOString()} postgres ${rows[0].version}\n`);
} finally {
  await closeDatabase();
}
