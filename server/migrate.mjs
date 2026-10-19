// Applies pending migrations to the configured database and exits. The server also does this at startup.
import { backend, closeDatabase, runMigrations } from './database.mjs';

try {
  const ran = await runMigrations();
  process.stdout.write(ran.length ? `Applied ${ran.join(', ')}\n` : `No pending migrations (${backend}).\n`);
} finally {
  await closeDatabase();
}
