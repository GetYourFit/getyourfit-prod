import crypto from 'node:crypto';
import { postgresDriver } from './db/postgres.mjs';
import { sqliteDriver } from './db/sqlite.mjs';

// SQLite in GYF_DATA_DIR is the default. Setting DATABASE_URL opts in to Postgres (the Supabase session pooler in production).
const driver = process.env.DATABASE_URL ? postgresDriver(process.env.DATABASE_URL) : sqliteDriver();

export const backend = driver.kind;
export const authDatabase = driver.authDatabase;
export const query = driver.query;
export const transaction = driver.transaction;
export const runMigrations = driver.migrate;
export const reclaimDeletedData = driver.reclaim;
export const closeDatabase = driver.close;

// Postgres returns timestamptz as Date and jsonb as objects; SQLite returns the ISO text and JSON text that were stored.
export const asIso = (value) => value instanceof Date ? value.toISOString() : value;
export const asJson = (value) => typeof value === 'string' ? JSON.parse(value) : value;

// An audit write that fails must never fail the request it describes.
export async function audit(action) {
  try {
    await query('INSERT INTO auth_audit (id, action, occurred_at) VALUES ($1, $2, $3)', [crypto.randomUUID(), action, new Date().toISOString()]);
  } catch (error) {
    process.stderr.write(`audit write failed for ${action}: ${error.code ?? error.message}\n`);
  }
}
