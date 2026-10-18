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

async function signUp(page, email) {
  await page.goto('/sign-in');
  const response = await api(page, 'POST', '/api/auth/sign-up/email', { name: 'Quality check', email, password, adultConfirmed: true, callbackURL: new URL(page.url()).origin });
  expect(response.status).toBe(200);
}

async function addWardrobe(page) {
  for (const [file, facts] of wardrobe) {
    const image = (await sharp(fixture(file)).resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
    const response = await api(page, 'POST', '/api/wardrobe', { consent: true, image, facts: { ...facts, fit: 'fits', owned: true, available: true, weather: ['mild'], dressCode: ['casual', 'smart-casual'] } });
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
  await dialog.getByLabel('Garment photo').setInputFiles(fixture('top.jpg'));
  await expect(dialog.getByText('Choose a different photo')).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
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
