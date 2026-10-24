import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures.mjs';

const password = `auth-first-${randomUUID()}`;

async function register(page) {
  const email = `${randomUUID()}@example.test`;
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Your name').fill('Auth first');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/A wardrobe starts|Your wardrobe|Account/);
  if (new URL(page.url()).pathname === '/plan') await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  return email;
}

for (const width of [390, 768, 1440]) {
  test(`guest direct URLs and forged state require account entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Example outfit', exact: true }).getByRole('button')).toHaveCount(0);
    await page.evaluate(() => {
      localStorage.setItem('signedIn', 'true');
      sessionStorage.setItem('session', JSON.stringify({ signedIn: true, id: 'forged' }));
      history.pushState({ signedIn: true }, '', '/plan');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('What is the occasion?')).toHaveCount(0);
    for (const path of ['/plan', '/plan?look=3', '/wardrobe', '/account']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in\?next=/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
      await page.reload();
      await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Show my outfit|Find an outfit|Add garment/ })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('only allowlisted destinations survive account entry and mode switches', async ({ page }) => {
  for (const path of ['https://outside.example/plan', '//outside.example', '/\\outside.example', '/plan?next=https://outside.example', '/api/data/export', '/wardrobe#unknown']) {
    await page.goto(`/sign-in?next=${encodeURIComponent(path)}`);
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    expect(new URL(page.url()).searchParams.get('next')).toBe('/wardrobe');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect(new URL(page.url()).searchParams.get('next')).toBe('/wardrobe');
  }
  await page.goto('/sign-in?next=https%3A%2F%2Foutside.example');
  await register(page);
  await expect(page).toHaveURL('/wardrobe');
  for (const destination of ['/account', '/wardrobe#outfit', '/wardrobe#build-plan', '/plan']) {
    await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`);
    await expect(page).toHaveURL(destination);
  }
});

for (const failure of ['unavailable', 'malformed']) {
  test(`account entry retries the ${failure} session check without opening the planner`, async ({ page }) => {
    await page.route('**/api/session', (route) => route.fulfill({ status: failure === 'unavailable' ? 503 : 200, contentType: 'application/json', body: '{"signedIn":true}' }));
    await page.goto('/sign-up?next=%2Fplan');
    await expect(page.getByRole('alert')).toContainText(failure === 'unavailable' ? 'temporarily unavailable' : 'could not check your session');
    await expect(page.getByLabel('What is the occasion?')).toHaveCount(0);
    await page.unroute('**/api/session');
    await page.getByRole('button', { name: 'Try the connection again', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/plan');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  });
}

test('expired session blocks look choices, then preserves the requested planner after signin', async ({ page }) => {
  await page.goto('/plan');
  const email = await register(page);
  await page.getByLabel('What is the occasion?').fill('Dinner');
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look 1', exact: true })).toBeVisible();
  await page.evaluate(() => fetch('/api/auth/sign-out-everywhere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await page.getByRole('button', { name: 'Look 4', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('session has ended');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Look 4', exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/plan');
  await expect(page.getByLabel('What is the occasion?')).toBeVisible();
});

test('save interrupted by expiry keeps the chosen plan for the same account', async ({ page }) => {
  await page.goto('/plan');
  const email = await register(page);
  await page.getByLabel('What is the occasion?').fill('Private dinner');
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await page.getByRole('button', { name: 'Look 4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const images = await page.getByRole('figure').locator('img').evaluateAll((items) => items.map((image) => image.getAttribute('src')));
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Save this plan', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Private dinner');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/wardrobe#build-plan');
  const builder = page.locator('#build-plan');
  await expect(builder.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await builder.getByRole('figure').locator('img').evaluateAll((items) => items.map((image) => image.getAttribute('src')))).toEqual(images);
  await page.reload();
  await expect(builder.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('planner connection failure retains answers and offers a useful retry', async ({ page }) => {
  await page.goto('/plan');
  await register(page);
  await page.getByLabel('What is the occasion?').fill('Dinner');
  await page.route('**/api/session', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Check your connection and try again');
  await expect(page.getByLabel('What is the occasion?')).toHaveValue('Dinner');
  await page.unroute('**/api/session');
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your outfit for Dinner' })).toBeVisible();
});

async function slowSession(page) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/session', async (route) => { await gate; await route.continue(); });
  return async () => { release(); };
}

test('slow look choice cannot race the planner save or a new submission', async ({ page }) => {
  await page.goto('/plan');
  await register(page);
  await page.getByLabel('What is the occasion?').fill('Dinner');
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await page.getByRole('button', { name: 'Look 1', exact: true }).waitFor();
  const release = await slowSession(page);
  await page.getByRole('button', { name: 'Look 4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save this plan', exact: true })).toBeDisabled();
  await expect(page.getByLabel('What is the occasion?').locator('xpath=ancestor::form').locator('button[type=submit]')).toBeDisabled();
  await release();
  await expect(page.getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save this plan', exact: true }).click();
  await expect(page).toHaveURL('/wardrobe#build-plan');
  await expect(page.locator('#build-plan').getByRole('button', { name: 'Look 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('slow look choice in the saved-plan builder blocks saving until it settles', async ({ page }) => {
  await page.goto('/plan');
  await register(page);
  await page.getByLabel('What is the occasion?').fill('Dinner');
  await page.getByRole('button', { name: 'Show my outfit', exact: true }).click();
  await page.route('**/api/wardrobe/starter-plans', (route) => route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue());
  await page.getByRole('button', { name: 'Save this plan', exact: true }).click();
  const builder = page.locator('#build-plan');
  const retry = builder.getByRole('button', { name: 'Try saving plan again', exact: true });
  await expect(retry).toBeEnabled();
  await expect(builder.getByRole('button', { name: 'Look 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const release = await slowSession(page);
  await builder.getByRole('button', { name: 'Look 3', exact: true }).click();
  await expect(retry).toBeDisabled();
  await release();
  await expect(builder.getByRole('button', { name: 'Look 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a wrong authenticator code keeps the valid session and the setup key', async ({ page }) => {
  await page.goto('/account');
  await register(page);
  await page.goto('/account');
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByLabel('Setup key')).toBeVisible();
  const key = await page.getByLabel('Setup key').inputValue();
  await page.getByLabel('Code from your app').fill('000000');
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await expect(page.getByLabel('Setup key')).toHaveValue(key);
  expect((await page.evaluate(async () => (await fetch('/api/session')).json())).signedIn).toBe(true);
});
