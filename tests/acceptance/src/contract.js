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

export const accounts = {
  valid: { email: 'alice@example.test', password: 'Saffron-River-83!ok', age_confirmed: true },
  other: { email: 'bea@example.test', password: 'Cedar-Moon-47!fine', age_confirmed: true },
  weak: { email: 'weak@example.test', password: '123', age_confirmed: true },
};
