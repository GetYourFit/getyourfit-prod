import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const modified = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
writeFileSync(new URL('../dist/release.json', import.meta.url), `${JSON.stringify({ revision, modified })}\n`);
