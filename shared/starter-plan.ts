import { z } from 'zod';

export const starterRoleSchema = z.enum(['top', 'bottom', 'footwear', 'one-piece']);
export const starterInputSchema = z.strictObject({
  occasion: z.string().trim().min(1).max(120),
  outfitType: z.enum(['separates', 'one-piece']),
  budget: z.number().int().min(0).max(1_000_000),
  currency: z.enum(['INR', 'USD', 'GBP']),
  weather: z.enum(['warm', 'mild', 'cold', 'unknown']),
  dressCode: z.enum(['casual', 'smart-casual', 'formal', 'unknown']),
  mustHave: z.string().trim().max(160),
  ownedRoles: z.array(starterRoleSchema).max(4),
}).superRefine((input, context) => {
  if (new Set(input.ownedRoles).size !== input.ownedRoles.length) {
    context.addIssue({ code: 'custom', path: ['ownedRoles'], message: 'Each role can be declared owned only once.' });
  }
  const allowed = input.outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
  if (input.ownedRoles.some((role) => !allowed.includes(role))) {
    context.addIssue({ code: 'custom', path: ['ownedRoles'], message: 'Declared roles must match the selected outfit form.' });
  }
});

const plannedRoleSchema = z.strictObject({
  role: starterRoleSchema,
  state: z.literal('planned'),
  allocation: z.number().int().nonnegative(),
  need: z.string().trim().min(1).max(240),
});
const ownedRoleSchema = z.strictObject({
  role: starterRoleSchema,
  state: z.literal('confirmed-owned'),
  allocation: z.literal(0),
  need: z.string().trim().min(1).max(240),
  confirmedAt: z.iso.datetime(),
});
export const starterRoleStateSchema = z.discriminatedUnion('state', [plannedRoleSchema, ownedRoleSchema]);
export const starterStatusSchema = z.enum(['active', 'replaced', 'rejected']);
export const starterPlanSchema = z.strictObject({
  id: z.uuid(),
  status: starterStatusSchema,
  input: starterInputSchema,
  roles: z.array(starterRoleStateSchema).min(2).max(3),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const starterPlanActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('confirm-owned'), role: starterRoleSchema }),
  z.strictObject({ action: z.literal('replace-need'), role: starterRoleSchema, need: z.string().trim().min(1).max(240) }),
  z.strictObject({ action: z.literal('replace-plan'), input: starterInputSchema }),
  z.strictObject({ action: z.literal('reject') }),
]);

export type StarterInput = z.infer<typeof starterInputSchema>;
export type StarterRole = z.infer<typeof starterRoleSchema>;
export type StarterRoleState = z.infer<typeof starterRoleStateSchema>;
export type StarterPlan = z.infer<typeof starterPlanSchema>;
export type StarterPlanAction = z.infer<typeof starterPlanActionSchema>;

const roleNames: Record<StarterRole, string> = {
  top: 'Top',
  bottom: 'Bottom',
  footwear: 'Footwear',
  'one-piece': 'One-piece garment',
};

export function starterRoleName(role: StarterRole): string {
  return roleNames[role];
}

function needFor(role: StarterRole, input: StarterInput): string {
  const context = input.mustHave ? ` that considers your requirement: ${input.mustHave}` : '';
  const weather = input.weather === 'unknown' ? '' : ` for your stated ${input.weather} weather`;
  const dressCode = input.dressCode === 'unknown' ? '' : ` for your stated ${input.dressCode} dress code`;
  return `A ${roleNames[role].toLowerCase()} for ${input.occasion}${weather}${dressCode}${context}.`;
}

export function buildStarterRoles(input: StarterInput, now: string): StarterRoleState[] {
  const roles: StarterRole[] = input.outfitType === 'separates'
    ? ['top', 'bottom', 'footwear']
    : ['one-piece', 'footwear'];
  const planned = roles.filter((role) => !input.ownedRoles.includes(role));
  const baseAllocation = planned.length ? Math.floor(input.budget / planned.length) : 0;
  let remainder = planned.length ? input.budget % planned.length : 0;
  return roles.map((role): StarterRoleState => {
    const need = needFor(role, input);
    if (input.ownedRoles.includes(role)) return { role, state: 'confirmed-owned', allocation: 0, need, confirmedAt: now };
    const allocation = baseAllocation + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return { role, state: 'planned', allocation, need };
  });
}

export function rebalanceStarterRoles(roles: StarterRoleState[], budget: number): StarterRoleState[] {
  const planned = roles.filter((role) => role.state === 'planned');
  const baseAllocation = planned.length ? Math.floor(budget / planned.length) : 0;
  let remainder = planned.length ? budget % planned.length : 0;
  return roles.map((role) => {
    if (role.state === 'confirmed-owned') return { ...role, allocation: 0 };
    const allocation = baseAllocation + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return { ...role, allocation };
  });
}

export function confirmStarterRole(roles: StarterRoleState[], roleName: StarterRole, budget: number, confirmedAt: string): StarterRoleState[] {
  const updated = roles.map((role): StarterRoleState => role.role === roleName && role.state === 'planned'
    ? { role: role.role, state: 'confirmed-owned', allocation: 0, need: role.need, confirmedAt }
    : role);
  return rebalanceStarterRoles(updated, budget);
}
