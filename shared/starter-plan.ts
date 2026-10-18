import { z } from 'zod';

export const starterRoleSchema = z.enum(['top', 'bottom', 'footwear', 'one-piece']);
export const STARTER_NEED_MAX_LENGTH = 512;
export const starterNeedSchema = z.string().trim().min(1).max(STARTER_NEED_MAX_LENGTH);
export const starterWeatherSchema = z.enum(['hot-humid', 'warm', 'monsoon', 'mild', 'cold', 'unknown']);
export const starterStyleSchema = z.enum(['indian', 'classic', 'relaxed', 'minimal', 'unknown']);
export const STARTER_MAX_OCCASIONS = 4;
export const starterInputSchema = z.strictObject({
  occasion: z.string().trim().min(1).max(120),
  outfitType: z.enum(['separates', 'one-piece']),
  budget: z.number().int().min(0).max(1_000_000),
  currency: z.enum(['INR', 'USD', 'GBP']),
  weather: starterWeatherSchema,
  dressCode: z.enum(['casual', 'smart-casual', 'formal', 'unknown']),
  style: starterStyleSchema.default('unknown'),
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

export const starterSaveSchema = starterInputSchema.safeExtend({
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

const styleExamples: Record<Exclude<StarterInput['style'], 'unknown'>, Record<StarterRole, string>> = {
  indian: { top: 'a kurta or an easy shirt', bottom: 'straight trousers, churidar or pyjama', footwear: 'mojari, kolhapuri or closed sandals', 'one-piece': 'a kurta set or a dress' },
  classic: { top: 'a plain shirt or polo', bottom: 'chinos or tailored trousers', footwear: 'loafers or leather sneakers', 'one-piece': 'a shirt dress or a jumpsuit' },
  relaxed: { top: 'a cotton tee or an overshirt', bottom: 'relaxed trousers or shorts', footwear: 'clean sneakers or sandals', 'one-piece': 'a loose dress or a co-ord set' },
  minimal: { top: 'a solid-colour tee or shirt', bottom: 'plain straight trousers', footwear: 'simple low-profile sneakers', 'one-piece': 'a plain one-colour dress' },
};

const climateGuidance: Record<Exclude<StarterInput['weather'], 'unknown'>, string> = {
  'hot-humid': 'For hot and humid weather, breathable cotton or linen-blend fabrics in lighter colours are the usual choice.',
  warm: 'For warm weather, light, breathable fabrics are the usual choice.',
  monsoon: 'For the rains, quick-drying fabrics and closed footwear with good grip are the usual choice; avoid hems that trail on wet ground.',
  mild: 'For mild weather, mid-weight fabrics that you can layer up or down are the usual choice.',
  cold: 'For cold weather, plan a layer such as a sweater or jacket in addition to the pieces below.',
};

export function starterOccasions(input: StarterInput): string[] {
  const parts = input.occasion.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  return (parts.length ? parts : [input.occasion]).slice(0, STARTER_MAX_OCCASIONS);
}

function needFor(role: StarterRole, input: StarterInput): string {
  const context = input.mustHave ? ` that considers your requirement: ${input.mustHave}` : '';
  const weather = input.weather === 'unknown' ? '' : ` for your stated ${input.weather.replace('-', ' and ')} weather`;
  const dressCode = input.dressCode === 'unknown' ? '' : ` for your stated ${input.dressCode} dress code`;
  const style = input.style === 'unknown' ? '' : ` (for example ${styleExamples[input.style][role]})`;
  return `A ${roleNames[role].toLowerCase()}${style} for ${input.occasion}${weather}${dressCode}${context}.`;
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
  const occasions = starterOccasions(input);
  const climate = input.weather === 'unknown' ? 'Climate was not provided, so no fabric guidance is given.' : climateGuidance[input.weather];
  const styleNote = input.style === 'unknown' ? '' : ` Your ${input.style === 'indian' ? 'Indian everyday' : input.style} style choice shapes the examples in each need.`;
  const chosen = combos.slice(0, 4);
  const reuse = (label: string) => chosen.filter((combo) => combo.some((piece) => piece.label === label)).length;
  const outfits = chosen.map((combo, index): CapsuleOutfit => {
    const occasion = occasions[index % occasions.length]!;
    const reused = combo.find((piece) => !piece.owned && reuse(piece.label) > 1);
    return {
      name: `Look ${index + 1}: ${occasion}`,
      pieces: combo.map((piece) => piece.label),
      why: `A starting suggestion for ${occasion}.${reused ? ` ${reused.label} also appears in other looks, so one purchase works harder.` : ''}${styleNote}`,
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
