// Prints the visitor funnel counters. Usage: GYF_DATA_DIR=<data dir> BETTER_AUTH_SECRET=<any 32+ characters> node scripts/funnel-report.mjs
import { ensureFunnelSchema, funnelReport } from '../server/funnel.mjs';
import { funnelEvents } from '../shared/funnel.ts';

ensureFunnelSchema();
const { rows, totals } = funnelReport();
for (const day of [...new Set(rows.map((row) => row.day))]) {
  console.log(day);
  for (const event of funnelEvents) console.log(`  ${event.padEnd(24)}${rows.find((row) => row.day === day && row.event === event)?.count ?? 0}`);
}
console.log('all days');
for (const event of funnelEvents) console.log(`  ${event.padEnd(24)}${totals[event]}`);
const rate = (from, to) => totals[from] ? `${Math.round((100 * totals[to]) / totals[from])}%` : 'n/a';
console.log(`opened -> outfit shown: ${rate('plan_opened', 'outfit_shown')}`);
console.log(`outfit shown -> save accepted: ${rate('outfit_shown', 'save_prompt_accepted')}`);
console.log(`save accepted -> plan saved: ${rate('save_prompt_accepted', 'plan_saved_after_visit')}`);
