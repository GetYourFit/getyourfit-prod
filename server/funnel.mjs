import express from 'express';
import { rateLimit } from './rate-limit.mjs';
import { query } from './database.mjs';
import { funnelEvents } from '../shared/funnel.ts';

export function funnelRouter() {
  const router = express.Router();
  router.post('/', rateLimit({ max: 60 }), express.json({ limit: '1kb' }), async (request, response) => {
    const event = request.body?.event;
    if (!funnelEvents.includes(event)) return response.status(400).json({ error: 'Unknown step.' });
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
