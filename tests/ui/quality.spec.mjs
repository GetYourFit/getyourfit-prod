// UI quality gate: accessibility, design-system rules, and visual regression for the main screens at each supported width.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const fixture = (name) => new URL(`../fixtures/${name}`, import.meta.url).pathname;
const widths = [390, 768, 1440];
// Baselines are rendered in CI's pinned Linux image. Other platforms render text differently, so they compare only on request.
const compareScreenshots = process.platform === 'linux' || process.env.UI_VISUAL === '1';
const password = `ui-quality-${randomUUID()}`;
const wardrobe = [
  ['top.jpg', { name: 'Grey crew tee', category: 'top', color: 'grey', size: 'M' }],
  ['bottom.jpg', { name: 'Olive cargo trousers', category: 'bottom', color: 'olive', size: '32' }],
  ['footwear.jpg', { name: 'Black trainers', category: 'footwear', color: 'black', size: '9' }],
];

// Measures the documented design-system rules on rendered, visible content.
function measureDesign() {
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const text = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !node.textContent.trim() || parent.closest('script, style, option, [aria-hidden="true"]') || !visible(parent)) continue;
    const style = getComputedStyle(parent);
    text.push({ text: node.textContent.trim().slice(0, 40), size: parseFloat(style.fontSize), family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim() });
  }
  const inlineLink = (element) => element.matches('a') && element.closest('p, li') && element.closest('p, li').textContent.trim() !== element.textContent.trim();
  const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')]
    .filter((element) => visible(element) && !inlineLink(element) && !element.closest('[inert]'))
    .map((element) => {
      const box = (element.matches('input[type=checkbox], input[type=radio]') ? element.closest('label') ?? element : element).getBoundingClientRect();
      return { name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || element.tagName).trim().slice(0, 40), height: Math.round(box.height), width: Math.round(box.width) };
    });
  return {
    smallText: text.filter((entry) => entry.size < 14),
    otherFamilies: [...new Set(text.map((entry) => entry.family).filter((family) => family !== 'Manrope'))],
    h1: document.querySelectorAll('h1').length,
    smallTargets: targets.filter((target) => target.height < 44 || target.width < 24),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  };
}

async function checkScreen(page, name, { fullPage = true } = {}) {
  for (const width of widths) {
    await test.step(`${name} at ${width}px`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      });
      const design = await page.evaluate(measureDesign);
      expect.soft(design.smallText, 'Visible text is at least 14px').toEqual([]);
      expect.soft(design.otherFamilies, 'Visible text uses only Manrope').toEqual([]);
      expect.soft(design.h1, 'The screen has exactly one h1').toBe(1);
      expect.soft(design.smallTargets, 'Interactive targets are at least 44px tall').toEqual([]);
      expect.soft(design.overflow, 'No horizontal overflow').toBe(false);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
        .violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(' ')) })));
      expect.soft(violations, 'axe WCAG 2.2 AA violations').toEqual([]);
      if (compareScreenshots && fullPage) await page.evaluate(() => window.scrollTo(0, 0));
      if (compareScreenshots) await expect.soft(page).toHaveScreenshot(`${name}-${width}.png`, { fullPage });
    });
  }
}

async function api(page, method, url, body) {
  return page.evaluate(async ([verb, path, data]) => {
    const response = await fetch(path, { method: verb, credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, [method, url, body]);
}

// The server allows five sign-ups a minute across the whole run, so a refused sign-up waits out the window rather than weakening the limit.
async function signUp(page, email) {
  await page.goto('/sign-in');
  for (let attempt = 0; ; attempt += 1) {
    const response = await api(page, 'POST', '/api/auth/sign-up/email', { name: 'Quality check', email, password, adultConfirmed: true, callbackURL: new URL(page.url()).origin });
    if (response.status === 429 && attempt < 2) { test.setTimeout(test.info().timeout + 65_000); await page.waitForTimeout(61_000); continue; }
    expect(response.status).toBe(200);
    return;
  }
}

async function addWardrobe(page, { uncertainFit = false } = {}) {
  for (const [file, facts] of wardrobe) {
    const image = (await sharp(fixture(file)).resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
    const response = await api(page, 'POST', '/api/wardrobe', { consent: true, image, facts: { ...facts, fit: uncertainFit && facts.category === 'top' ? 'unknown' : 'fits', owned: true, available: true, weather: ['mild'], dressCode: ['casual', 'smart-casual'] } });
    expect(response.status).toBe(201);
  }
}

test.beforeEach(async ({ page }) => {
  // The font uses font-display: optional, so load it into the cache before the first measured render.
  await page.goto('/');
  await page.evaluate(() => document.fonts.load('16px Manrope'));
});

test('public page', async ({ page }) => {
  await page.goto('/');
  await checkScreen(page, 'public');
});

test('account entry', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await checkScreen(page, 'sign-in');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel('Your name')).toBeFocused();
  await checkScreen(page, 'sign-up');
  await page.getByLabel('Your name').fill('Quality check');
  await page.getByLabel('Email').fill('entry@example.test');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('18 or older');
  await expect(alert).toBeFocused();
  await expect(page.getByRole('checkbox', { name: /18 or older/ })).toHaveAttribute('aria-invalid', 'true');
  await checkScreen(page, 'sign-up-error');
});

test('empty wardrobe and garment upload', async ({ page }) => {
  await signUp(page, 'upload@example.test');
  await page.goto('/wardrobe');
  await expect(page.getByRole('heading', { level: 1, name: 'Your wardrobe' })).toBeFocused();
  await checkScreen(page, 'wardrobe-empty');

  const add = page.locator('#add-garment');
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Add a garment' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /permission to use its photo/ })).toBeFocused();
  await expect(dialog.getByLabel('Garment photo')).toBeDisabled();
  await checkScreen(page, 'garment-dialog', { fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();

  await add.click();
  await dialog.getByRole('checkbox', { name: /permission to use its photo/ }).check();
  await page.route('https://huggingface.co/**', (route) => route.abort('internetdisconnected'));
  await dialog.getByLabel('Garment photo').setInputFiles(fixture('top.jpg'));
  await expect(dialog.getByText('Choose a different photo')).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(dialog.getByText(/Image classification is unavailable on this device or connection/)).toBeVisible();
  await checkScreen(page, 'garment-dialog-reviewed', { fullPage: false });
});

test('wardrobe, outfit suggestion and account', async ({ page }) => {
  await signUp(page, 'outfit@example.test');
  await addWardrobe(page);
  await page.goto('/wardrobe');
  await expect(page.getByRole('img', { name: 'Black trainers' })).toBeVisible();
  await checkScreen(page, 'wardrobe-filled');

  const occasion = page.getByLabel('Occasion', { exact: true });
  await occasion.fill('Dinner with friends');
  await page.getByRole('button', { name: 'Find an outfit' }).click();
  await expect(page.getByText('What weather should this outfit work for?')).toBeFocused();
  await checkScreen(page, 'outfit-question');

  await page.getByLabel('Weather', { exact: true }).selectOption('mild');
  await page.getByLabel('Dress code', { exact: true }).selectOption('casual');
  await page.getByRole('button', { name: 'Find an outfit' }).click();
  const result = page.getByRole('heading', { name: 'Your outfit for Dinner with friends' });
  await expect(result).toBeFocused();
  await checkScreen(page, 'outfit-result');

  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeFocused();
  await checkScreen(page, 'account');
});

test('concurrent wardrobe refreshes and edits preserve confirmed facts', async ({ page }) => {
  await signUp(page, `concurrent-${randomUUID()}@example.test`);
  for (const action of ['edit', 'remove']) {
    await test.step(action, async () => {
      const previous = await api(page, 'GET', '/api/wardrobe');
      expect(previous.status).toBe(200);
      for (const item of previous.body) expect((await api(page, 'DELETE', `/api/wardrobe/${item.id}`)).status).toBe(200);
      await addWardrobe(page, { uncertainFit: true });
      await page.goto('/wardrobe');
      await page.getByLabel('Occasion', { exact: true }).fill('Dinner');
      await page.getByLabel('Weather', { exact: true }).selectOption('mild');
      await page.getByLabel('Dress code', { exact: true }).selectOption('casual');
      await page.getByRole('button', { name: 'Find an outfit' }).click();
      await expect(page.getByRole('button', { name: 'Yes, it fits', exact: true })).toBeVisible();

      const held = Promise.withResolvers();
      const captured = Promise.withResolvers();
      const delivered = Promise.withResolvers();
      await page.route('**/api/wardrobe', async (route) => {
        const response = await route.fetch();
        captured.resolve();
        await held.promise;
        await route.fulfill({ response });
        delivered.resolve();
      }, { times: 1 });
      try {
        await page.getByRole('button', { name: 'Yes, it fits', exact: true }).click();
        await captured.promise;
        if (action === 'edit') {
          await page.getByRole('button', { name: 'Edit Grey crew tee', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Edit Grey crew tee', exact: true });
          await dialog.getByLabel('Name', { exact: true }).fill('Renamed tee');
          await dialog.getByRole('button', { name: 'Save changes' }).click();
          await expect(dialog).toBeHidden();
          await page.getByRole('button', { name: 'Edit Renamed tee', exact: true }).click();
          const unchanged = page.getByRole('dialog', { name: 'Edit Renamed tee', exact: true });
          const patches = [];
          const recordPatch = (request) => { if (request.method() === 'PATCH') patches.push(request.url()); };
          page.on('request', recordPatch);
          try {
            await unchanged.getByRole('button', { name: 'Save changes' }).click();
            await expect(unchanged).toBeHidden();
            expect.soft(patches).toEqual([]);
          } finally { page.off('request', recordPatch); }
        } else {
          await page.getByRole('button', { name: 'Remove Black trainers', exact: true }).click();
          await page.getByRole('button', { name: 'Yes, remove', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Black trainers', exact: true })).toHaveCount(0);
        }
        held.resolve();
        await delivered.promise;
        await expect(page.getByRole('button', { name: 'Find an outfit' })).toBeEnabled();
        const current = await api(page, 'GET', '/api/wardrobe');
        expect(current.status).toBe(200);
        if (action === 'edit') {
          const top = current.body.find((item) => item.facts.category === 'top');
          expect.soft(top.facts.name).toBe('Renamed tee');
          expect.soft(top.facts.fit).toBe('fits');
          await expect.soft(page.getByRole('article', { name: 'Renamed tee' })).toBeVisible();
        } else {
          expect(current.body.some((item) => item.facts.category === 'footwear')).toBe(false);
          await expect.soft(page.getByRole('heading', { name: 'Black trainers', exact: true })).toHaveCount(0);
        }
      } finally { held.resolve(); }
    });
  }
});

test('plan page', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('See your outfit in a minute.');
  await checkScreen(page, 'plan-empty');
});

test('visitor gets an outfit board without an account, then saves it after sign-up', async ({ page }) => {
  const hosts = new Set();
  const steps = [];
  page.on('request', (request) => {
    hosts.add(new URL(request.url()).host);
    if (request.url().endsWith('/api/funnel')) steps.push(request.postDataJSON().event);
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Plan an outfit now' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByLabel('What is the occasion?').fill('Dinner with friends');
  await page.getByRole('radio', { name: 'Cold' }).check();
  await page.getByRole('button', { name: 'Show my outfit' }).click();
  const heading = page.getByRole('heading', { name: 'Your outfit for Dinner with friends' });
  await expect(heading).toBeFocused();
  const board = page.getByRole('figure');
  await expect(board.getByRole('img')).toHaveCount(3);
  await expect.poll(() => board.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Why this works' })).toBeVisible();
  await expect(page.getByText('For cold weather')).toBeVisible();
  const alts = () => board.locator('img').evaluateAll((images) => images.map((image) => image.alt));
  const first = await alts();
  await page.getByRole('button', { name: 'Look 2' }).click();
  await expect(page.getByRole('button', { name: 'Look 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(await alts()).not.toEqual(first);
  await page.getByRole('button', { name: 'Look 1' }).click();
  expect(await alts()).toEqual(first);
  await checkScreen(page, 'plan-result');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as image' }).click();
  expect((await downloading).suggestedFilename()).toBe('getyourfit-outfit.png');
  await page.getByRole('button', { name: 'Save this outfit' }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByLabel('Your name').fill('Visitor');
  await page.getByLabel('Email', { exact: true }).fill(`visitor-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  if (await page.getByRole('alert').first().isVisible({ timeout: 1500 }).catch(() => false)) {
    test.setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
  }
  const builder = page.locator('#build-plan');
  await expect(builder.getByRole('heading', { name: 'Needs for Dinner with friends' })).toBeVisible();
  await builder.getByRole('button', { name: 'Save plan' }).click();
  await expect(builder.getByRole('status').filter({ hasText: 'Plan saved' })).toBeVisible();
  await expect.poll(() => steps.includes('plan_saved_after_visit')).toBe(true);
  expect(steps).toEqual(['plan_opened', 'plan_submitted', 'outfit_shown', 'save_prompt_shown', 'save_prompt_accepted', 'plan_saved_after_visit']);
  expect([...hosts]).toEqual([new URL(page.url()).host]);
});

test('starter plan with shopping links', async ({ page }) => {
  await signUp(page, 'plan@example.test');
  await page.goto('/wardrobe');
  const builder = page.locator('#build-plan');
  await builder.getByLabel('What is the occasion?').fill('College days');
  await builder.getByLabel('Spending ceiling').fill('3000');
  await builder.getByLabel('Plan weather').selectOption('warm');
  await builder.getByLabel('Plan dress code').selectOption('casual');
  await builder.getByLabel('I already have suitable footwear').check();
  await builder.getByRole('button', { name: 'Make my starter plan' }).click();
  await expect(builder.getByRole('heading', { name: 'Needs for College days' })).toBeFocused();
  const shop = builder.getByRole('region', { name: 'Where to shop for this outfit' });
  await shop.getByRole('radio', { name: 'Men’s', exact: true }).check();
  await expect(shop.getByRole('link', { name: /Affiliate link/ }).first()).toBeVisible();
  await checkScreen(page, 'starter-plan-shopping');
});

test('design gates reject known defects', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.insertAdjacentHTML('beforeend', '<h1>Second title</h1><p style="font-size:12px">Tiny caption</p><p style="font-family:Georgia">Serif copy</p><button style="min-height:0;height:30px;padding:0 8px">Small</button><div style="width:3000px;height:1px"></div><p style="color:#9aa39e">Faint text</p>');
  });
  const design = await page.evaluate(measureDesign);
  expect(design.smallText.map((entry) => entry.text)).toContain('Tiny caption');
  expect(design.otherFamilies).toContain('Georgia');
  expect(design.h1).toBe(2);
  expect(design.smallTargets.map((target) => target.name)).toContain('Small');
  expect(design.overflow).toBe(true);
  await page.evaluate(axeSource);
  const ids = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2aa'] } })).violations.map(({ id }) => id));
  expect(ids).toContain('color-contrast');
});
