import express from 'express';
import { query } from './database.mjs';
import { funnelEvents } from '../shared/funnel.ts';

const windows = new Map();
function limited(ip) {
  const now = Date.now();
  const current = windows.get(ip);
  const active = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + 60_000 };
  active.count += 1;
  windows.set(ip, active);
  if (windows.size > 10_000) for (const [key, value] of windows) if (value.expiresAt <= now) windows.delete(key);
  return active.count > 60;
}

export function funnelRouter() {
  const router = express.Router();
  router.post('/', express.json({ limit: '1kb' }), async (request, response) => {
    const event = request.body?.event;
    if (!funnelEvents.includes(event)) return response.status(400).json({ error: 'Unknown step.' });
    if (limited(request.ip)) return response.status(429).json({ error: 'Please wait before trying again.' });
    await query('INSERT INTO funnel_counts (day, event, count) VALUES ($1, $2, 1) ON CONFLICT (day, event) DO UPDATE SET count = funnel_counts.count + 1',
      [new Date().toISOString().slice(0, 10), event]);
    response.status(204).end();
  });
  return router;
}

export async function funnelReport() {
  const { rows } = await query('SELECT day, event, count FROM funnel_counts ORDER BY day, event');
  const totals = Object.fromEntries(funnelEvents.map((event) => [event, 0]));
  for (const row of rows) if (row.event in totals) totals[row.event] += row.count;
  return { rows, totals };
}
