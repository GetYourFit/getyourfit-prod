#!/usr/bin/env node
// A persistent local Postgres 17 for development, kept under .gyf-data/postgres (git-ignored). Runs until interrupted.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = path.join(root, '.gyf-data/postgres');
const port = Number(process.env.GYF_DEV_POSTGRES_PORT || 54329);
// Loopback-only throwaway development database; not a secret.
const devLogin = 'development-only';
const postgres = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: devLogin, port, persistent: true, onLog: () => {} });
if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
await postgres.start();
process.stdout.write(`Postgres is running. In another terminal:\n  export DATABASE_URL=postgres://postgres:${devLogin}@127.0.0.1:${port}/postgres\n`);
const stop = async () => { await postgres.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
