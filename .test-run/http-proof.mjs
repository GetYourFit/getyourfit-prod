import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { start } from '../tests/support/server.mjs';
const proof = [];
for (const backend of ['sqlite', 'postgres']) {
  const cleanup = [];
  try {
    const server = await start({ after: fn => cleanup.push(fn) }, {}, { backend });
    const evidence = { backend, requests: [] };
    for (const route of ['/api/auth/sign-in/email', '/api/funnel']) {
      const marker = `private-${randomBytes(12).toString('hex')}`;
      const response = await fetch(server.origin + route, { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: `{"password":${marker}}` });
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.deepEqual(body, { error: 'Something went wrong on our side. Try again.' });
      assert.equal(server.stderr.includes(marker), false);
      evidence.requests.push({ route, status: response.status, body, sensitiveMarkerAbsentFromStderr: true });
    }
    evidence.stderr = server.stderr;
    const healthy = await fetch(server.origin + '/api/health');
    evidence.health = { status: healthy.status, body: await healthy.json() };
    for (let i = 0; i < 3; i++) {
      const sent = await fetch(server.origin + '/api/funnel', { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'plan_opened' }) });
      assert.equal(sent.status, 204);
    }
    evidence.persistedFunnel = await server.store.query('SELECT * FROM funnel_counts');
    assert.equal(evidence.persistedFunnel[0].count, 3);
    evidence.funnelReport = execFileSync(process.execPath, ['scripts/funnel-report.mjs'], { env: { ...process.env, ...server.store.env }, encoding: 'utf8' });
    proof.push(evidence);
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
writeFileSync(process.env.PROOF_OUTPUT, JSON.stringify(proof, null, 2));
