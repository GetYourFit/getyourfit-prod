import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { account, contract } from './contract.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const input = { occasion: 'Family celebration', outfitType: 'separates', budget: 1001, currency: 'INR', weather: 'mild', dressCode: 'smart-casual', mustHave: 'covered shoulders', ownedRoles: [] };
let app, browser, server, directory, baseURL;
let logs = '';

before(async () => {
  await mkdir(new URL('../../../.gyf-data/', import.meta.url), { recursive: true });
  directory = await mkdtemp(`${root}.gyf-data/starter-regressions-`);
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  app = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true } } } });
  await app.listen();
  baseURL = `http://127.0.0.1:${app.httpServer.address().port}`;
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', GYF_PORT: String(port), GYF_DATA_DIR: directory,
      BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GYF_MAIL_TRANSPORT: 'disabled' },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, logs);
    try { ready = (await fetch(`http://127.0.0.1:${port}/api/session`)).ok; } catch { ready = false; }
    if (ready) break;
    await delay(100);
  }
  assert(ready, logs);
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await app?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function wearer(t) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  context.setDefaultTimeout(4000);
  t.after(() => context.close());
  let response = await context.request.post(contract.register, { data: account(), headers: { origin: baseURL } });
  if (response.status() === 429) {
    await delay(61_000);
    response = await context.request.post(contract.register, { data: account(), headers: { origin: baseURL } });
  }
  assert(response.ok(), `Signup returned ${response.status()}: ${await response.text()}`);
  const page = await context.newPage();
  return { context, page, builder: page.locator('#build-plan') };
}

async function api(context, method, endpoint = contract.starterPlans, data) {
  const cookie = (await context.cookies()).map(entry => `${entry.name}=${entry.value}`).join('; ');
  const response = await context.request.fetch(endpoint, { method, data, headers: { origin: baseURL, cookie } });
  assert(response.ok(), `${method} ${endpoint} returned ${response.status()}: ${await response.text()}`);
  return response.json();
}

async function draft(builder, values = input) {
  await builder.getByLabel(/what occasions is this for/i).fill(values.occasion);
  await builder.getByLabel(/spending ceiling/i).fill(String(values.budget));
  await builder.getByLabel(/what kind of outfit/i).selectOption(values.outfitType);
  await builder.getByLabel(/^plan weather/i).selectOption(values.weather);
  await builder.getByLabel(/^plan dress code/i).selectOption(values.dressCode);
  await builder.getByLabel(/any must-have/i).fill(values.mustHave);
  await builder.getByRole('button', { name: 'Make my starter plan', exact: true }).click();
  await builder.getByRole('heading', { name: `Needs for ${values.occasion}`, exact: true }).waitFor();
}

function roleRow(builder, role) {
  return builder.locator('.starter-needs > li').filter({ has: builder.page().getByText(role, { exact: true }) });
}

async function replaceNeed(builder, role, need) {
  const row = roleRow(builder, role);
  await row.getByRole('button', { name: 'Replace need', exact: true }).click();
  await row.getByLabel(/replacement need/i).fill(need);
  await row.getByRole('button', { name: 'Save replacement', exact: true }).click();
  await row.getByLabel(/replacement need/i).waitFor({ state: 'hidden' });
  await row.getByText(need, { exact: true }).waitFor();
}

test('R1 maximum valid constraints survive save, replacement, reload and export for every role state', async t => {
  const { context, page, builder } = await wearer(t);
  const maximum = { ...input, occasion: 'o'.repeat(120), mustHave: 'r'.repeat(160) };
  await page.goto('/wardrobe');
  await draft(builder, maximum);
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
  const initial = (await api(context, 'GET'))[0];
  await replaceNeed(builder, 'Top', initial.roles[0].need);
  for (const outfitType of ['separates', 'one-piece']) {
    const roles = outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
    for (const ownedRoles of [[], roles]) {
      const plan = await api(context, 'POST', contract.starterPlans, { ...maximum, outfitType, ownedRoles });
      const replacement = await api(context, 'PATCH', `${contract.starterPlans}/${plan.id}`, { action: 'replace-plan', input: { ...maximum, outfitType, ownedRoles, budget: 2000 } });
      assert.equal(replacement.roles.length, roles.length);
      for (const role of replacement.roles) {
        assert(role.need.includes(maximum.occasion));
        assert(role.need.includes(maximum.mustHave));
        assert.equal(role.state, ownedRoles.length ? 'confirmed-owned' : 'planned');
      }
    }
  }
  const saved = await api(context, 'GET');
  const needs = initial.roles.map(({ role, need }) => ({ role, need }));
  for (const invalid of [
    { ...maximum, needs: [needs[0], needs[0], needs[2]] },
    { ...maximum, needs: [...needs.slice(0, 2), { role: 'one-piece', need: 'Wrong outfit role' }] },
    { ...maximum, needs: needs.map(need => ({ ...need, need: 'x'.repeat(513) })) },
    { ...maximum, outfitType: 'one-piece', ownedRoles: ['top'] },
  ]) {
    const response = await context.request.post(contract.starterPlans, {
      data: invalid, headers: { origin: baseURL, cookie: (await context.cookies()).map(entry => `${entry.name}=${entry.value}`).join('; ') },
    });
    assert.equal(response.status(), 400, 'Invalid draft was persisted');
  }
  assert.deepEqual(await api(context, 'GET'), saved, 'Rejected input changed saved plans');
  const exported = await api(context, 'GET', '/api/data/export');
  assert.deepEqual(exported.starterPlans, saved);
  await page.reload();
  await builder.getByRole('heading', { name: `Your starter plan for ${maximum.occasion}`, exact: true }).waitFor();
});

test('R2 saving preserves edited draft needs and confirmations in both outfit forms', async t => {
  const { context, page, builder } = await wearer(t);
  await page.goto('/wardrobe');
  for (const outfitType of ['separates', 'one-piece']) {
    await draft(builder, { ...input, outfitType });
    const labels = outfitType === 'separates' ? ['Top', 'Bottom', 'Footwear'] : ['One-piece garment', 'Footwear'];
    for (const label of labels) await replaceNeed(builder, label, `Wearer-selected ${label}`);
    await roleRow(builder, labels[0]).getByRole('button', { name: 'I already have this', exact: true }).click();
    await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
    await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
    const saved = (await api(context, 'GET')).find(plan => plan.input.outfitType === outfitType);
    assert.deepEqual(saved.roles.map(role => role.need), labels.map(label => `Wearer-selected ${label}`));
    assert.equal(saved.roles[0].state, 'confirmed-owned');
    await page.reload();
    await builder.getByText(`Wearer-selected ${labels[0]}`, { exact: true }).waitFor();
    await builder.getByRole('button', { name: 'New plan', exact: true }).click();
  }
});

test('R3/R6/R8 ownership survives replacement timing and temporary outfit changes', async t => {
  const { context, page, builder } = await wearer(t);
  for (const timing of ['before', 'after']) {
    for (const outfitType of ['separates', 'one-piece']) {
      const saved = await api(context, 'POST', contract.starterPlans, { ...input, outfitType });
      await page.goto('/wardrobe');
      await builder.getByRole('heading', { name: `Your starter plan for ${input.occasion}`, exact: true }).waitFor();
      if (timing === 'after') {
        await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
        await builder.getByLabel(/spending ceiling/i).fill('2000');
      }
      for (const role of saved.roles) {
        const label = role.role === 'one-piece' ? 'One-piece garment' : role.role[0].toUpperCase() + role.role.slice(1);
        await roleRow(builder, label).getByRole('button', { name: 'I already have this', exact: true }).click();
        await roleRow(builder, label).getByText(/you confirmed a suitable item/i).waitFor();
        if (timing === 'after') assert(await builder.getByLabel(`I already have suitable ${label.toLowerCase()}`, { exact: false }).isChecked());
      }
      if (timing === 'before') await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
      for (const checkbox of await builder.getByRole('checkbox').all()) assert(await checkbox.isChecked());
      if (timing === 'after') assert.equal(await builder.getByLabel(/spending ceiling/i).inputValue(), '2000');
      await builder.getByLabel(/spending ceiling/i).fill('2000');
      await builder.getByRole('button', { name: 'Replace with this plan', exact: true }).click();
      await builder.getByText(/previous plan is marked replaced/i).waitFor();
      const replacement = (await api(context, 'GET')).find(plan => plan.status === 'active' && plan.input.outfitType === outfitType);
      assert(replacement.roles.every(role => role.state === 'confirmed-owned' && role.allocation === 0));
      assert.deepEqual(replacement.input.ownedRoles, saved.roles.map(role => role.role));
      assert.equal(replacement.input.budget, 2000);
      assert.deepEqual(await api(context, 'GET', contract.wardrobe), []);
    }
  }
  for (const outfitType of ['separates', 'one-piece']) {
    const pendingType = outfitType === 'separates' ? 'one-piece' : 'separates';
    const saved = await api(context, 'POST', contract.starterPlans, { ...input, outfitType });
    await page.goto('/wardrobe');
    await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
    await builder.getByLabel(/what kind of outfit/i).selectOption(pendingType);
    const selected = pendingType === 'separates' ? 'top' : 'one-piece garment';
    await builder.getByLabel(`I already have suitable ${selected}`, { exact: true }).check();
    if (pendingType === 'one-piece') await builder.getByLabel('I already have suitable footwear', { exact: true }).check();
    await builder.getByLabel(/spending ceiling/i).fill('2000');
    await builder.getByLabel(/any must-have/i).fill('My pending coverage requirement');
    for (const role of saved.roles) {
      const label = role.role === 'one-piece' ? 'One-piece garment' : role.role[0].toUpperCase() + role.role.slice(1);
      await roleRow(builder, label).getByRole('button', { name: 'I already have this', exact: true }).click();
      await roleRow(builder, label).getByText(/you confirmed a suitable item/i).waitFor();
    }
    assert(await builder.getByLabel('I already have suitable footwear', { exact: true }).isChecked());
    assert(await builder.getByLabel(`I already have suitable ${selected}`, { exact: true }).isChecked());
    await builder.getByRole('button', { name: 'Replace with this plan', exact: true }).click();
    await builder.getByText(/previous plan is marked replaced/i).waitFor();
    const replacement = (await api(context, 'GET')).find(plan => plan.status === 'active');
    assert.equal(replacement.input.outfitType, pendingType);
    assert.equal(replacement.input.budget, 2000);
    assert.equal(replacement.input.mustHave, 'My pending coverage requirement');
    assert.deepEqual(replacement.input.ownedRoles, [pendingType === 'separates' ? 'top' : 'one-piece', 'footwear']);
    assert.equal(replacement.roles.find(role => role.role === 'footwear').state, 'confirmed-owned');
  }
  for (const outfitType of ['separates', 'one-piece']) {
    const alternate = outfitType === 'separates' ? 'one-piece' : 'separates';
    const roles = outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
    await page.goto('/wardrobe');
    await builder.getByRole('button', { name: 'New plan', exact: true }).click();
    await builder.getByLabel(/what occasions is this for/i).fill('Draft with remembered ownership');
    await builder.getByLabel(/spending ceiling/i).fill('1001');
    const outfit = builder.getByLabel(/what kind of outfit/i);
    await outfit.selectOption(outfitType);
    for (const checkbox of await builder.getByRole('checkbox').all()) await checkbox.check();
    await outfit.selectOption(alternate);
    for (const checkbox of await builder.getByRole('checkbox').all()) await checkbox.check();
    await outfit.selectOption(outfitType);
    for (const checkbox of await builder.getByRole('checkbox').all()) assert(await checkbox.isChecked(), 'Draft ownership was lost after returning to its outfit form');
    await builder.getByRole('checkbox').first().uncheck();
    await outfit.selectOption(alternate);
    await outfit.selectOption(outfitType);
    assert.equal(await builder.getByRole('checkbox').first().isChecked(), false, 'An explicit ownership removal was undone');
    await builder.getByRole('button', { name: 'Make my starter plan', exact: true }).click();
    await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
    await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
    const drafted = (await api(context, 'GET'))[0];
    assert.deepEqual(drafted.input.ownedRoles, roles.slice(1));
    assert.deepEqual(drafted.roles.filter(role => role.state === 'confirmed-owned').map(role => role.role), roles.slice(1));

    for (const timing of ['before', 'while-hidden']) {
      const saved = await api(context, 'POST', contract.starterPlans, { ...input, outfitType, ownedRoles: timing === 'before' ? roles : [] });
      await page.goto('/wardrobe');
      await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
      await outfit.selectOption(alternate);
      if (timing === 'while-hidden') {
        for (const role of saved.roles) {
          const label = role.role === 'one-piece' ? 'One-piece garment' : role.role[0].toUpperCase() + role.role.slice(1);
          await roleRow(builder, label).getByRole('button', { name: 'I already have this', exact: true }).click();
          await roleRow(builder, label).getByText(/you confirmed a suitable item/i).waitFor();
        }
      }
      await outfit.selectOption(outfitType);
      for (const checkbox of await builder.getByRole('checkbox').all()) assert(await checkbox.isChecked(), `${timing} ownership was lost after returning to its outfit form`);
      await builder.getByLabel(/spending ceiling/i).fill('2000');
      await builder.getByRole('button', { name: 'Replace with this plan', exact: true }).click();
      await builder.getByText(/previous plan is marked replaced/i).waitFor();
      const replacement = (await api(context, 'GET'))[0];
      assert.deepEqual(replacement.input.ownedRoles, roles);
      assert(replacement.roles.every(role => role.state === 'confirmed-owned' && role.allocation === 0));
    }
  }
});

test('R4 retrying saved-plan loading keeps the displayed draft as the mutation target', async t => {
  const { context, page, builder } = await wearer(t);
  const saved = await api(context, 'POST', contract.starterPlans, input);
  await context.route(`**${contract.starterPlans}`, route => route.request().method() === 'GET' ? route.abort('failed') : route.continue());
  await page.goto('/wardrobe');
  await builder.getByRole('button', { name: 'Try loading saved plans again', exact: true }).waitFor();
  await draft(builder, { ...input, occasion: 'Different draft occasion' });
  await replaceNeed(builder, 'Bottom', 'My draft bottom');
  await roleRow(builder, 'Top').getByRole('button', { name: 'I already have this', exact: true }).click();
  await context.unroute(`**${contract.starterPlans}`);
  await builder.getByRole('button', { name: 'Try loading saved plans again', exact: true }).click();
  await builder.getByRole('heading', { name: 'Needs for Different draft occasion', exact: true }).waitFor();
  await builder.getByText('My draft bottom', { exact: true }).waitFor();
  await roleRow(builder, 'Top').getByText(/you confirmed a suitable item/i).waitFor();
  await replaceNeed(builder, 'Bottom', 'Still editing my draft');
  await roleRow(builder, 'Footwear').getByRole('button', { name: 'I already have this', exact: true }).click();
  await builder.getByText(/you confirmed suitable footwear is yours/i).waitFor();
  assert.deepEqual(await api(context, 'GET'), [saved]);
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
  const plans = await api(context, 'GET');
  assert.deepEqual(plans.find(plan => plan.id === saved.id), saved);
  const persisted = plans.find(plan => plan.id !== saved.id);
  assert.equal(persisted.roles.find(role => role.role === 'bottom').need, 'Still editing my draft');
  assert.deepEqual(persisted.input.ownedRoles, ['top', 'footwear']);
});

test('R5/R9 rejection returns drafts to planning and closes saved-plan replacement', async t => {
  const { context, page, builder } = await wearer(t);
  let saved = await api(context, 'POST', contract.starterPlans, input);
  saved = await api(context, 'PATCH', `${contract.starterPlans}/${saved.id}`, { action: 'confirm-owned', role: 'top' });
  await page.goto('/wardrobe');
  await builder.getByRole('button', { name: 'New plan', exact: true }).click();
  await draft(builder, { ...input, occasion: 'Discard this draft' });
  await roleRow(builder, 'Bottom').getByRole('button', { name: 'I already have this', exact: true }).click();
  await roleRow(builder, 'Top').getByRole('button', { name: 'Replace need', exact: true }).click();
  await builder.getByLabel(/replacement need/i).fill('Discard this draft edit');
  await builder.getByRole('button', { name: 'Reject plan', exact: true }).click();
  await builder.getByLabel(/what occasions is this for/i).waitFor();
  await page.waitForFunction(() => globalThis.document.activeElement === globalThis.document.querySelector('#build-plan .starter-form h3'));
  assert.equal(await builder.getByRole('button', { name: 'Save plan', exact: true }).count(), 0);
  assert.deepEqual(await api(context, 'GET'), [saved]);
  assert.deepEqual(await api(context, 'GET', contract.wardrobe), []);
  await draft(builder, { ...input, occasion: 'Try another occasion' });
  assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'Rejected draft left an editor open on the next plan');
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
  assert.deepEqual((await api(context, 'GET')).find(plan => plan.id === saved.id), saved);
  const active = (await api(context, 'GET'))[0];
  await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
  await builder.getByLabel(/spending ceiling/i).fill('2000');
  await roleRow(builder, 'Top').getByRole('button', { name: 'Replace need', exact: true }).click();
  await builder.getByLabel(/replacement need/i).fill('Discard this saved-plan edit');
  await context.route(`**${contract.starterPlans}/${active.id}`, route => route.abort('failed'));
  await builder.getByRole('button', { name: 'Reject plan', exact: true }).click();
  await builder.getByRole('alert').waitFor();
  assert.equal(await builder.getByLabel(/spending ceiling/i).inputValue(), '2000', 'Failed rejection lost the pending replacement');
  assert.equal(await builder.getByLabel(/replacement need/i).inputValue(), 'Discard this saved-plan edit', 'Failed rejection lost the pending need edit');
  assert.equal((await api(context, 'GET')).find(plan => plan.id === active.id).status, 'active');
  await context.unroute(`**${contract.starterPlans}/${active.id}`);
  await builder.getByRole('button', { name: 'Reject plan', exact: true }).click();
  await builder.getByRole('heading', { name: 'Plan rejected', exact: true }).waitFor();
  assert.equal(await builder.getByRole('button', { name: 'Replace with this plan', exact: true }).count(), 0, 'Rejected saved plan still exposes replacement submission');
  assert.equal(await builder.getByLabel(/spending ceiling/i).count(), 0, 'Rejected saved plan still shows its editing form');
  const rejected = (await api(context, 'GET')).find(plan => plan.id === active.id);
  assert.equal(rejected.status, 'rejected');
  assert.deepEqual(rejected.roles, active.roles);
  await builder.getByRole('button', { name: 'Start a new plan', exact: true }).click();
  await draft(builder, { ...input, occasion: 'New plan after saved rejection' });
  assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'Rejected saved plan left an editor open on the next plan');
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
  assert.deepEqual((await api(context, 'GET')).find(plan => plan.id === saved.id), saved);
  assert.deepEqual(await api(context, 'GET', contract.wardrobe), []);
  await t.test('R10 need editors are cleared on every displayed-plan transition', async () => {
    for (const outfitType of ['separates', 'one-piece']) {
      const labels = outfitType === 'separates' ? ['Top', 'Bottom', 'Footwear'] : ['One-piece garment', 'Footwear'];
      for (const label of labels) {
        const source = await api(context, 'POST', contract.starterPlans, { ...input, outfitType, occasion: `Editor source ${outfitType} ${label}` });
        const destination = await api(context, 'POST', contract.starterPlans, { ...input, outfitType, occasion: `Editor destination ${outfitType} ${label}` });
        await page.goto('/wardrobe');
        await builder.locator('.starter-history summary').click();
        await builder.getByRole('button', { name: `${source.input.occasion} · active`, exact: true }).click();
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        await builder.getByLabel(/replacement need/i).fill('Pending text belongs only to the source');
        await builder.getByRole('button', { name: `${destination.input.occasion} · active`, exact: true }).click();
        assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'History selection carried another plan’s pending editor');
        assert.deepEqual((await api(context, 'GET')).find(plan => plan.id === destination.id), destination);
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        await builder.getByLabel(/replacement need/i).fill('Discard this edit when starting a new plan');
        await builder.getByRole('button', { name: 'New plan', exact: true }).click();
        await draft(builder, { ...input, outfitType });
        assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'New draft inherited an editor');
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        await builder.getByLabel(/replacement need/i).fill('Discard this unaccepted edit when saving');
        await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
        await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
        assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'Saved plan inherited a draft editor');
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        await builder.getByLabel(/replacement need/i).fill('Discard this edit when replacing the whole plan');
        await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
        await builder.getByLabel(/spending ceiling/i).fill('2000');
        await builder.getByRole('button', { name: 'Replace with this plan', exact: true }).click();
        await builder.getByText(/previous plan is marked replaced/i).waitFor();
        assert.equal(await builder.getByLabel(/replacement need/i).count(), 0, 'Whole-plan replacement inherited an editor');
        const replacement = (await api(context, 'GET'))[0];
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        assert.equal(await builder.getByLabel(/replacement need/i).inputValue(), replacement.roles.find(role => role.role === (label === 'One-piece garment' ? 'one-piece' : label.toLowerCase())).need);
        await builder.locator('.starter-replace-form').getByRole('button', { name: 'Cancel', exact: true }).click();
      }
    }
  });
  await t.test('R11 pending mutations keep navigation and cancel disabled until completion', async () => {
    for (const outfitType of ['separates', 'one-piece']) {
      for (const action of ['save', 'save-load-failed', 'confirm-owned', 'replace-need', 'replace-plan', 'reject']) {
        const target = await api(context, 'POST', contract.starterPlans, { ...input, outfitType, occasion: `Pending ${outfitType} ${action}` });
        if (action === 'save-load-failed') await context.route(`**${contract.starterPlans}`, route => route.request().method() === 'GET' ? route.abort('failed') : route.continue());
        await page.goto('/wardrobe');
        if (action.startsWith('save')) {
          if (action === 'save-load-failed') await builder.getByRole('button', { name: 'Try loading saved plans again', exact: true }).waitFor();
          else await builder.getByRole('button', { name: 'New plan', exact: true }).click();
          await draft(builder, { ...input, outfitType });
        } else if (action !== 'replace-need') {
          await builder.getByRole('button', { name: 'Replace plan', exact: true }).click();
          await builder.getByLabel(/spending ceiling/i).fill('2000');
        }
        if (action === 'save-load-failed') await context.unroute(`**${contract.starterPlans}`);
        if (await builder.locator('.starter-history summary').count()) await builder.locator('.starter-history summary').click();
        const label = outfitType === 'separates' ? 'Top' : 'One-piece garment';
        await roleRow(builder, label).getByRole('button', { name: 'Replace need', exact: true }).click();
        await builder.getByLabel(/replacement need/i).fill('Pending need replacement');
        const saving = action.startsWith('save');
        const endpoint = saving ? contract.starterPlans : `${contract.starterPlans}/${target.id}`;
        const method = saving ? 'POST' : 'PATCH';
        const failing = action === 'replace-plan' && outfitType === 'one-piece';
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await context.route(`**${endpoint}`, async route => {
          if (route.request().method() !== method) return route.continue();
          await gate;
          if (failing) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Pending replacement failed. Try again.' }) });
          else await route.continue();
        });
        const trigger = saving ? builder.getByRole('button', { name: 'Save plan', exact: true })
          : action === 'confirm-owned' ? roleRow(builder, label).getByRole('button', { name: 'I already have this', exact: true })
            : action === 'replace-need' ? builder.getByRole('button', { name: 'Save replacement', exact: true })
              : action === 'replace-plan' ? builder.getByRole('button', { name: 'Replace with this plan', exact: true })
                : builder.getByRole('button', { name: 'Reject plan', exact: true });
        const triggerHandle = await trigger.elementHandle();
        assert(triggerHandle);
        try {
          await trigger.click();
          assert(await triggerHandle.isDisabled(), 'Mutation did not enter its pending state');
          for (const button of await builder.getByRole('button').all()) {
            assert(await button.isDisabled(), `${action} left ${await button.textContent()} enabled`);
            await button.evaluate(element => element.click());
          }
          for (const control of await builder.locator('input, select, textarea').all()) assert(await control.isDisabled(), 'Pending mutation left an editable field enabled');
          assert.equal(await builder.getByLabel(/replacement need/i).inputValue(), 'Pending need replacement');
        } finally {
          const response = page.waitForResponse(item => new URL(item.url()).pathname === endpoint && item.request().method() === method);
          release();
          await response;
          await context.unroute(`**${endpoint}`);
          await triggerHandle.dispose();
        }
        if (failing) {
          await builder.getByRole('alert').waitFor();
          assert.equal(await builder.getByLabel(/spending ceiling/i).inputValue(), '2000');
          assert(await builder.locator('.starter-form').getByRole('button', { name: 'Cancel', exact: true }).isEnabled());
        } else {
          const message = saving ? /plan saved in your private/i : action === 'confirm-owned' ? /you confirmed suitable/i
            : action === 'replace-need' ? /need was replaced in this plan/i : action === 'replace-plan' ? /previous plan is marked replaced/i : /plan rejected and recorded/i;
          await builder.getByRole('status').filter({ hasText: message }).waitFor();
        }
        for (const button of await builder.getByRole('button').all()) assert(await button.isEnabled(), 'Mutation left a control disabled after completion');
      }
    }
  });
});

test('Capsule: climate, occasions, budget and style produce an explained outfit set without commerce claims', async t => {
  const { context, page, builder } = await wearer(t);
  await page.goto('/wardrobe');
  assert.equal(await page.locator('input[type=file]:visible').count(), 0, 'Capsule planning asked for a garment upload');
  await builder.getByLabel(/what occasions is this for/i).fill('Office, family functions, weekends');
  await builder.getByLabel(/spending ceiling/i).fill('6000');
  assert.equal(await builder.getByLabel(/^currency/i).inputValue(), 'INR', 'India-first default currency is not INR');
  await builder.getByLabel(/^plan weather/i).selectOption('hot-humid');
  await builder.getByLabel(/^plan style/i).selectOption('indian');
  await builder.getByRole('button', { name: 'Make my starter plan', exact: true }).click();
  const capsule = builder.getByLabel('Starter capsule');
  await capsule.waitFor();
  const text = await capsule.innerText();
  assert.match(text, /breathable cotton or linen/i, 'Climate guidance is missing');
  assert.match(text, /not a verified fit/i, 'Capsule hides uncertainty');
  assert.match(text, /2 × top.*₹1,000 each/i, 'Per-piece planning share is missing or wrong');
  const outfits = await capsule.getByLabel('Outfits from this capsule').locator('li').allInnerTexts();
  assert.equal(outfits.length, 4, 'Separates capsule should mix into four looks');
  assert(outfits.some(outfit => /Office/i.test(outfit)) && outfits.some(outfit => /family functions/i.test(outfit)), 'Looks do not cover the stated occasions');
  assert(outfits.every(outfit => /Top [AB] \+ Bottom [AB] \+ Footwear A/.test(outfit)), 'Looks are not complete outfits');
  assert.doesNotMatch(await builder.innerText(), /\b(?:in stock|available to buy|buy now|delivery tomorrow|verified price)\b/i);
  assert.match(await builder.locator('.starter-needs').innerText(), /kurta/i, 'Style examples are missing from needs');
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await builder.getByText('Plan saved in your private GetYourFit account.', { exact: true }).waitFor();
  const saved = (await api(context, 'GET'))[0];
  assert.equal(saved.input.style, 'indian');
  assert.equal(saved.input.weather, 'hot-humid');
  await page.reload();
  await builder.getByLabel('Starter capsule').waitFor();
  const owned = await api(context, 'POST', contract.starterPlans, { ...input, ownedRoles: ['top', 'bottom', 'footwear'] });
  assert.equal(owned.input.style, 'unknown', 'Old-shape input must default style');
});
