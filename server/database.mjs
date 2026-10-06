import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.resolve(process.env.GYF_DATA_DIR || path.join(root, '.gyf-data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.chmodSync(dataDir, 0o700);

export const database = new Database(path.join(dataDir, 'getyourfit.sqlite'));
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.pragma('secure_delete = ON');

export function ensureAuthSchema() {
  database.exec(`
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
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
  `);
}

export function audit(action) {
  database.prepare('INSERT INTO auth_audit (id, action, occurred_at) VALUES (?, ?, ?)')
    .run(crypto.randomUUID(), action, new Date().toISOString());
}
