export const guideOrigin = 'https://app.getyourfit.co';

export const planEntry = { signUp: '/sign-up?next=%2Fplan', signIn: '/sign-in?next=%2Fplan' } as const;
export const wardrobeEntry = { signUp: '/sign-up?next=%2Fwardrobe', signIn: '/sign-in?next=%2Fwardrobe' } as const;

export const guides = [
  {
    slug: 'smart-casual-office-outfits',
    title: 'What to wear to a smart-casual office in warm weather',
    description: 'Start with your office dress code, commute and clothes you own. A practical warm-weather outfit checklist, with India-first examples and an optional GYF plan.',
    summary: 'Work out what your day needs, then choose one complete outfit from your wardrobe.',
  },
  {
    slug: 'capsule-wardrobe-from-your-own-clothes',
    title: 'Build a capsule wardrobe from clothes you already own',
    description: 'Make a small, repeatable wardrobe around your actual week, laundry routine and favourite clothes. Try complete combinations before buying anything new.',
    summary: 'Make a small rotation around your actual week. No prescribed item count or shopping list.',
  },
] satisfies { slug: string; title: string; description: string; summary: string }[];

export type Guide = (typeof guides)[number];
export const guidePath = (guide: Guide) => `/guides/${guide.slug}/`;
