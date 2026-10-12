import { randomBytes, randomUUID } from 'node:crypto';

export const contract = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  session: '/api/auth/session',
  wardrobe: '/api/wardrobe/items',
  outfits: '/api/outfits',
};

export const caseNames = {
  browser: 'V01 browser signup, real photo, clarification and refresh',
  signup: 'V01 API signup creates a usable private session without mail',
  authentication: 'V01 wrong and unknown credentials are refused without enumeration',
  photo: 'V01 API real photo persists and invalid uploads are refused',
  outfit: 'V01 API explicit facts return a complete explained outfit from owned garments',
  singleShirt: 'V01 one owned shirt does not fabricate a complete outfit',
  missingFacts: 'V01 unknown weather or dress code requests one fact or abstains',
  isolation: 'V01 two users cannot read, modify or delete each other garments or photos',
};

export function account() {
  return {
    email: `acceptance-${randomUUID()}@example.test`,
    password: `Aa1!${randomBytes(24).toString('base64url')}`,
    age_confirmed: true,
  };
}
