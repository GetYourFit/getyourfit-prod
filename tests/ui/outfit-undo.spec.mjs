import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { start } from '../helpers/http-server.mjs';
import { expect, test } from './fixtures.mjs';

test.use({ screenshot: 'only-on-failure' });

for (const count of [30, 50]) {
  test(`undo exclusions in a ${count}-garment wardrobe stays owner-scoped and within budgets`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const directory = await mkdtemp(path.join(tmpdir(), 'gyf-undo-'));
    const secret = randomBytes(48).toString('base64url');
    const password = randomUUID();
    const email = `${randomUUID()}@example.test`;
    const context = { occasion: 'Dinner', weather: 'mild', dressCode: 'casual' };
    const otherContexts = [{ ...context, occasion: 'Lunch' }, { ...context, weather: 'cold' }, { ...context, dressCode: 'formal' }];
    const images = await Promise.all(['top', 'bottom', 'footwear'].map(async (category) =>
      (await sharp(new URL(`../fixtures/${category}.jpg`, import.meta.url).pathname)
        .resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64')));
    const stop = [];
    const items = [];
    let server;
    let cookie;
    let ownerId;
    let headers;
    try {
      for (let offset = 0; offset < count; offset += 10) {
        if (stop.length) await stop.pop()();
        server = await start({ after: (callback) => stop.push(callback) }, { GYF_DATA_DIR: directory, BETTER_AUTH_SECRET: secret });
        headers = { Origin: server.origin, 'Content-Type': 'application/json' };
        if (offset === 0) {
          const account = await server.request({ method: 'POST', route: '/api/auth/sign-up/email', headers,
            body: { name: 'Undo regression', email, password, adultConfirmed: true } });
          expect(account.status).toBe(200);
          ownerId = account.body.user.id;
          cookie = account.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
        }
        headers.Cookie = cookie;
        for (let index = offset; index < offset + 10; index += 1) {
          const category = index === count - 1 ? 'footwear' : index === count - 2 ? 'bottom' : 'top';
          const added = await server.request({ method: 'POST', route: '/api/wardrobe', headers, body: {
            consent: true, image: images[category === 'footwear' ? 2 : category === 'bottom' ? 1 : 0],
            facts: { name: `Undo ${index}`, category, color: 'black', size: 'M', fit: 'fits', owned: true,
              available: true, weather: ['mild', 'cold'], dressCode: ['casual', 'formal'] },
          } });
          expect(added.status, JSON.stringify(added.body)).toBe(201);
          items.push(added.body);
        }
      }
      const listed = await server.request({ route: '/api/wardrobe', headers });
      expect(listed.body).toHaveLength(count);
      for (const correctionContext of [context, ...otherContexts]) {
        expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction', headers,
          body: { context: correctionContext, garmentId: items.at(-1).id, excluded: true } })).status).toBe(200);
      }
      const otherAccount = await server.request({ method: 'POST', route: '/api/auth/sign-up/email',
        headers: { Origin: server.origin, 'Content-Type': 'application/json' },
        body: { name: 'Other owner', email: `${randomUUID()}@example.test`, password, adultConfirmed: true } });
      expect(otherAccount.status).toBe(200);
      const otherHeaders = { ...headers, Cookie: otherAccount.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ') };
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction', headers: otherHeaders,
        body: { context, garmentId: items.at(-1).id, excluded: false } })).status).toBe(404);
      const otherItem = await server.request({ method: 'POST', route: '/api/wardrobe', headers: otherHeaders, body: {
        consent: true, image: images[0], facts: items[0].facts,
      } });
      expect(otherItem.status).toBe(201);
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction', headers: otherHeaders,
        body: { context, garmentId: otherItem.body.id, excluded: true } })).status).toBe(200);

      await page.goto(`${server.origin}/sign-in`);
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Your wardrobe', exact: true })).toBeVisible();
      await page.getByLabel('Occasion', { exact: true }).fill('  DINNER  ');
      await page.getByLabel('Weather', { exact: true }).selectOption('mild');
      await page.getByLabel('Dress code', { exact: true }).selectOption('casual');
      await page.getByRole('button', { name: 'Find an outfit' }).click();
      await expect(page.getByText('No complete outfit yet', { exact: true })).toBeVisible();
      const writes = [];
      const recordWrite = (response) => {
        if (response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/api/wardrobe/')) {
          writes.push({ path: new URL(response.url()).pathname, status: response.status() });
        }
      };
      page.on('response', recordWrite);
      await page.getByRole('button', { name: 'Allow excluded items again', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Your outfit for\s+DINNER/ })).toBeFocused();
      page.off('response', recordWrite);
      expect(writes).toEqual([
        { path: '/api/wardrobe/correction/reset', status: 200 },
        { path: '/api/wardrobe/outfit', status: 200 },
      ]);
      await expect(page.getByRole('button', { name: 'Allow excluded items again', exact: true })).toHaveCount(0);
      await testInfo.attach('undo-result', { body: await page.screenshot(), contentType: 'image/png' });
      const exported = await server.request({ route: '/api/data/export', headers });
      expect(exported.body.outfitCorrections).toHaveLength(otherContexts.length);
      expect(exported.body.outfitCorrections.map((entry) => entry.context)).toEqual(expect.arrayContaining(otherContexts.map((entry) => [entry.occasion.toLowerCase(), entry.weather, entry.dressCode])));
      const otherExport = await server.request({ route: '/api/data/export', headers: otherHeaders });
      expect(otherExport.body.outfitCorrections).toHaveLength(1);
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction/reset', headers, body: context })).status).toBe(200);
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction', headers,
        body: { context, garmentId: items.at(-1).id, excluded: true } })).status).toBe(200);
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction/reset', headers: otherHeaders, body: context })).status).toBe(200);
      const stillExcluded = await server.request({ method: 'POST', route: '/api/wardrobe/outfit', headers, body: context });
      expect(stillExcluded.body.excludedCount).toBe(1);
      expect((await server.request({ route: '/api/data/export', headers: otherHeaders })).body.outfitCorrections).toEqual([]);
      for (const body of [{}, { ...context, weather: 'invalid' }, { ...context, userId: ownerId }]) {
        expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction/reset', headers: otherHeaders, body })).status).toBe(400);
      }
      expect((await server.request({ method: 'POST', route: '/api/wardrobe/correction/reset',
        headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: context })).status).toBe(401);
      expect((await server.request({ route: '/api/data/export', headers })).body.outfitCorrections).toHaveLength(4);
    } finally {
      for (const close of stop.reverse()) await close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
