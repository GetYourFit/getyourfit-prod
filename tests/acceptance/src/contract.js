import { randomBytes, randomUUID } from 'node:crypto';

export const contract = {
  register: '/api/auth/sign-up/email',
  login: '/api/auth/sign-in/email',
  session: '/api/session',
  wardrobe: '/api/wardrobe',
  outfits: '/api/wardrobe/outfit',
};

export const caseNames = {
  frontDoor: 'V02 public outfit example leads to private signup by keyboard',
  contrast: 'V02 visible text meets WCAG AA contrast on phone and desktop',
  browser: 'V01 browser signup, real photo, clarification and exact refresh',
  signup: 'V01 API signup creates a usable private session without mail',
  authentication: 'V01 wrong and unknown credentials are refused without enumeration',
  photo: 'V01 API real photo persists and invalid uploads are refused',
  outfit: 'V01 API explicit facts return a complete explained outfit from owned garments',
  singleShirt: 'V01 one owned shirt does not fabricate a complete outfit',
  missingFacts: 'V01 unknown weather or dress code requests one fact or abstains',
  isolation: 'V01 users and anonymous sessions cannot access private garments or photos',
};

export function account() {
  return {
    name: 'Acceptance wearer',
    email: `acceptance-${randomUUID()}@example.test`,
    password: `Aa1!${randomBytes(24).toString('base64url')}`,
    adultConfirmed: true,
  };
}
