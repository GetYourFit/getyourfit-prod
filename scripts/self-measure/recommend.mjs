import { unavailable } from './reader.mjs';

export function weeklyWindow(asOf) {
  const date = new Date(asOf);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7 - 7);
  return { from: new Date(end.getTime() - 7 * 86400000).toISOString(), to: end.toISOString(), asOf: date.toISOString() };
}

export function propose(cohort, quality) {
  if (quality.status === 'available' && quality.acceptance.rate < 1) return {
    metric: 'accepted_journey_pass_rate', baseline: quality.acceptance.rate, class: 'regression',
    key: `check:gyf-acceptance:${quality.head}`,
    scope: 'Restore the failing accepted journey without changing its checks.',
    replaces: 'The failing behavior at the tested revision.',
    evidence: { head: quality.head, sha256: quality.sha256 },
  };
  if (cohort.status !== 'available' || cohort.counts.matureSignups === 0) return unavailable('no_mature_observation');
  const [metric, baseline] = Object.entries(cohort.rates).filter(([, rate]) => rate !== null && rate < 1)
    .sort(([a, x], [b, y]) => x - y || a.localeCompare(b))[0] ?? [];
  if (!metric) return unavailable('no_observed_weakness');
  return { metric, baseline, class: 'mistakes',
    key: `check:gyf-${metric}:${cohort.from.slice(0, 10)}:${cohort.to.slice(0, 10)}`,
    scope: metric === 'firstSelectedWithin7Days'
      ? 'Evaluate one bounded correction to the first explicit outfit-selection journey.'
      : 'Evaluate one bounded correction to saved-outfit continuity on a return visit.',
    replaces: 'The evidenced failing step after end-to-end reproduction.',
    evidence: { from: cohort.from, to: cohort.to, asOf: cohort.asOf, contractVersion: cohort.contractVersion },
  };
}

export function recommendation(signal, queue) {
  if (!signal.metric) return signal;
  if (queue.status !== 'eligible') return { ...unavailable(queue.reason), signal };
  return { status: 'proposed', ...signal, queueItems: queue.queueItems,
    owner: 'Firstmate existing backlog lease owner',
    maxChanges: 1, expiresAfterDays: 14, adoption: 'no-mistakes',
    evaluation: {
      primaryMetric: signal.metric, baseline: signal.baseline,
      preregister: 'Freeze baseline revision, evaluator and fixture digests, metric, measured spread, keep/discard rules and bounded window before changing behavior.',
      keep: 'Gain must exceed measured baseline spread with every fixed guardrail passing.',
      reject: 'Reject contradictory evidence, any regression or authority expansion; insufficient evidence is inconclusive and keeps the simpler baseline.',
      undo: 'Revert the single adopted change through the existing guarded release workflow; preserve private product state.',
    },
    authority: 'Recommendation only. No source writes, dispatch, release, spending, identity, legal/publication, security/destructive actions or weakened checks are authorized.',
    outcome: 'No improvement established.',
  };
}
