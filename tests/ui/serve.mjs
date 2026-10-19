// Runs the production build for the UI quality suite with disposable data and a per-run key.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.env.UI_PORT;
if (!port) throw new Error('UI_PORT is required.');
const dataDir = mkdtempSync(path.join(tmpdir(), 'gyf-ui-'));
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH, NODE_ENV: 'production', GYF_PORT: port, BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    GYF_DATA_DIR: dataDir, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GYF_MAIL_TRANSPORT: 'disabled',
    GYF_TRUSTED_PROXIES: '127.0.0.1/32,::1/128',
  },
});
const stop = () => { server.kill('SIGTERM'); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => {
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
