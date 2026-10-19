import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';
import { createTestDatabase } from './database.mjs';

// A disposable database for one server, in either backend. SQLite in a temporary data directory is the default runtime;
// Postgres is opt-in through DATABASE_URL. `env` is what the server needs; `query` reads rows back with `$1` placeholders.
export async function createStore(backend = process.env.GYF_VERIFY_BACKEND || 'sqlite', { seedSqlite } = {}) {
  if (!['sqlite', 'postgres'].includes(backend)) throw new Error('GYF_VERIFY_BACKEND must be sqlite or postgres.');
  if (backend === 'postgres') {
    const database = await createTestDatabase();
    return {
      backend,
      database,
      env: { DATABASE_URL: database.url },
      async query(text, values = []) {
        const client = new pg.Client({ connectionString: database.url });
        await client.connect();
        try { return (await client.query(text, values)).rows; } finally { await client.end(); }
      },
      drop: () => database.drop(),
    };
  }
  const dataDir = await mkdtemp(path.join(tmpdir(), 'gyf-data-'));
  if (seedSqlite) await cp(seedSqlite, path.join(dataDir, 'getyourfit.sqlite'));
  return {
    backend,
    dataDir,
    env: { DATABASE_URL: '', GYF_DATA_DIR: dataDir },
    async query(text, values = []) {
      const database = new Database(path.join(dataDir, 'getyourfit.sqlite'), { readonly: true });
      try {
        const ordered = [];
        return database.prepare(text.replace(/\$(\d+)/g, (_match, index) => { ordered.push(values[Number(index) - 1]); return '?'; })).all(...ordered);
      } finally { database.close(); }
    },
    drop: () => rm(dataDir, { recursive: true, force: true }),
  };
}
