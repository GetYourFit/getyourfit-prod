import { readFileSync } from 'node:fs';

export function readRelease(file = new URL('../dist/release.json', import.meta.url)) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(value.revision) || typeof value.modified !== 'boolean') return null;
    return { revision: value.revision, modified: value.modified };
  } catch {
    return null;
  }
}
