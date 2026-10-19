import { randomBytes } from 'node:crypto';
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    const clientIP = `fd00:${randomBytes(14).toString('hex').match(/.{4}/g).join(':')}`;
    await use({ ...extraHTTPHeaders, 'X-Forwarded-For': clientIP });
  },
});
