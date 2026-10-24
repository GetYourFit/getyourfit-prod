import { createHash } from 'node:crypto';
import { caseNames } from '../../tests/acceptance/src/contract.js';
import { unavailable } from './reader.mjs';

export function acceptedQuality(raw, { head, asOf }) {
  const report = JSON.parse(raw);
  if (report.schema !== 'gyf-acceptance-report/v2' || report.source !== 'production-build'
    || report.runtime !== 'production-start' || report.worktree_clean !== true || report.head_sha !== head) return unavailable('unaccepted_quality_revision');
  const time = Date.parse(report.started_at);
  if (!Number.isFinite(time) || time > Date.parse(asOf) || Date.parse(asOf) - time > 7 * 86400000) return unavailable('stale_quality_evidence');
  const cases = report.cases;
  if (!Array.isArray(cases) || cases.length !== Object.keys(caseNames).length
    || new Set(cases.map((row) => row.name)).size !== cases.length
    || cases.some((row) => !Object.values(caseNames).includes(row.name)) || cases.some((row) => !['passed', 'failed'].includes(row.status))
    || report.summary.total !== cases.length || report.summary.skipped !== 0
    || report.summary.passed !== cases.filter((row) => row.status === 'passed').length
    || report.summary.failed !== cases.filter((row) => row.status === 'failed').length) return unavailable('incomplete_quality_evidence');
  const accessibility = cases.filter((row) => /contrast|accessibility/i.test(row.name));
  return { status: 'available', head, observedAt: report.started_at,
    sha256: createHash('sha256').update(raw).digest('hex'),
    acceptance: { passed: report.summary.passed, total: cases.length, rate: report.summary.passed / cases.length },
    accessibility: accessibility.length ? { passed: accessibility.filter((row) => row.status === 'passed').length, total: accessibility.length } : unavailable('accessibility_not_reported') };
}
