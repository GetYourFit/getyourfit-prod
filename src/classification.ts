import { z } from 'zod';
import { browserInterpretationSchema } from '../shared/classification';
import type { Interpretation } from '../shared/wardrobe';

const messageSchema = z.union([browserInterpretationSchema, z.strictObject({ kind: z.literal('progress'), message: z.string() })]);
export function reviewOnDevice(image: string, onResult: (result: Interpretation) => void, onProgress: (message: string) => void): () => void {
  let worker: Worker;
  try { worker = new Worker(new URL('./classification.worker.ts', import.meta.url), { type: 'module' }); }
  catch { onResult({ kind: 'unavailable', reason: 'classification-failed' }); return () => {}; }
  const stop = () => { clearTimeout(timeout); worker.terminate(); };
  const finish = (result: Interpretation) => { stop(); onResult(result); };
  const timeout = setTimeout(() => finish({ kind: 'unavailable', reason: 'model-timeout' }), 300_000);
  worker.onmessage = (event: MessageEvent<unknown>) => {
    const parsed = messageSchema.safeParse(event.data);
    if (!parsed.success) { finish({ kind: 'unavailable', reason: 'classification-failed' }); return; }
    if (parsed.data.kind === 'progress') onProgress(parsed.data.message);
    else finish(parsed.data);
  };
  worker.onerror = () => finish({ kind: 'unavailable', reason: 'classification-failed' });
  worker.postMessage(new Blob([Uint8Array.from(atob(image), (character) => character.charCodeAt(0))], { type: 'image/jpeg' }));
  return stop;
}
