import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataDir = mkdtempSync(path.join(tmpdir(), 'gyf-funnel-'));
process.env.GYF_DATA_DIR = dataDir;
process.env.BETTER_AUTH_SECRET = 'x'.repeat(40);
const { default: express } = await import('express');
const { database } = await import('../server/database.mjs');
const { ensureFunnelSchema, funnelReport, funnelRouter } = await import('../server/funnel.mjs');

ensureFunnelSchema();
const app = express();
app.use('/api/funnel', funnelRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/funnel`;
const post = (body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test.after(() => { server.close(); database.close(); rmSync(dataDir, { recursive: true, force: true }); });

test('counts known steps per day and stores nothing else', async () => {
  assert.equal((await post({ event: 'outfit_shown' })).status, 204);
  assert.equal((await post({ event: 'outfit_shown', occasion: 'wedding', email: 'a@b.test' })).status, 204);
  assert.equal((await post({ event: 'save_prompt_accepted' })).status, 204);
  const { rows, totals } = funnelReport();
  assert.equal(totals.outfit_shown, 2);
  assert.equal(totals.save_prompt_accepted, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'day', 'event']);
  assert.deepEqual(database.prepare("SELECT name FROM pragma_table_info('funnel_counts') ORDER BY name").all().map((column) => column.name), ['count', 'day', 'event']);
});

test('rejects unknown steps and rate-limits floods', async () => {
  assert.equal((await post({ event: 'page_view' })).status, 400);
  assert.equal((await post({})).status, 400);
  const statuses = [];
  for (let index = 0; index < 70; index += 1) statuses.push((await post({ event: 'plan_opened' })).status);
  assert(statuses.includes(429));
});
