import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from './fixtures.mjs';

const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const password = `continuity-${randomUUID()}`;
const email = `${randomUUID()}@example.test`;
let cookies;
const endpoint = '**/api/wardrobe/starter-plans';

test.beforeAll(async ({ browser }, testInfo) => {
  const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await page.goto('/sign-up');
  await register(page, email);
  cookies = await page.context().cookies();
  await page.close();
});

async function register(page, address = `${randomUUID()}@example.test`) {
  await page.getByLabel('Your name').fill('Outfit continuity');
  await page.getByLabel('Email', { exact: true }).fill(address);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  const response = page.waitForResponse('**/api/auth/sign-up/email');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  if ((await response).status() === 429) {
    test.setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your wardrobe|A wardrobe starts/);
}

async function choose(page, { onePiece = false, zeroBudget = false } = {}) {
  const occasion = `Dinner ${randomUUID().slice(0, 8)}`;
  await page.goto('/plan');
  let address;
  if (new URL(page.url()).pathname === '/sign-in') {
    address = `${randomUUID()}@example.test`;
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await register(page, address);
  }
  await page.getByLabel('What is the occasion?').fill(occasion);
  if (onePiece) await page.getByRole('radio', { name: 'One-piece and shoes', exact: true }).check();
  if (zeroBudget) await page.getByLabel('Spending ceiling').fill('0');
  await page.getByRole('button', { name: 'Show my outfit' }).click();
  const look = onePiece ? 'Look 2' : 'Look 4';
  await page.getByRole('button', { name: look, exact: true }).click();
  await expect(page.getByRole('button', { name: look, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const images = await garments(page);
  return { occasion, look, images, address };
}

async function garments(page) {
  const images = page.getByRole('figure').locator('img');
  await expect(images.first()).toBeVisible();
  return images.evaluateAll(async (elements) => {
    await Promise.all(elements.map((image) => image.decode()));
    return elements.map((image) => ({ alt: image.alt, src: image.getAttribute('src') }));
  });
}

async function save(page) {
  await page.getByRole('button', { name: /Save this (plan|outfit)/, exact: true }).click();
}

async function downloadBoard(page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as image', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('getyourfit-outfit.png');
  return readFile(await download.path());
}

async function assertSaved(page, chosen) {
  const builder = page.locator('#build-plan');
  await expect(builder.locator('.starter-state-active')).toBeVisible();
  await expect(builder.getByRole('button', { name: chosen.look, exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await garments(page)).toEqual(chosen.images);
  await expect(builder.locator('.starter-form')).toHaveCount(0);
  await expect(builder.getByRole('button', { name: /^(Save plan|Try saving plan again)$/ })).toHaveCount(0);
  expect(await builder.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector('[aria-labelledby=clothes-title]')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const plans = await page.evaluate(async () => {
    const response = await fetch('/api/wardrobe/starter-plans');
    if (!response.ok) throw new Error(`Saved-plan read failed: ${response.status}`);
    return response.json();
  });
  const matches = plans.filter((plan) => plan.input.occasion === chosen.occasion);
  expect(matches).toHaveLength(1);
  expect(matches[0].input.selectedLook).toBe(chosen.look === 'Look 4' ? 3 : 1);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).toBeNull();
  return matches[0];
}

for (const width of [390, 1440]) {
  test.describe(`first outfit at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    });

    test('Look 4 is planned after signup, then survives saving, refresh and return', async ({ page }) => {
      const chosen = await choose(page);
      const image = await downloadBoard(page);
      await page.screenshot({ path: test.info().outputPath('signed-in-chosen-look.png'), fullPage: true });
      let saves = 0;
      page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/starter-plans')) saves += 1; });
      await save(page);
      const address = chosen.address;
      await assertSaved(page, chosen);
      await page.screenshot({ path: test.info().outputPath('saved-chosen-look.png'), fullPage: true });
      expect(saves).toBe(1);
      expect(await downloadBoard(page)).toEqual(image);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })));
      expect(violations).toEqual([]);
      await page.reload();
      await assertSaved(page, chosen);
      await page.getByRole('link', { name: 'Account', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL('/');
      await page.goto('/sign-in');
      await page.getByLabel('Email', { exact: true }).fill(address);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await assertSaved(page, chosen);
    });

    test('existing-user signin keeps Look 4 and the saved result first', async ({ page }) => {
      await page.goto('/plan');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByLabel('What is the occasion?')).toBeVisible();
      const chosen = await choose(page);
      await page.getByRole('button', { name: 'Show my outfit' }).click();
      await expect(page.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Look 4', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await garments(page)).toEqual(chosen.images);
      await save(page);
      await assertSaved(page, chosen);
      await page.getByRole('link', { name: 'Account', exact: true }).click();
      await page.getByRole('link', { name: 'Wardrobe', exact: true }).click();
      await assertSaved(page, chosen);
      await page.locator('.starter-details > summary').click();
      await page.getByRole('button', { name: 'New plan', exact: true }).click();
      await expect(page.locator('.starter-form')).toBeVisible();
      await page.locator('.starter-form').getByLabel('What is the occasion?', { exact: true }).fill('Another occasion');
      await expect(page.locator('.starter-form').getByLabel('What is the occasion?', { exact: true })).toHaveValue('Another occasion');
    });

    test('blocked browser storage retains the selected plan through saving', async ({ page }) => {
      await page.addInitScript(() => {
        for (const method of ['getItem', 'setItem', 'removeItem']) {
          Storage.prototype[method] = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
        }
      });
      const chosen = await choose(page);
      await save(page);
      const builder = page.locator('#build-plan');
      await expect(builder.locator('.starter-state-active')).toBeVisible();
      await expect(builder.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await garments(page)).toEqual(chosen.images);
      await page.reload();
      await expect(builder.locator('.starter-state-active')).toBeVisible();
      expect(await garments(page)).toEqual(chosen.images);
    });

    for (const committed of [false, true]) {
      test(`failed save retains the draft until retry (${committed ? 'response lost after commit' : 'server unavailable'})`, async ({ page }) => {
        await page.context().addCookies(cookies);
        const chosen = await choose(page);
        await page.route(endpoint, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          if (committed) await route.fetch();
          await route.abort('connectionfailed');
        });
        await save(page);
        const builder = page.locator('#build-plan');
        await expect(builder.getByRole('alert')).toContainText('could not be saved');
        expect(await garments(page)).toEqual(chosen.images);
        expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).input.selectedLook)).toBe(3);
        await page.unroute(endpoint);
        await builder.getByRole('button', { name: 'Try saving plan again' }).click();
        await assertSaved(page, chosen);
        await page.reload();
        await assertSaved(page, chosen);
      });
    }

    test('a look chosen after a failed save is the look the retry saves', async ({ page }) => {
      await page.context().addCookies(cookies);
      await choose(page);
      await page.route(endpoint, (route) => route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue());
      await save(page);
      const builder = page.locator('#build-plan');
      await expect(builder.getByRole('alert')).toContainText('could not be saved');
      await builder.getByRole('button', { name: 'Look 2', exact: true }).click();
      await expect(builder.getByRole('button', { name: 'Look 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const images = await garments(page);
      const occasion = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).input.occasion);
      expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).input.selectedLook)).toBe(1);
      await page.unroute(endpoint);
      await builder.getByRole('button', { name: 'Try saving plan again' }).click();
      await assertSaved(page, { occasion, look: 'Look 2', images });
    });

    for (const signOut of [true, false]) {
      test(`an unsaved plan never reaches another account (${signOut ? 'after sign out' : 'after the session changes'})`, async ({ page }) => {
        const chosen = await choose(page);
        await page.route(endpoint, (route) => route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue());
        await save(page);
        await expect(page.locator('#build-plan').getByRole('alert')).toContainText('could not be saved');
        await page.unroute(endpoint);
        if (signOut) {
          await page.getByRole('link', { name: 'Account', exact: true }).click();
          await page.getByRole('button', { name: 'Sign out', exact: true }).click();
          await expect(page).toHaveURL('/');
          await page.goto('/sign-in');
          await page.getByLabel('Email', { exact: true }).fill(email);
          await page.getByLabel('Password', { exact: true }).fill(password);
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        } else {
          await page.context().clearCookies();
          await page.context().addCookies(cookies);
          await page.goto('/wardrobe');
        }
        await expect(page.getByRole('heading', { name: 'Your wardrobe', exact: true })).toBeVisible();
        await expect(page.locator('#build-plan').getByRole('button', { name: 'Try loading saved plans again' })).toHaveCount(0);
        expect(await page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).toBeNull();
        const plans = await page.evaluate(async () => (await fetch('/api/wardrobe/starter-plans')).json());
        expect(plans.filter((plan) => plan.input.occasion === chosen.occasion)).toEqual([]);
      });
    }

    for (const refresh of [false, true]) {
      test(`a look chosen after a lost save response is the look that stays saved (${refresh ? 'refresh' : 'retry'})`, async ({ page }) => {
        await page.context().addCookies(cookies);
        await choose(page);
        await page.route(endpoint, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          await route.fetch();
          await route.abort('connectionfailed');
        });
        await save(page);
        const builder = page.locator('#build-plan');
        await expect(builder.getByRole('alert')).toContainText('could not be saved');
        await builder.getByRole('button', { name: 'Look 2', exact: true }).click();
        await expect(builder.getByRole('button', { name: 'Look 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const images = await garments(page);
        const occasion = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).input.occasion);
        await page.unroute(endpoint);
        if (refresh) await page.reload();
        else await builder.getByRole('button', { name: 'Try saving plan again' }).click();
        await assertSaved(page, { occasion, look: 'Look 2', images });
        await page.reload();
        await assertSaved(page, { occasion, look: 'Look 2', images });
      });
    }

    test('a look chosen on a saved plan stays chosen after reload and confirming a piece', async ({ page }) => {
      await page.context().addCookies(cookies);
      const chosen = await choose(page);
      await save(page);
      await assertSaved(page, chosen);
      const builder = page.locator('#build-plan');
      await builder.getByRole('button', { name: 'Look 1', exact: true }).click();
      await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toBeEnabled();
      const images = await garments(page);
      await page.reload();
      await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await garments(page)).toEqual(images);
      await builder.locator('.starter-details > summary').click();
      await builder.locator('.starter-needs > li').first().getByRole('button', { name: 'I already have this', exact: true }).click();
      await expect(builder.locator('.board-tile-owned')).toHaveText('Your own top');
      await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toBeEnabled();
      expect(await garments(page)).toEqual(images.slice(1));
      await page.reload();
      await expect(builder.locator('.board-tile-owned')).toHaveText('Your own top');
      await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await garments(page)).toEqual(images.slice(1));
    });

    test('a look chosen after a failed plan list load is the look the retry saves', async ({ page }) => {
      await page.context().addCookies(cookies);
      await choose(page);
      await page.route(endpoint, (route) => route.request().method() === 'GET' ? route.abort('connectionfailed') : route.continue());
      await save(page);
      const builder = page.locator('#build-plan');
      await expect(builder.getByRole('alert')).toContainText('could not connect');
      await builder.getByRole('button', { name: 'Look 2', exact: true }).click();
      await expect(builder.getByRole('button', { name: 'Look 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const images = await garments(page);
      const occasion = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).input.occasion);
      await page.unroute(endpoint);
      await builder.getByRole('button', { name: 'Try loading saved plans again' }).click();
      await assertSaved(page, { occasion, look: 'Look 2', images });
    });

    test('slow plan loading and saving cannot change the in-flight chosen look', async ({ page }) => {
      await page.context().addCookies(cookies);
      const chosen = await choose(page);
      let release;
      const paused = new Promise((resolve) => { release = resolve; });
      let loading;
      const requested = new Promise((resolve) => { loading = resolve; });
      let releaseSave;
      const pausedSave = new Promise((resolve) => { releaseSave = resolve; });
      let saving;
      const saveRequested = new Promise((resolve) => { saving = resolve; });
      await page.route(endpoint, async (route) => {
        if (route.request().method() === 'GET') { loading(); await paused; }
        if (route.request().method() === 'POST') { saving(); await pausedSave; }
        await route.continue();
      });
      await save(page);
      await requested;
      const builder = page.locator('#build-plan');
      await expect(builder.getByRole('button', { name: 'Look 2', exact: true })).toBeDisabled();
      await expect(builder.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      release();
      await saveRequested;
      await expect(builder.getByRole('button', { name: 'Look 2', exact: true })).toBeDisabled();
      await expect(builder.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
      releaseSave();
      await assertSaved(page, chosen);
    });

    test('a pending record without a chosen look is discarded rather than saved as Look 1', async ({ page }) => {
      await page.context().addCookies(cookies);
      const chosen = await choose(page);
      await page.route(endpoint, (route) => route.request().method() === 'GET' ? route.abort('connectionfailed') : route.continue());
      await save(page);
      await expect(page.locator('#build-plan').getByRole('alert')).toContainText('could not connect');
      await page.evaluate(() => {
        const held = JSON.parse(sessionStorage.getItem('gyf.pending-plan'));
        delete held.input.selectedLook;
        sessionStorage.setItem('gyf.pending-plan', JSON.stringify(held));
      });
      await page.unroute(endpoint);
      await page.reload();
      await expect(page.locator('#build-plan')).toBeVisible();
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).toBeNull();
      const plans = await page.evaluate(async () => (await fetch('/api/wardrobe/starter-plans')).json());
      expect(plans.filter((plan) => plan.input.occasion === chosen.occasion)).toEqual([]);
    });

    for (const replacement of [false, true]) {
      test(`a ${replacement ? 'replacement' : 'new'} plan after an abandoned unsaved visitor plan is saved as itself`, async ({ page }) => {
        await page.context().addCookies(cookies);
        const first = await choose(page);
        await save(page);
        await assertSaved(page, first);
        await choose(page);
        await page.route(endpoint, async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          await route.fetch();
          await route.abort('connectionfailed');
        });
        await save(page);
        const builder = page.locator('#build-plan');
        await expect(builder.getByRole('alert')).toContainText('could not be saved');
        const abandonedId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gyf.pending-plan')).id);
        await page.unroute(endpoint);
        await builder.locator('.starter-history > summary').click();
        await builder.locator('.starter-history').getByRole('button').first().click();
        const details = builder.locator('.starter-details > summary');
        if (await details.count()) await details.click();
        await builder.getByRole('button', { name: replacement ? 'Replace plan' : /^(New plan|Start a new plan)$/, exact: true }).first().click();
        const occasion = `Brunch ${randomUUID().slice(0, 8)}`;
        await builder.getByLabel('What is the occasion?').fill(occasion);
        await builder.getByLabel('Spending ceiling').fill('1000');
        if (replacement) {
          await builder.getByLabel('What kind of outfit do you need?').selectOption('one-piece');
          await builder.getByRole('button', { name: 'Replace with this plan' }).click();
        } else {
          await builder.getByRole('button', { name: 'Make my starter plan' }).click();
          await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
        }
        await expect(builder.getByRole('heading', { name: `Your starter plan for ${occasion}` })).toBeVisible();
        const plans = await page.evaluate(async () => (await fetch('/api/wardrobe/starter-plans')).json());
        const saved = plans.filter((plan) => plan.input.occasion === occasion);
        expect(saved).toHaveLength(1);
        expect(saved[0].id).not.toBe(abandonedId);
        expect(await page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).toBeNull();
        if (replacement) {
          expect(saved[0].roles.map((role) => role.role)).toEqual(['one-piece', 'footwear']);
          await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
        }
        await page.reload();
        await expect(builder.getByRole('heading', { name: `Your starter plan for ${occasion}` })).toBeVisible();
      });
    }

    test('a stale tab cannot save its plan into the account now using the shared session', async ({ page }) => {
      const chosen = await choose(page);
      await page.route(endpoint, (route) => route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue());
      await save(page);
      const builder = page.locator('#build-plan');
      await expect(builder.getByRole('alert')).toContainText('could not be saved');
      await page.unroute(endpoint);
      await page.context().clearCookies();
      await page.context().addCookies(cookies);
      await builder.getByRole('button', { name: 'Try saving plan again' }).click();
      await expect(page.getByRole('alert')).toContainText('session has ended or changed');
      await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
      await expect(page.locator('main')).not.toContainText(chosen.occasion);
      await page.goto('/wardrobe');
      await expect(page.getByRole('heading', { name: 'Your wardrobe', exact: true })).toBeVisible();
      const plans = await page.evaluate(async () => (await fetch('/api/wardrobe/starter-plans')).json());
      expect(plans.filter((plan) => plan.input.occasion === chosen.occasion)).toEqual([]);
      expect(await page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).toBeNull();
    });

    test('one-piece chosen look and zero spending ceiling survive saving', async ({ page }) => {
      await page.context().addCookies(cookies);
      const chosen = await choose(page, { onePiece: true, zeroBudget: true });
      expect(chosen.images).toHaveLength(2);
      await save(page);
      const plan = await assertSaved(page, chosen);
      expect(plan.input.budget).toBe(0);
      expect(plan.roles.map((role) => role.role)).toEqual(['one-piece', 'footwear']);
      await page.reload();
      await assertSaved(page, chosen);
    });

    for (const pending of [false, true]) {
      test(`outage then retry restores ${pending ? 'the pending visitor plan' : 'the saved plan'} and clears the error`, async ({ page }) => {
        await page.context().addCookies(cookies);
        const chosen = await choose(page);
        if (!pending) { await save(page); await assertSaved(page, chosen); }
        await page.route(endpoint, (route) => route.request().method() === 'GET' ? route.abort('connectionfailed') : route.continue());
        if (pending) await save(page); else await page.reload();
        const builder = page.locator('#build-plan');
        await expect(builder.getByRole('alert')).toContainText('could not connect');
        if (pending) {
          expect(await garments(page)).toEqual(chosen.images);
          expect(await page.evaluate(() => sessionStorage.getItem('gyf.pending-plan'))).not.toBeNull();
          await page.reload();
          await expect(builder.getByRole('alert')).toBeVisible();
        }
        await page.unroute(endpoint);
        await builder.getByRole('button', { name: 'Try loading saved plans again' }).click();
        await assertSaved(page, chosen);
        await expect(builder.getByRole('alert')).toHaveCount(0);
        await expect(builder.getByRole('button', { name: 'Try loading saved plans again' })).toHaveCount(0);
      });
    }
  });
}
