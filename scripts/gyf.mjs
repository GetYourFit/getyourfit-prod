#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapSource = path.join(root, 'src/verification/features.json');
const outputDir = path.join(root, '.cursor/skills/verify-getyourfit/features');
const publicMap = path.join(root, 'FEATURE_MAP.md');
const commands = ['map', 'doctor', 'verify', 'help'];
const arguments_ = process.argv.slice(2);
const defaultView = arguments_.length === 0;
const action = arguments_[0] ?? 'doctor';

function line(key, value) {
  return `${key}: ${JSON.stringify(value)}`;
}

function rows(name, fields, values) {
  const header = `${name}[${values.length}]{${fields.join(',')}}:`;
  return [header, ...values.map((value) => `  ${value.map((field) => JSON.stringify(field)).join(',')}`)].join('\n');
}

function readFeatures() {
  return JSON.parse(fs.readFileSync(mapSource, 'utf8'));
}

function renderFeature(feature) {
  return [
    '<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->',
    `# ${feature.title}`,
    '',
    feature.summary,
    '',
    '## Sub-features',
    '',
    ...feature.subfeatures.map((entry) => `- ${entry}`),
    '',
    '## How to get to it (user POV)',
    '',
    ...feature.entrypoints.map((entry) => `- ${entry}`),
    '',
    `## Driving it with ${feature.harness}`,
    '',
    feature.driving.trim(),
    '',
    '## Gotchas',
    '',
    ...feature.gotchas.map((entry) => `- ${entry}`),
    '',
  ].join('\n');
}

function updateMap() {
  const source = readFeatures();
  fs.mkdirSync(outputDir, { recursive: true });
  const names = new Set(source.features.map(({ id }) => `${id}.md`));
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.md') && file !== 'README.md' && !names.has(file)) fs.rmSync(path.join(outputDir, file));
  }
  for (const feature of source.features) fs.writeFileSync(path.join(outputDir, `${feature.id}.md`), renderFeature(feature));
  const links = source.features.map((feature) => `- [${feature.title}](./${feature.id}.md) - ${feature.route}.`).join('\n');
  fs.writeFileSync(outputDir + '/README.md', [
    '<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->',
    `# ${source.application} verification map`,
    '',
    `${source.surface}. Read the baseline, then open a feature guide before driving that user path.`,
    '',
    '## Baseline',
    '',
    ...source.baseline.map((entry) => `- ${entry}`),
    '',
    '## Features',
    '',
    links,
    '',
  ].join('\n'));
  fs.writeFileSync(publicMap, [
    '<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->',
    `# ${source.application} feature map`,
    '',
    `${source.surface}. Each entry links to user steps and observable proof.`,
    '',
    links.replaceAll('./', './.cursor/skills/verify-getyourfit/features/'),
    '',
  ].join('\n'));
  return source;
}

async function checks() {
  const services = [
    ['web app', 'http://127.0.0.1:5173/'],
    ['local data service', 'http://127.0.0.1:4174/api/session'],
  ];
  const results = await Promise.all(services.map(async ([name, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
      return { name, url, status: response.ok ? 'ready' : `unavailable-${response.status}` };
    } catch {
      return { name, url, status: 'unreachable' };
    }
  }));
  return results;
}

function featureRows(source) {
  return source.features.map(({ id, title, route }) => [id, title, route]);
}

function executablePath() {
  const absolute = path.resolve(process.argv[1]);
  return absolute.startsWith(os.homedir()) ? absolute.replace(os.homedir(), '~') : absolute;
}

function help() {
  process.stdout.write([
    line('tool', 'gyf'),
    line('usage', 'gyf [map|doctor|verify|help]'),
    'commands[3]{name,description}:',
    '  map,Refresh generated user feature guides',
    '  doctor,Check the local browser app and data service',
    '  verify,Refresh the feature map and check local readiness',
  ].join('\n') + '\n');
}

function usageError(message) {
  process.stdout.write(`${line('error', message)}\n${line('help', 'Run gyf --help for valid commands.') }\n`);
  process.exitCode = 2;
}

if (arguments_.some((argument) => argument.startsWith('--') && argument !== '--help')) {
  const unknown = arguments_.find((argument) => argument.startsWith('--') && argument !== '--help');
  usageError(`Unknown flag ${unknown}.`);
} else if (arguments_.includes('--help') || action === 'help') {
  if (arguments_.length > 1) usageError('Help accepts no additional arguments.');
  else help();
} else if (arguments_.length > 1 || !commands.includes(action)) {
  usageError(`Unknown command ${action}.`);
} else if (action === 'map') {
  try {
    const source = updateMap();
    process.stdout.write(`${line('map', 'updated')}\n${line('path', path.relative(root, publicMap))}\n${line('features', source.features.length)}\n`);
  } catch {
    process.stdout.write(`${line('error', 'The feature map could not be updated.')}\n${line('help', 'Check src/verification/features.json, then run npm run feature-map.') }\n`);
    process.exitCode = 1;
  }
} else {
  try {
    const source = action === 'verify' ? updateMap() : readFeatures();
    const serviceChecks = await checks();
    const ready = serviceChecks.every(({ status }) => status === 'ready');
    process.stdout.write([
      line('tool', 'gyf'),
      line('description', 'Checks local GetYourFit services and maintains real-browser feature guides.'),
      ...(defaultView ? [line('executable', executablePath())] : []),
      line('instance', ready ? 'ready' : 'not-ready'),
      rows('checks', ['service', 'status', 'url'], serviceChecks.map(({ name, status, url }) => [name, status, url])),
      rows('features', ['id', 'title', 'entrypoint'], featureRows(source)),
      ...(action === 'verify' ? [line('feature_map', `updated ${source.features.length} guides`)] : []),
      ...(!ready ? [line('next', 'Start the app with npm run dev, then run npm run verify.') ] : []),
      ...(ready ? [line('next', 'Drive each mapped user path with chrome-devtools-axi and retain action plus outcome evidence.') ] : []),
    ].join('\n') + '\n');
    if (!ready) process.exitCode = 1;
  } catch {
    process.stdout.write(`${line('error', 'The verification map or local health check failed.')}\n${line('help', 'Run npm run feature-map to rebuild the guide from src/verification/features.json.') }\n`);
    process.exitCode = 1;
  }
}
