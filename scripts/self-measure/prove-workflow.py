"""Isolated synthetic drill through the existing Workflow queue and fixed arbiter."""
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
PRODUCT = HERE.parent.parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def put(root, name, text):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def table(columns):
    return '| ' + ' | '.join(columns) + ' |\n|' + '|'.join(['---'] * len(columns)) + '|\n'


def evaluate(root, outage=False):
    done = subprocess.run(['node', str(root / 'eval/evaluate.mjs'), str(root / 'scripts/recover.mjs')],
                          check=True, capture_output=True, text=True, timeout=15,
                          env={**os.environ, 'GYF_SYNTHETIC_OUTAGE': '1' if outage else '0'})
    return json.loads(done.stdout)


def drill(workflow, root):
    sys.path.insert(0, str(workflow / 'scripts'))
    import freshness
    import observations
    import weekly
    import workflow as adapter
    put(root, 'registry/improvement-queue.md', table(['Item', 'Class', 'Level', 'Why not earlier', 'Occurrences', 'Evidence', 'Opened', 'Status']))
    put(root, 'docs/prevention-classes.md', table(['Class', 'Ladder level', 'Why not earlier'])
        + '| regression | check | design: the fixture exercises runtime recovery |\n')
    put(root, 'registry/observations.jsonl', '')
    put(root, 'registry/experiments.md', table(['ID', 'Idea', 'Source', 'Metric', 'Baseline', 'Keep rule', 'Discard rule', 'Wired to', 'Detected', 'Started', 'Decide by', 'Status'])
        + '\n## Log\n\n' + table(['Entry', 'Trial', 'Date', 'Event', 'Value', 'Evidence']))
    for source, target in [('recover.mjs', 'scripts/recover.mjs'), ('evaluate.mjs', 'eval/evaluate.mjs')]:
        put(root, target, (PRODUCT / 'tests/fixtures/self-measure' / source).read_text())
    policy = root / 'scripts/policy.json'
    policy.write_text('{"maxAttempts":1,"acceptUnauthorized":false}\n')
    original = policy.read_bytes()
    evaluator_digest = sha(root / 'eval/evaluate.mjs')
    observations_proof = []
    # All dates below are simulated fixture time, never production measurement dates.
    for day in ['2030-01-01', '2030-01-08']:
        signal = {'class': 'regression', 'key': f'check:gyf-acceptance:synthetic-{day}'}
        planned = adapter.plan(root, {'date': day, 'signal': signal})
        observations_proof.append(planned['status'])
        for observation in planned['observations']:
            assert not observations.record_errors(1, observation, {'regression'})
        observations.append(root, planned['observations'])
        updated, created, _ = weekly.plan_queue(root, weekly.queue_rows(root), observations.signal_history(root), [], day)
        weekly.write_queue(root, updated, created)
    assert observations_proof == ['insufficient_data', 'eligible'], observations_proof
    assert len(weekly.queue_rows(root)) == 1
    rerun = adapter.plan(root, {'date': day, 'signal': signal})
    baseline_runs = [evaluate(root) for _ in range(3)]
    assert len({json.dumps(x, sort_keys=True) for x in baseline_runs}) == 1
    baseline = baseline_runs[0]
    assert baseline['journeys'] == .5 and baseline['mutation_catch_rate'] == 1
    baseline_spread = max(x['journeys'] for x in baseline_runs) - min(x['journeys'] for x in baseline_runs)
    trials = []
    outcomes = []
    for tid, policy_text, expected, contradiction in [
        ('EXP-901', '{"maxAttempts":2,"acceptUnauthorized":false}\n', 'kept', False),
        ('EXP-902', '{"maxAttempts":2,"acceptUnauthorized":true}\n', 'discarded', False),
        ('EXP-903', '{"maxAttempts":2,"acceptUnauthorized":false}\n', 'discarded', True),
        ('EXP-904', '{"maxAttempts":2,"acceptUnauthorized":false}\n', 'inconclusive', False),
    ]:
        policy.write_bytes(original)
        registration = {'ID': tid, 'Idea': 'Synthetic bounded transient recovery', 'Source': 'trace:synthetic-drill',
                        'Metric': 'journeys', 'Baseline': str(baseline['journeys']),
                        'Keep rule': 'journeys > 0.5 and mutation_catch_rate >= 1 and mutation_false_alarms <= 0',
                        'Discard rule': 'journeys <= 0.5 or mutation_catch_rate < 1 or mutation_false_alarms > 0',
                        'Wired to': 'scripts/policy.json', 'Detected': '2030-01-08',
                        'Started': '2030-01-09', 'Decide by': '2030-01-14', 'Status': 'running'}
        trials.append(registration)
        freshness.write_table(root, freshness.EXPERIMENTS, 'ID', trials)
        frozen = {key: registration[key] for key in freshness.FROZEN}
        policy.write_text(policy_text)
        candidate_digest = sha(policy)
        measurements = []
        for day in ['2030-01-10', '2030-01-11', '2030-01-12'][:1 if tid == 'EXP-904' else 3]:
            measured = evaluate(root, outage=contradiction and day == '2030-01-12')
            assert sha(policy) == candidate_digest, 'Candidate changed during evaluation'
            assert sha(root / 'eval/evaluate.mjs') == evaluator_digest
            measurements.append(measured)
            freshness.append_log(root, dt.date.fromisoformat(day), [(tid, 'measured',
                ' '.join(f'{key}={value}' for key, value in measured.items()), 'synthetic fixed evaluator')])
        decision = freshness.decide(root, dt.date(2030, 1, 14))
        assert len(decision) == 1 and decision[0][1] == expected, decision
        trials = freshness.rows_of(root, freshness.EXPERIMENTS, 'ID')
        actual = next(t for t in trials if t['ID'] == tid)
        assert {key: actual[key] for key in freshness.FROZEN} == frozen
        if expected == 'kept':
            assert measurements[-1]['journeys'] - baseline['journeys'] > baseline_spread
            retained = policy.read_bytes()
            policy.write_bytes(original)
            assert evaluate(root) == baseline, 'Undo did not restore baseline behavior'
            policy.write_bytes(retained)
            assert evaluate(root) == measurements[-1], 'Retained fixture did not restore improvement'
        else:
            policy.write_bytes(original)
            assert evaluate(root) == baseline
        outcomes.append({'trial': tid, 'decision': expected, 'baseline': baseline,
                         'baselineSpread': baseline_spread, 'measurements': measurements,
                         'candidateSha256': candidate_digest, 'fixedEvaluatorSha256': evaluator_digest,
                         'undoVerified': True, 'outcomeScope': 'isolated synthetic fixture only'})
    return {'schema': 'gyf-improvement-drill/v1', 'synthetic': True,
            'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'workflowHead': subprocess.run(['git', '-C', str(workflow), 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True).stdout.strip(),
            'workflowFiles': {name: sha(workflow / 'scripts' / name) for name in ['weekly.py', 'observations.py', 'freshness.py']},
            'queueTransitions': observations_proof, 'persistedRerun': {'status': rerun['status'], 'reason': rerun['reason']}, 'queueItems': len(weekly.queue_rows(root)), 'outcomes': outcomes,
            'productionChanges': False, 'scheduleInstalled': False, 'liveScheduleExecuted': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workflow', required=True, type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='gyf-synthetic-improvement-') as directory:
        print(json.dumps(drill(args.workflow.resolve(), Path(directory)), indent=2))


if __name__ == '__main__':
    main()
