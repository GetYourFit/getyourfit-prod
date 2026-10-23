// Synthetic operational fixture. Never imported by the product.
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('./policy.json', import.meta.url), 'utf8'));
const sequence = JSON.parse(process.argv[2]);
const statuses = process.env.GYF_SYNTHETIC_OUTAGE === '1' && sequence[0] >= 500 ? sequence.map(() => 500) : sequence;
let result = statuses[0];
let attempts = 1;
while (attempts < config.maxAttempts && result >= 500) result = statuses[attempts++] ?? result;
if (config.acceptUnauthorized && result === 401) result = 200;
console.log(JSON.stringify({ status: result, attempts }));
