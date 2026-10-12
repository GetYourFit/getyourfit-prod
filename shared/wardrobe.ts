import { z } from 'zod';

export const categorySchema = z.enum(['top', 'bottom', 'one-piece', 'footwear']);
export const weatherSchema = z.enum(['warm', 'mild', 'cold']);
export const dressCodeSchema = z.enum(['casual', 'smart-casual', 'formal']);
export const factsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  category: categorySchema,
  color: z.string().trim().min(1).max(40),
  size: z.string().trim().min(1).max(40),
  fit: z.enum(['fits', 'does-not-fit', 'unknown']),
  owned: z.literal(true),
  available: z.boolean(),
  weather: z.array(weatherSchema).min(1).max(3),
  dressCode: z.array(dressCodeSchema).min(1).max(3),
});
export const provenanceSchema = z.strictObject({
  source: z.enum(['wearer-confirmed', 'wearer-correction']),
  modelVersion: z.null(),
  confidence: z.literal(1),
  recordedAt: z.iso.datetime(),
});
export const interpretationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('classified'), source: z.literal('Apple Vision'), modelVersion: z.string(),
    label: z.string().max(80), confidence: z.number().min(0).max(1) }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.enum(['unsupported-device', 'no-clothing-label', 'classification-failed']) }),
]);
export const garmentSchema = z.strictObject({
  id: z.uuid(), facts: factsSchema,
  provenance: z.record(factsSchema.keyof(), provenanceSchema),
  interpretation: interpretationSchema,
  photoConsent: z.strictObject({ scope: z.literal('local-processing-and-storage'), recordedAt: z.iso.datetime() }),
  photoUrl: z.string().regex(/^\/api\/wardrobe\/[0-9a-f-]+\/photo$/),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const wardrobeSchema = z.array(garmentSchema).max(50);
export const photoSchema = z.strictObject({ consent: z.literal(true), image: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(1_400_000) });
export const contextSchema = z.strictObject({ occasion: z.string().trim().max(120),
  weather: z.union([weatherSchema, z.literal('unknown')]), dressCode: z.union([dressCodeSchema, z.literal('unknown')]) });
export const exclusionSchema = z.strictObject({ context: contextSchema, garmentId: z.uuid(), excluded: z.boolean() });
export const decisionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('complete'), items: z.union([z.tuple([garmentSchema, garmentSchema]), z.tuple([garmentSchema, garmentSchema, garmentSchema])]), explanation: z.string(), excludedCount: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal('context-question'), field: z.enum(['occasion', 'weather', 'dressCode']), question: z.string() }),
  z.strictObject({ kind: z.literal('fit-question'), garmentId: z.uuid(), question: z.string() }),
  z.strictObject({ kind: z.literal('incomplete'), explanation: z.string(), excludedCount: z.number().int().min(0) }),
]);
export type Facts = z.infer<typeof factsSchema>;
export type Garment = z.infer<typeof garmentSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Interpretation = z.infer<typeof interpretationSchema>;

export function contextKey(context: Context): string {
  return JSON.stringify([context.occasion.trim().toLowerCase(), context.weather, context.dressCode]);
}

function completeSet(garments: Garment[]): [Garment, Garment] | [Garment, Garment, Garment] | null {
  const footwear = garments.find((item) => item.facts.category === 'footwear');
  if (!footwear) return null;
  const onePiece = garments.find((item) => item.facts.category === 'one-piece');
  if (onePiece) return [onePiece, footwear];
  const top = garments.find((item) => item.facts.category === 'top');
  const bottom = garments.find((item) => item.facts.category === 'bottom');
  return top && bottom ? [top, bottom, footwear] : null;
}

export function decideOutfit(context: Context, garments: Garment[], excluded: string[]): Decision {
  if (!context.occasion) return { kind: 'context-question', field: 'occasion', question: 'What is the occasion?' };
  const weather = context.weather;
  if (weather === 'unknown') return { kind: 'context-question', field: 'weather', question: 'What weather should this outfit work for?' };
  const dressCode = context.dressCode;
  if (dressCode === 'unknown') return { kind: 'context-question', field: 'dressCode', question: 'What is the dress code?' };
  const candidates = garments.filter(({ id, facts }) => !excluded.includes(id) && facts.owned && facts.available && facts.fit !== 'does-not-fit' && facts.weather.includes(weather) && facts.dressCode.includes(dressCode));
  const set = completeSet(candidates.filter((item) => item.facts.fit === 'fits'));
  if (set) return { kind: 'complete', items: set, excludedCount: excluded.length,
    explanation: `For ${context.occasion}: you confirmed every item is yours, available, fits you, and works for ${weather} weather and the ${dressCode} dress code. You already own it; nothing to buy. This checks your facts, without judging taste or predicting fit.` };
  const possible = completeSet(candidates);
  const uncertain = possible?.find((item) => item.facts.fit === 'unknown');
  if (uncertain) return { kind: 'fit-question', garmentId: uncertain.id, question: `Does ${uncertain.facts.name} fit you now?` };
  return { kind: 'incomplete', excludedCount: excluded.length,
    explanation: 'No complete outfit meets your confirmed facts and corrections. Add or correct a top and bottom (or one-piece), plus footwear. Each must be available, fit you, and be marked for this weather and dress code. No partial outfit has been recommended.' };
}
