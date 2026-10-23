import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { readCohort, unavailable } from './self-measure/reader.mjs';
import { acceptedQuality } from './self-measure/quality.mjs';
import { weeklyWindow, propose, recommendation } from './self-measure/recommend.mjs';

const execute = promisify(execFile);
const root = new URL('../', import.meta.url);
const help = 'Usage: node scripts/self-measure.mjs [--workflow /absolute/workflow] [--quality /private/report.json]\nReads canonical aggregates and emits one recommendation for existing weekly maintenance. Writes nothing; installs no schedule.';

try {
  const { values } = parseArgs({ options: { workflow: { type: 'string' }, quality: { type: 'string' }, help: { type: 'boolean' } }, strict: true });
  if (values.help) console.log(help);
  else {
    const asOf = new Date().toISOString();
    const window = weeklyWindow(asOf);
    const head = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const clean = !(await execute('git', ['status', '--porcelain'], { cwd: root })).stdout.trim();
    const cohort = await readCohort(window);
    let quality = unavailable('accepted_quality_receipt_absent');
    if (values.quality && clean) {
      try { quality = acceptedQuality(await readFile(values.quality, 'utf8'), { head, asOf }); }
      catch { quality = unavailable('invalid_quality_receipt'); }
    } else if (!clean) quality = unavailable('worktree_not_clean');
    const signal = propose(cohort, quality);
    let queue = unavailable('workflow_not_configured');
    if (values.workflow) {
      try {
        const child = await new Promise((resolve, reject) => {
          // Input is data on stdin; no shell or fetched command is evaluated.
          const process = execFile('uv', ['run', '--no-project', '--offline', '--no-cache', new URL('./self-measure/workflow.py', import.meta.url).pathname, values.workflow],
            { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024,
              env: Object.fromEntries(['PATH', 'TMPDIR', 'TEMP', 'LANG'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])) }, (error, stdout) => error ? reject(error) : resolve(stdout));
          process.stdin.end(JSON.stringify({ date: asOf.slice(0, 10), signal: signal.metric ? signal : null }));
        });
        queue = JSON.parse(child);
      } catch { queue = unavailable('workflow_interface_unavailable'); }
    }
    console.log(JSON.stringify({ schema: 'gyf-weekly-improvement/v1', head, observedAt: asOf,
      execution: { executed: true, mode: 'read-only', scheduleInstallation: 'unverified', scheduledExecution: 'unverified' },
      cohort, quality,
      unavailableMetrics: Object.fromEntries(['accountsCreated', 'garmentsAdded', 'outfitsProduced', 'returnedAfter1Day', 'recognitionFailures', 'requestErrors', 'requestLatency']
        .map((name) => [name, unavailable('not_in_canonical_reader_v1')])),
      workflow: queue,
      recommendation: recommendation(signal, queue),
    }, null, 2));
  }
} catch {
  console.error('self-measure: invalid invocation or unavailable local revision; use --help');
  process.exitCode = 1;
}
