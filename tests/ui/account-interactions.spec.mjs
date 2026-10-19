import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const password = randomUUID();
let accountCookies;

async function post(page, url, data) {
  return page.evaluate(async ({ url, data }) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }, { url, data });
}

test.beforeAll(async ({ browser }, testInfo) => {
  const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await page.goto('/sign-in');
  const response = await post(page, '/api/auth/sign-up/email', {
    name: 'Review regression', email: `${randomUUID()}@example.test`, password, adultConfirmed: true,
    callbackURL: new URL(page.url()).origin,
  });
  expect(response.status).toBe(200);
  accountCookies = await page.context().cookies();
  await page.close();
});

async function signedIn(page, { uncertainFit = false } = {}) {
  await page.context().addCookies(accountCookies);
  await page.goto('/wardrobe');
  await page.evaluate(async () => {
    const items = await (await fetch('/api/wardrobe')).json();
    for (const item of items) {
      const response = await fetch(`/api/wardrobe/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not reset the test wardrobe.');
    }
  });
  const items = [];
  for (const category of ['top', 'bottom', 'footwear']) {
    const image = (await sharp(new URL(`../fixtures/${category}.jpg`, import.meta.url).pathname)
      .resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
    const added = await post(page, '/api/wardrobe', { consent: true, image, facts: {
      name: `Review ${category}`, category, color: 'black', size: 'M', fit: uncertainFit && category === 'top' ? 'unknown' : 'fits',
      owned: true, available: true, weather: ['mild'], dressCode: ['casual'],
    } });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    items.push(added.body);
  }
  await page.goto('/wardrobe');
  await expect(page.getByRole('heading', { name: 'Review footwear', exact: true })).toBeVisible();
  await page.getByLabel('Occasion', { exact: true }).fill('Dinner');
  await page.getByLabel('Weather', { exact: true }).selectOption('mild');
  await page.getByLabel('Dress code', { exact: true }).selectOption('casual');
  return items;
}

for (const action of ['request', 'fit', 'exclude', 'undo']) {
  test(`discard outfit response after wardrobe removal: ${action}`, async ({ page }) => {
    const items = await signedIn(page, { uncertainFit: action === 'fit' });
    if (action === 'undo') {
      const correction = await post(page, '/api/wardrobe/correction', {
        context: { occasion: 'Dinner', weather: 'mild', dressCode: 'casual' }, garmentId: items[0].id, excluded: true,
      });
      expect(correction.status).toBe(200);
    }
    if (action !== 'request') {
      await page.getByRole('button', { name: 'Find an outfit' }).click();
      if (action === 'fit') await expect(page.getByRole('button', { name: 'Yes, it fits', exact: true })).toBeVisible();
      else if (action === 'undo') await expect(page.getByRole('button', { name: 'Allow excluded items again' })).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'Your outfit for Dinner' })).toBeVisible();
    }
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let ready;
    const captured = new Promise((resolve) => { ready = resolve; });
    await page.route('**/api/wardrobe/outfit', async (route) => {
      const response = await route.fetch();
      ready();
      await held;
      await route.fulfill({ response });
    });
    const trigger = action === 'request' ? page.getByRole('button', { name: 'Find an outfit' })
      : action === 'fit' ? page.getByRole('button', { name: 'Yes, it fits', exact: true })
      : action === 'undo' ? page.getByRole('button', { name: 'Allow excluded items again' })
      : page.getByRole('button', { name: 'Don’t use Review top for this occasion' });
    await trigger.click();
    await captured;
    await page.getByRole('button', { name: 'Remove Review footwear', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, remove', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review footwear', exact: true })).toHaveCount(0);
    try {
      release();
      await expect(page.getByRole('button', { name: 'Find an outfit' })).toBeEnabled();
      await expect(page.locator('.outfit-outcome')).toBeEmpty();
    } finally { release(); }
    await page.unroute('**/api/wardrobe/outfit');
    await page.getByRole('button', { name: 'Find an outfit' }).click();
    await expect(page.getByText('No complete outfit yet', { exact: true })).toBeVisible();
  });
}

test('fit confirmation and correction retain fresh outfit results', async ({ page }) => {
  await signedIn(page, { uncertainFit: true });
  await page.getByRole('button', { name: 'Find an outfit' }).click();
  await page.getByRole('button', { name: 'Yes, it fits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your outfit for Dinner' })).toBeFocused();
  await page.getByRole('button', { name: 'Don’t use Review top for this occasion' }).click();
  await expect(page.getByText('No complete outfit yet', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Allow excluded items again' }).click();
  await expect(page.getByRole('heading', { name: 'Your outfit for Dinner' })).toBeFocused();
});

for (const width of [768, 1440]) {
  test(`section navigation keeps focused headings below the header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signedIn(page);
    for (const [link, id] of [['Outfit', 'outfit'], ['Plan', 'build-plan']]) {
      await page.getByRole('link', { name: 'Account', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeFocused();
      await page.getByRole('link', { name: link, exact: true }).click();
      const heading = page.locator(`#${id} h2`).first();
      await expect(heading).toBeFocused();
      await expect.poll(() => heading.evaluate((element) => element.getBoundingClientRect().top
        - document.querySelector('.app-header').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
    }
    await page.getByRole('link', { name: 'Wardrobe', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your wardrobe', exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveTitle('Wardrobe · GetYourFit');
  });
}

test('authentication titles follow every signed-out view', async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ json: { signedIn: false } }));
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: {} }));
  await page.goto('/sign-in');
  await expect(page).toHaveTitle('Sign in · GetYourFit');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page).toHaveTitle('Create your account · GetYourFit');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveTitle('Sign in · GetYourFit');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page).toHaveTitle('Forgot your password? · GetYourFit');
  await expect(page.getByText('We can’t email password reset links yet.')).toBeVisible();
  await expect(page.getByText('Changing your password requires your current password.')).toBeVisible();
  await expect(page.getByText('A forgotten password cannot be recovered until email reset is connected, even if you are signed in.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page).toHaveTitle('Sign in · GetYourFit');
  await page.route('**/api/auth/sign-in/email', (route) => route.fulfill({ json: { twoFactorRedirect: true } }));
  await page.getByLabel('Email', { exact: true }).fill('review@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveTitle('Enter your code · GetYourFit');
  await page.goto('/sign-up');
  await expect(page).toHaveTitle('Create your account · GetYourFit');
  await page.getByLabel('Your name').fill('Review');
  await page.getByLabel('Email', { exact: true }).fill('review@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.route('**/api/auth/sign-up/email', (route) => route.fulfill({ status: 422, json: { code: 'USER_ALREADY_EXISTS' } }));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('We could not create the account.');
  await expect(page).toHaveTitle('Create your account · GetYourFit');
});
