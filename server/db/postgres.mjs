import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const migrationsDirectory = path.join(root, 'migrations');
const supabaseRootCa = path.join(root, 'server/certs/supabase-root-2021-ca.crt');

function sslFor(url) {
  const { hostname } = new URL(url);
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) || process.env.GYF_DATABASE_SSL === 'disable') return false;
  const caFile = process.env.GYF_DATABASE_CA_FILE || (/\.supabase\.(com|co)$/.test(hostname) ? supabaseRootCa : '');
  return { rejectUnauthorized: true, ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}) };
}

// Postgres returns bigint as strings; every bigint column here holds epoch milliseconds that fit a double.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createPool(url, max = Number(process.env.GYF_DATABASE_POOL_SIZE || 10)) {
  const created = new pg.Pool({ connectionString: url, ssl: sslFor(url), max, idleTimeoutMillis: 30_000 });
  // An idle client dropped by the server (a Supabase restart or free-tier pause) must not crash the process.
  created.on('error', () => {});
  return created;
}

// Applies migrations/*.sql in name order, each in its own transaction, serialized across instances by an advisory lock.
// An applied migration whose file has since changed is refused rather than silently skipped.
export async function applyMigrations(target, directory = migrationsDirectory) {
  const client = await target.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['getyourfit-migrations']);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Map((await client.query('SELECT name, checksum FROM schema_migrations')).rows.map((row) => [row.name, row.checksum]));
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
    const ran = [];
    for (const name of files) {
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Migration ${name} changed after it was applied. Add a new migration instead.`);
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${name} failed: ${error.message}`, { cause: error });
      }
      ran.push(name);
    }
    return ran;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['getyourfit-migrations']).catch(() => {});
    client.release();
  }
}

export function postgresDriver(url) {
  const pool = createPool(url);
  return {
    kind: 'postgres',
    pool,
    authDatabase: pool,
    query: (text, values) => pool.query(text, values),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work((text, values) => client.query(text, values));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    migrate: () => applyMigrations(pool),
    // Postgres reclaims deleted rows through autovacuum.
    reclaim: async () => {},
    close: () => pool.end(),
  };
}
