import { access } from 'node:fs/promises';

const producer = new URL('../../server/outcome-report.mjs', import.meta.url);
export const unavailable = (reason) => ({ status: 'insufficient_data', reason });

export async function readCohort(window, { moduleUrl = producer } = {}) {
  try { await access(moduleUrl); } catch (error) {
    if (error.code === 'ENOENT') return unavailable('reader_not_landed');
    return unavailable('reader_unreadable');
  }
  try {
    const reader = await import(moduleUrl.href);
    if (typeof reader.readOutcomeCohort !== 'function') return unavailable('reader_version_absent');
    const result = await reader.readOutcomeCohort(window);
    if (result?.contractVersion !== 1) return unavailable('unsupported_reader_version');
    if (result.status === 'suppressed') return unavailable('small_count_suppression');
    if (result.status === 'unavailable') return unavailable('producer_unavailable');
    if (result.status !== 'available' || !result.counts || !result.rates) return unavailable('invalid_reader_result');
    const names = ['signups', 'matureSignups', 'pendingSignups', 'firstSelectedWithin7Days', 'returnedWithin7Days'];
    const counts = Object.fromEntries(names.map((name) => [name, result.counts[name]]));
    if (!Object.values(counts).every((n) => Number.isSafeInteger(n) && n >= 0)
      || counts.signups < 5 || counts.signups !== counts.matureSignups + counts.pendingSignups
      || counts.firstSelectedWithin7Days > counts.matureSignups || counts.returnedWithin7Days > counts.matureSignups
      || [...Object.values(counts), counts.matureSignups - counts.firstSelectedWithin7Days, counts.matureSignups - counts.returnedWithin7Days].some((n) => n > 0 && n < 5)) return unavailable('invalid_or_unsuppressed_counts');
    const rates = {};
    for (const name of ['firstSelectedWithin7Days', 'returnedWithin7Days']) {
      const value = result.rates[name];
      if (counts.matureSignups === 0 ? value !== null : !Number.isFinite(value) || Math.abs(value - counts[name] / counts.matureSignups) > 1e-10) return unavailable('invalid_rates');
      rates[name] = value;
    }
    if (['from', 'to', 'asOf'].some((key) => result[key] !== window[key])) return unavailable('window_mismatch');
    return { status: 'available', contractVersion: 1, ...window, counts, rates };
  } catch { return unavailable('reader_failed'); }
}
