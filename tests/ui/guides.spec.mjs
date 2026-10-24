import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, expect } from './fixtures.mjs';
import { guides, guideOrigin, guidePath } from '../../shared/guides.ts';

const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test('guides remain readable without JavaScript, with accessible links and responsive content', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/guides/', ...guides.map(guidePath)]) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${guideOrigin}${route}`);
        expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
        await page.keyboard.press('Enter');
        expect(new URL(page.url()).hash).toBe('#guide-main');
        const invalidAnchors = await page.locator('a[href^="#"]').evaluateAll((links) => links.filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.href));
        expect(invalidAnchors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        const broken = await page.locator('img').evaluateAll((images) => images.filter((image) => image.complete && !image.naturalWidth).map((image) => image.src));
        expect(broken).toEqual([]);
      }
    }
    for (const entry of requests) {
      expect(new URL(entry.url).origin).toBe(baseURL);
      expect(entry.type).not.toBe('script');
      expect(new URL(entry.url).pathname).not.toMatch(/^\/api\//);
    }
    await page.goto(guidePath(guides[1]));
    await page.getByText('Photograph credits and licences', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Source records and image provenance' })).toBeVisible();
    await page.getByRole('link', { name: 'Start my private wardrobe', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-up\?next=%2Fwardrobe$/);
  } finally {
    await context.close();
  }
});

test('guide accessibility at mobile, tablet and desktop widths', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/guides/', ...guides.map(guidePath)]) {
      await page.goto(route);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })));
      expect(violations).toEqual([]);
    }
  }
});

for (const width of [390, 1440]) test(`guide to account entry and saved plan at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(guidePath(guides[0]));
  await page.getByRole('link', { name: 'Create an account to plan', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fplan$/);
  await page.getByLabel('Your name', { exact: true }).fill('Guide journey test');
  await page.getByLabel('Email', { exact: true }).fill(`guide-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(`guide-test-${randomUUID()}`);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL((url) => ['/wardrobe', '/plan'].includes(url.pathname));
  await page.goto('/wardrobe#build-plan');
  const builder = page.locator('#build-plan');
  await builder.getByLabel('What is the occasion?').fill('Office day');
  await builder.getByLabel('Spending ceiling').fill('3000');
  await builder.getByLabel('Plan weather').selectOption('warm');
  await builder.getByLabel('Plan dress code').selectOption('smart-casual');
  await builder.getByRole('button', { name: 'Make my starter plan' }).click();
  await builder.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(builder.getByRole('heading', { name: 'Your starter plan for Office day' })).toBeVisible();
  await page.reload();
  await expect(builder.getByRole('heading', { name: 'Your starter plan for Office day' })).toBeVisible();
  const plans = await page.evaluate(async () => (await fetch('/api/wardrobe/starter-plans')).json());
  expect(plans).toHaveLength(1);
  expect(plans[0].input).toMatchObject({ occasion: 'Office day', weather: 'warm', dressCode: 'smart-casual' });
});
