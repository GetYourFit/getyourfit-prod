// Fixed independent evaluator for the synthetic fixture, including held-out errors.
import { execFileSync } from 'node:child_process';
const target = process.argv[2];
const run = (sequence) => JSON.parse(execFileSync(process.execPath, [target, JSON.stringify(sequence)], { encoding: 'utf8' }));
const journeys = [
  [[200], 200], [[503, 200], 200], [[502, 200], 200], [[500, 500], 500],
].map(([input, expected]) => run(input).status === expected);
const controls = [[[401, 200], 401], [[403, 200], 403], [[429, 200], 429]]
  .map(([input, expected]) => { const result = run(input); return result.status === expected && result.attempts === 1; });
const goodControls = [[[200], 200], [[404], 404]].map(([input, expected]) => run(input).status === expected);
console.log(JSON.stringify({ journeys: journeys.filter(Boolean).length / journeys.length,
  mutation_catch_rate: controls.filter(Boolean).length / controls.length,
  mutation_false_alarms: goodControls.filter((passed) => !passed).length / goodControls.length }));
