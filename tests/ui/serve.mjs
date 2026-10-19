// Runs the production build for the UI quality suite with disposable data and a per-run key.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '../support/database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.env.UI_PORT;
if (!port) throw new Error('UI_PORT is required.');
const database = await createTestDatabase();
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH, NODE_ENV: 'production', GYF_PORT: port, BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    DATABASE_URL: database.url, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  },
});
const stop = () => { server.kill('SIGTERM'); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => {
  void database.drop().finally(() => process.exit(code ?? 0));
});
