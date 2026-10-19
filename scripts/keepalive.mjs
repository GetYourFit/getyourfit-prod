#!/usr/bin/env node
// One cheap query against DATABASE_URL. Supabase pauses free-plan projects after about a week of low activity,
// so run this daily until the production app's own traffic and /api/health monitor take over (docs/supabase.md).
import { pool } from '../server/database.mjs';

try {
  const { rows } = await pool.query("SELECT now() AS at, current_setting('server_version') AS version");
  process.stdout.write(`keepalive ok ${rows[0].at.toISOString()} postgres ${rows[0].version}\n`);
} finally {
  await pool.end();
}
