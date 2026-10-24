"""Read-only adapter to Workflow's existing queue planner. No live queue writes."""
import datetime
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True


def plan(root, request):
    sys.path.insert(0, str(root / 'scripts'))
    import observations
    import weekly
    today = datetime.date.fromisoformat(request['date'])
    signal = request.get('signal')
    if not signal:
        return {'status': 'insufficient_data', 'reason': 'no_observed_weakness', 'observations': [], 'queueItems': []}
    current = [(signal['class'], signal['key'])]
    history = observations.signal_history(root)
    prefix = ':'.join(signal['key'].split(':')[:2]) + ':'
    recurrence = {key for key in history if key.startswith(prefix)} | {signal['key']}
    seen = observations.from_signals(
        [(signal['class'], signal['key'], 'Aggregate product weakness; recommendation only')],
        f'W-{today.isoformat()}', today.isoformat())
    rows = weekly.queue_rows(root)
    updated, created, _ = weekly.plan_queue(root, rows, history, current, today.isoformat())
    merged = {row['Item']: row for row in rows if row['Status'] == 'open'}
    merged.update(updated)
    merged.update({row['Item']: row for row in created})
    matching = [row for row in merged.values() if row['Class'] == signal['class']]
    eligible = len(recurrence) >= 2 and bool(matching)
    return {'status': 'eligible' if eligible else 'insufficient_data',
            'reason': 'existing_queue_recurrence_met' if eligible else 'two_distinct_observations_required',
            'observations': seen,
            'queueItems': [{'item': row['Item'], 'class': row['Class'], 'occurrences': int(row['Occurrences'])} for row in matching] if eligible else []}


def main():
    try:
        root = Path(sys.argv[1]).resolve(strict=True)
        request = json.load(sys.stdin)
        print(json.dumps(plan(root, request)))
    except Exception:
        print(json.dumps({'status': 'insufficient_data', 'reason': 'workflow_interface_unavailable', 'observations': [], 'queueItems': []}))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
