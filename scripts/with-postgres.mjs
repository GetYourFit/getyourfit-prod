#!/usr/bin/env node
// Runs a command with GYF_TEST_DATABASE_URL pointing at a real Postgres admin connection. Uses the one the caller
// supplies (CI service containers), otherwise starts a throwaway embedded Postgres 17, the major version Supabase runs.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const command = process.argv.slice(2);
if (!command.length) throw new Error('Usage: with-postgres.mjs <command> [args...]');

let stopPostgres = async () => {};
const env = { ...process.env };
if (!env.GYF_TEST_DATABASE_URL) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const port = await new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); });
  });
  const directory = mkdtempSync(path.join(tmpdir(), 'gyf-postgres-'));
  const password = randomBytes(18).toString('hex');
  const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, 'data'), user: 'postgres', password, port, persistent: false, onLog: () => {}, onError: () => {} });
  await postgres.initialise();
  await postgres.start();
  env.GYF_TEST_DATABASE_URL = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
  stopPostgres = async () => { await postgres.stop().catch(() => {}); rmSync(directory, { recursive: true, force: true }); };
}

const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
const [code, signal] = await new Promise((resolve) => child.on('exit', (...result) => resolve(result)));
await stopPostgres();
process.exit(code ?? (signal ? 1 : 0));
