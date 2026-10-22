import { z } from 'zod';

export const browserModel = 'ff13/fashion-clip';
export const browserRevision = '0f99955d944c39bfd9d035a02ac273c7a44a406b';
export const garmentLabels = ['a photo of a shirt or T-shirt', 'a photo of a sweater or cardigan', 'a photo of a jacket or coat',
  'a photo of trousers or jeans', 'a photo of shorts', 'a photo of a skirt', 'a photo of a dress', 'a photo of a jumpsuit',
  'a photo of shoes or sandals'] as const;
export const browserInterpretationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('classified'), source: z.literal('FashionCLIP (on-device)'),
    modelVersion: z.literal(`${browserModel}@${browserRevision}/q8`), label: z.enum(garmentLabels), confidence: z.number().min(0).max(1) }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.enum(['no-clothing-label', 'classification-failed', 'model-timeout', 'manual-review']) }),
]);
