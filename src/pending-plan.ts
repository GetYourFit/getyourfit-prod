import { z } from 'zod';
import { starterInputSchema, type StarterInput } from '../shared/starter-plan';

const KEY = 'gyf.pending-plan';
const pendingSchema = z.object({ id: z.uuid(), input: starterInputSchema });
type PendingPlan = z.infer<typeof pendingSchema>;
let memory: PendingPlan | null = null;

export function holdPendingPlan(input: StarterInput) {
  memory = { id: crypto.randomUUID(), input };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* In-page account entry retains the memory copy. */ }
}

export function readPendingPlan(): PendingPlan | null {
  if (memory) return memory;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (!stored) return null;
    const parsed = pendingSchema.safeParse(JSON.parse(stored));
    if (parsed.success) memory = parsed.data;
    else {
      const legacy = starterInputSchema.safeParse(JSON.parse(stored));
      if (legacy.success) holdPendingPlan({ ...legacy.data, selectedLook: legacy.data.selectedLook ?? 0 });
    }
    return memory;
  } catch {
    return null;
  }
}

export function clearPendingPlan(id: string) {
  if (readPendingPlan()?.id !== id) return;
  memory = null;
  try { window.sessionStorage.removeItem(KEY); } catch { /* Storage was unavailable when the draft was held. */ }
}
