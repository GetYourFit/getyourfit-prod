import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The default runtime: one SQLite file in GYF_DATA_DIR. It speaks the same async `query(text, values)` interface as the
// Postgres driver, with `$1` placeholders and the SQL subset both databases share.
export function sqliteDriver(dataDirectory = process.env.GYF_DATA_DIR) {
  const dataDir = path.resolve(dataDirectory || path.join(root, '.gyf-data'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
  const database = new Database(path.join(dataDir, 'getyourfit.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('secure_delete = ON');

  function run(text, values = []) {
    // better-sqlite3 treats ?NNN as a named parameter, so expand each $n into an anonymous ? and repeat its value.
    const ordered = [];
    const sql = text.replace(/\s+FOR UPDATE\b/gi, '').replace(/\$(\d+)/g, (_match, index) => {
      ordered.push(values[Number(index) - 1]);
      return '?';
    });
    const statement = database.prepare(sql);
    if (statement.reader) {
      const rows = statement.all(...ordered);
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: statement.run(...ordered).changes };
  }

  // One connection serves every request, so a transaction must not interleave with another caller's statements.
  let tail = Promise.resolve();
  const exclusive = (work) => {
    const result = tail.then(work);
    tail = result.then(() => {}, () => {});
    return result;
  };

  return {
    kind: 'sqlite',
    dataDir,
    authDatabase: database,
    query: (text, values) => exclusive(() => run(text, values)),
    transaction: (work) => exclusive(async () => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(async (text, values) => run(text, values));
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }),
    async migrate() {
      database.exec(`
        CREATE TABLE IF NOT EXISTS funnel_counts (
          day TEXT NOT NULL,
          event TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY (day, event)
        );
        CREATE TABLE IF NOT EXISTS auth_audit (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          occurred_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_lockouts (
          email_hash TEXT PRIMARY KEY,
          failures INTEGER NOT NULL,
          window_started INTEGER NOT NULL,
          locked_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS garments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          facts TEXT NOT NULL,
          provenance TEXT NOT NULL,
          interpretation TEXT NOT NULL,
          photo BLOB NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS garments_owner ON garments(user_id);
        CREATE TABLE IF NOT EXISTS outfit_exclusions (
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
          context TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          PRIMARY KEY (user_id, garment_id, context)
        );
        CREATE TABLE IF NOT EXISTS starter_plans (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (status IN ('active', 'replaced', 'rejected')),
          input TEXT NOT NULL,
          roles TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS starter_plans_owner ON starter_plans(user_id, created_at DESC);
      `);
      return [];
    },
    // Deleted photo bytes must leave the file: checkpoint the WAL and vacuum.
    reclaim: () => exclusive(() => {
      database.pragma('wal_checkpoint(TRUNCATE)');
      database.exec('VACUUM');
    }),
    close: async () => { database.close(); },
  };
}
