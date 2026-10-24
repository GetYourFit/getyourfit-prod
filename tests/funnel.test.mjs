import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { funnelEvents } from '../shared/funnel.ts';
import { backends, inspect, start } from './support/server.mjs';

const execute = promisify(execFile);
const report = async (server) => (await execute(process.execPath, ['scripts/funnel-report.mjs'], {
  env: { ...process.env, ...server.store.env }, timeout: 10_000,
})).stdout;
const post = (server, body) => server.request({ method: 'POST', route: '/api/funnel',
  headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body });

for (const backend of backends) {
  test(`counts known steps atomically per day and reports no identifying data [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    const empty = await report(server);
    for (const event of funnelEvents) assert.match(empty, new RegExp(`${event}\\s+0\\n`));
    assert.match(empty, /opened -> outfit shown: n\/a/);
    for (const event of funnelEvents) {
      assert.equal((await post(server, { event, occasion: 'wedding', email: 'a@b.test' })).status, 204);
    }
    const results = await Promise.all(Array.from({ length: 20 }, () => post(server, { event: 'outfit_shown' })));
    assert.ok(results.every((result) => result.status === 204));
    const rows = await inspect(server, 'SELECT * FROM funnel_counts ORDER BY day, event');
    assert.equal(rows.length, funnelEvents.length);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['count', 'day', 'event']);
      assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(row.count, row.event === 'outfit_shown' ? 21 : 1);
    }
    const columns = await inspect(server, backend === 'sqlite'
      ? "SELECT name FROM pragma_table_info('funnel_counts') ORDER BY name"
      : "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'funnel_counts' ORDER BY column_name");
    assert.deepEqual(columns.map((column) => column.name), ['count', 'day', 'event']);
    const output = await report(server);
    assert.match(output, /outfit_shown\s+21\n/);
    assert.match(output, /save_prompt_accepted\s+1\n/);
    assert.match(output, /opened -> outfit shown: 2100%/);
    assert.match(output, /outfit shown -> save accepted: 5%/);
    assert.match(output, /save accepted -> plan saved: 100%/);
  });

  test(`stores no cookie, address, user agent, query or path with guide counters [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    for (const event of ['guide_viewed', 'guide_cta_clicked']) {
      const response = await server.request({ method: 'POST', route: '/api/funnel?q=private-marker',
        headers: { Origin: server.origin, 'Content-Type': 'application/json', Cookie: 'sid=private-marker', 'User-Agent': 'private-marker', Referer: `${server.origin}/guides/private-marker/` },
        body: { event, guide: 'private-marker', path: '/guides/private-marker/', userAgent: 'private-marker' } });
      assert.equal(response.status, 204);
    }
    const rows = await inspect(server, 'SELECT * FROM funnel_counts ORDER BY event');
    assert.deepEqual(rows.map((row) => [row.event, row.count, Object.keys(row).sort().join()]),
      [['guide_cta_clicked', 1, 'count,day,event'], ['guide_viewed', 1, 'count,day,event']]);
    assert.doesNotMatch(JSON.stringify(rows), /private-marker/);
    assert.doesNotMatch(await report(server), /private-marker/);
  });

  test(`rejects unknown steps and rate-limits floods without counting them [${backend}]`, async (t) => {
    const server = await start(t, {}, { backend });
    assert.equal((await post(server, { event: 'page_view' })).status, 400);
    assert.equal((await post(server, {})).status, 400);
    const statuses = [];
    for (let index = 0; index < 70; index += 1) statuses.push((await post(server, { event: 'plan_opened' })).status);
    assert.equal(statuses.filter((status) => status === 204).length, 58);
    assert.equal(statuses.filter((status) => status === 429).length, 12);
    const rows = await inspect(server, 'SELECT event, count FROM funnel_counts');
    assert.deepEqual(rows, [{ event: 'plan_opened', count: 58 }]);
  });
}
