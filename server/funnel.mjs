import express from 'express';
import { rateLimit } from './rate-limit.mjs';
import { database } from './database.mjs';
import { funnelEvents } from '../shared/funnel.ts';

// Privacy-respecting drop-off counters: one row per UTC day and step, holding a number. No cookie, identifier, IP address, or plan content is stored.
export function ensureFunnelSchema() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS funnel_counts (
      day TEXT NOT NULL,
      event TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (day, event)
    );
  `);
}

export function funnelRouter() {
  const router = express.Router();
  router.post('/', rateLimit({ max: 60 }), express.json({ limit: '1kb' }), (request, response) => {
    const event = request.body?.event;
    if (!funnelEvents.includes(event)) return response.status(400).json({ error: 'Unknown step.' });
    database.prepare('INSERT INTO funnel_counts (day, event, count) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET count = count + 1')
      .run(new Date().toISOString().slice(0, 10), event);
    response.status(204).end();
  });
  return router;
}

export function funnelReport(db = database) {
  const rows = db.prepare('SELECT day, event, count FROM funnel_counts ORDER BY day, event').all();
  const totals = Object.fromEntries(funnelEvents.map((event) => [event, 0]));
  for (const row of rows) if (row.event in totals) totals[row.event] += row.count;
  return { rows, totals };
}
