import { z } from 'zod';

export const starterRoleSchema = z.enum(['top', 'bottom', 'footwear', 'one-piece']);
export const STARTER_NEED_MAX_LENGTH = 512;
export const starterNeedSchema = z.string().trim().min(1).max(STARTER_NEED_MAX_LENGTH);
export const starterWeatherSchema = z.enum(['warm', 'mild', 'cold', 'unknown']);
const optionCounts: Record<string, number> = { top: 2, bottom: 2, footwear: 1, 'one-piece': 2 };

function lookCount(input: { outfitType: 'separates' | 'one-piece'; ownedRoles: string[] }): number {
  const roles = input.outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
  return Math.min(4, roles.reduce((total, role) => total * (input.ownedRoles.includes(role) ? 1 : optionCounts[role] ?? 1), 1));
}

export const starterInputSchema = z.strictObject({
  occasion: z.string().trim().min(1).max(120),
  outfitType: z.enum(['separates', 'one-piece']),
  budget: z.number().int().min(0).max(1_000_000),
  currency: z.enum(['INR', 'USD', 'GBP']),
  weather: starterWeatherSchema,
  dressCode: z.enum(['casual', 'smart-casual', 'formal', 'unknown']),
  mustHave: z.string().trim().max(160),
  ownedRoles: z.array(starterRoleSchema).max(4),
  selectedLook: z.number().int().min(0).max(3).optional(),
}).superRefine((input, context) => {
  if (new Set(input.ownedRoles).size !== input.ownedRoles.length) {
    context.addIssue({ code: 'custom', path: ['ownedRoles'], message: 'Each role can be declared owned only once.' });
  }
  const allowed = input.outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
  if (input.ownedRoles.some((role) => !allowed.includes(role))) {
    context.addIssue({ code: 'custom', path: ['ownedRoles'], message: 'Declared roles must match the selected outfit form.' });
  }
  if (input.selectedLook !== undefined && input.selectedLook >= lookCount(input)) {
    context.addIssue({ code: 'custom', path: ['selectedLook'], message: 'The chosen look must be one of the looks in this plan.' });
  }
});

export const starterSaveSchema = starterInputSchema.safeExtend({
  requestId: z.uuid().optional(),
  needs: z.array(z.strictObject({ role: starterRoleSchema, need: starterNeedSchema })).min(2).max(3).optional(),
}).superRefine((input, context) => {
  const { needs } = input;
  if (!needs) return;
  const roles = input.outfitType === 'separates' ? ['top', 'bottom', 'footwear'] : ['one-piece', 'footwear'];
  if (needs.length !== roles.length || roles.some((role) => needs.filter((need) => need.role === role).length !== 1)) {
    context.addIssue({ code: 'custom', path: ['needs'], message: 'Provide exactly one need for each role in the selected outfit form.' });
  }
});

const plannedRoleSchema = z.strictObject({
  role: starterRoleSchema,
  state: z.literal('planned'),
  allocation: z.number().int().nonnegative(),
  need: starterNeedSchema,
});
const ownedRoleSchema = z.strictObject({
  role: starterRoleSchema,
  state: z.literal('confirmed-owned'),
  allocation: z.literal(0),
  need: starterNeedSchema,
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
  z.strictObject({ action: z.literal('replace-need'), role: starterRoleSchema, need: starterNeedSchema }),
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

const climateGuidance: Record<Exclude<StarterInput['weather'], 'unknown'>, string> = {
  warm: 'For warm weather, light, breathable fabrics are the usual choice.',
  mild: 'For mild weather, mid-weight fabrics that you can layer up or down are the usual choice.',
  cold: 'For cold weather, plan a layer such as a sweater or jacket in addition to the pieces below.',
};

function needFor(role: StarterRole, input: StarterInput): string {
  const context = input.mustHave ? ` that considers your requirement: ${input.mustHave}` : '';
  const weather = input.weather === 'unknown' ? '' : ` for your stated ${input.weather} weather`;
  const dressCode = input.dressCode === 'unknown' ? '' : ` for your stated ${input.dressCode} dress code`;
  return `A ${roleNames[role].toLowerCase()} for ${input.occasion}${weather}${dressCode}${context}.`;
}

const pieceCounts: Record<StarterRole, number> = { top: 2, bottom: 2, footwear: 1, 'one-piece': 2 };

export type CapsulePiece = { role: StarterRole; label: string; owned: boolean };
export type CapsuleOutfit = { name: string; pieces: string[]; why: string };
export type Capsule = {
  pieces: { role: StarterRole; count: number; owned: boolean; perPiece: number }[];
  outfits: CapsuleOutfit[];
  climate: string;
};

export function buildCapsule(input: StarterInput, roles: StarterRoleState[]): Capsule {
  const pieces = roles.map((entry) => {
    const owned = entry.state === 'confirmed-owned';
    const count = owned ? 1 : pieceCounts[entry.role];
    return { role: entry.role, count, owned, perPiece: owned ? 0 : Math.floor(entry.allocation / count) };
  });
  const labelled = pieces.map((piece) => Array.from({ length: piece.count }, (_, index): CapsulePiece => ({
    role: piece.role,
    owned: piece.owned,
    label: piece.owned ? `${roleNames[piece.role]} you already have` : `${roleNames[piece.role]} ${String.fromCharCode(65 + index)}`,
  })));
  let combos: CapsulePiece[][] = [[]];
  for (const group of labelled) combos = combos.flatMap((combo) => group.map((piece) => [...combo, piece]));
  const climate = input.weather === 'unknown' ? 'Climate was not provided, so no fabric guidance is given.' : climateGuidance[input.weather];
  const chosen = combos.slice(0, 4);
  const reuse = (label: string) => chosen.filter((combo) => combo.some((piece) => piece.label === label)).length;
  const outfits = chosen.map((combo, index): CapsuleOutfit => {
    const reused = combo.find((piece) => !piece.owned && reuse(piece.label) > 1);
    return {
      name: `Look ${index + 1}: ${input.occasion}`,
      pieces: combo.map((piece) => piece.label),
      why: `A starting suggestion for ${input.occasion}.${reused ? ` The ${roleNames[reused.role].toLowerCase()} also appears in other looks, so one purchase works harder.` : ''}`,
    };
  });
  return { pieces, outfits, climate };
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

function carrySelectedLook(selectedLook: number | undefined, before: { input: StarterInput; roles: StarterRoleState[] }, after: { input: StarterInput; roles: StarterRoleState[] }): number | undefined {
  if (selectedLook === undefined) return undefined;
  const chosen = buildCapsule(before.input, before.roles).outfits[selectedLook]?.pieces ?? [];
  const kept = new Map<StarterRole, string>();
  before.roles.forEach((entry, position) => {
    const label = chosen[position];
    if (entry.state === 'planned' && label) kept.set(entry.role, label);
  });
  const outfits = buildCapsule(after.input, after.roles).outfits;
  const match = outfits.findIndex((outfit) => after.roles.every((entry, position) => entry.state !== 'planned' || !kept.has(entry.role) || kept.get(entry.role) === outfit.pieces[position]));
  return match === -1 ? 0 : match;
}

export function withCarriedLook(next: StarterInput, before: { input: StarterInput; roles: StarterRoleState[] }, nextRoles: StarterRoleState[]): StarterInput {
  const rest = { ...next };
  delete rest.selectedLook;
  const carried = carrySelectedLook(before.input.selectedLook, before, { input: next, roles: nextRoles });
  return carried === undefined ? rest : { ...rest, selectedLook: carried };
}
