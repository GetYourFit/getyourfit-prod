import { z } from 'zod';
import { starterInputSchema, starterRoleSchema, type StarterInput, type StarterRole, type StarterRoleState } from './starter-plan.ts';

export const shopDepartmentSchema = z.enum(['men', 'women']);

// A destination is a retailer page a wearer can open. Section destinations carry no product facts.
// A permitted product catalogue adds its own destination kind behind the source's rights record.
const sectionDestinationSchema = z.strictObject({
  kind: z.literal('section'),
  role: starterRoleSchema,
  department: shopDepartmentSchema,
  dressCodes: z.array(starterInputSchema.shape.dressCode).min(1),
  label: z.string().trim().min(1).max(80),
  url: z.url({ protocol: /^https$/ }),
  affiliateUrl: z.url({ protocol: /^https$/ }),
});

export const shoppingSourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  retailer: z.string().trim().min(1).max(80),
  retailerHost: z.string().regex(/^[a-z0-9.-]+$/),
  region: z.strictObject({ country: z.literal('IN'), name: z.string().trim().min(1) }),
  currency: starterInputSchema.shape.currency,
  verifiedAt: z.iso.date(),
  affiliate: z.strictObject({
    network: z.literal('Cuelinks'),
    redirectHost: z.string().regex(/^[a-z0-9.-]+$/),
    campaignId: z.number().int().positive(),
    channelId: z.number().int().positive(),
    channelUrl: z.url({ protocol: /^https$/ }),
  }),
  rights: z.strictObject({ productFacts: z.boolean(), prices: z.boolean(), images: z.boolean() }),
  destinations: z.array(sectionDestinationSchema).min(1),
}).superRefine((source, context) => {
  source.destinations.forEach((destination, index) => {
    const target = new URL(destination.url);
    const tracked = new URL(destination.affiliateUrl);
    if (target.hostname !== source.retailerHost) context.addIssue({ code: 'custom', path: ['destinations', index, 'url'], message: 'Destinations must stay on the retailer host.' });
    // The tracking link must redirect to the same page through the approved channel and carry nothing else.
    const allowed = new URLSearchParams({ cid: String(source.affiliate.channelId), source: 'api', url: destination.url });
    if (tracked.hostname !== source.affiliate.redirectHost || tracked.search !== `?${allowed}`) {
      context.addIssue({ code: 'custom', path: ['destinations', index, 'affiliateUrl'], message: 'Affiliate links must redirect to the destination through the approved channel only.' });
    }
  });
});
export const shoppingSourceListSchema = z.array(shoppingSourceSchema);

export type ShopDepartment = z.infer<typeof shopDepartmentSchema>;
export type ShoppingSource = z.infer<typeof shoppingSourceSchema>;
export type ShoppingDestination = ShoppingSource['destinations'][number];
export type ShoppingPick =
  | { role: StarterRole; state: 'owned' }
  | { role: StarterRole; state: 'linked'; allocation: number; destination: ShoppingDestination }
  | { role: StarterRole; state: 'unmatched'; allocation: number };
export type ShoppingSuggestion =
  | { kind: 'unavailable'; reason: 'currency' | 'zero-budget' | 'all-owned' | 'no-section' }
  | { kind: 'department-needed' }
  | { kind: 'picks'; department: ShopDepartment; picks: ShoppingPick[]; complete: boolean };

export function suggestShopping(source: ShoppingSource, input: StarterInput, roles: StarterRoleState[], department: ShopDepartment | null): ShoppingSuggestion {
  if (input.currency !== source.currency) return { kind: 'unavailable', reason: 'currency' };
  if (input.budget === 0) return { kind: 'unavailable', reason: 'zero-budget' };
  const planned = roles.filter((role) => role.state === 'planned');
  if (!planned.length) return { kind: 'unavailable', reason: 'all-owned' };
  const fits = (destination: ShoppingDestination, role: StarterRole) => destination.role === role && destination.dressCodes.includes(input.dressCode);
  if (!planned.some((role) => source.destinations.some((destination) => fits(destination, role.role)))) return { kind: 'unavailable', reason: 'no-section' };
  if (!department) return { kind: 'department-needed' };
  const picks = roles.map((role): ShoppingPick => {
    if (role.state === 'confirmed-owned') return { role: role.role, state: 'owned' };
    const destination = source.destinations.find((item) => item.department === department && fits(item, role.role));
    return destination
      ? { role: role.role, state: 'linked', allocation: role.allocation, destination }
      : { role: role.role, state: 'unmatched', allocation: role.allocation };
  });
  return { kind: 'picks', department, picks, complete: picks.every((pick) => pick.state !== 'unmatched') };
}
