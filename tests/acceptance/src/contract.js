import { randomBytes, randomUUID } from 'node:crypto';

export const contract = {
  register: '/api/auth/register',
  verify: '/api/auth/verify',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  logoutEverywhere: '/api/auth/logout-everywhere',
  forgot: '/api/auth/password/forgot',
  reset: '/api/auth/password/reset',
  twoFactor: '/api/auth/2fa/verify',
  export: '/api/auth/export',
  account: '/api/auth/account',
  wardrobe: '/api/wardrobe/items',
  outfits: '/api/outfits',
};

const email = label => `acceptance-${label}-${randomUUID()}@example.test`;
const password = () => `Aa1!${randomBytes(24).toString('base64url')}`;

export const accounts = {
  valid: { email: email('valid'), password: password(), age_confirmed: true },
  other: { email: email('other'), password: password(), age_confirmed: true },
  weak: { email: email('weak'), password: randomBytes(5).toString('hex'), age_confirmed: true },
  unknown: { email: email('unknown') },
  invalidPassword: password(),
  resetPassword: password(),
  reusedResetPassword: password(),
  takeoverPassword: password(),
};
