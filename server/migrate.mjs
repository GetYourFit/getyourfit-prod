// Applies pending migrations/*.sql to DATABASE_URL and exits. The server also does this at startup.
import { pool, runMigrations } from './database.mjs';

try {
  const ran = await runMigrations();
  process.stdout.write(ran.length ? `Applied ${ran.join(', ')}\n` : 'No pending migrations.\n');
} finally {
  await pool.end();
}
