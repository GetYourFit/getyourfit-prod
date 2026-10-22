import { z } from 'zod';
import { starterInputSchema, type StarterInput } from '../shared/starter-plan';

const KEY = 'gyf.pending-plan';
const pendingSchema = z.object({ id: z.uuid(), input: starterInputSchema, account: z.string().optional() });
type PendingPlan = z.infer<typeof pendingSchema>;
let memory: PendingPlan | null = null;

function persist(plan: PendingPlan) {
  memory = plan;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(plan)); } catch { /* In-page account entry retains the memory copy. */ }
}

export function holdPendingPlan(input: StarterInput) {
  persist({ id: crypto.randomUUID(), input });
}

export function updatePendingLook(id: string, selectedLook: number) {
  const held = readPendingPlan();
  if (held?.id === id) persist({ ...held, input: { ...held.input, selectedLook } });
}

export function claimPendingPlan(account: string): PendingPlan | null {
  const held = readPendingPlan();
  if (!held) return null;
  if (held.account === undefined) {
    const claimed = { ...held, account };
    persist(claimed);
    return claimed;
  }
  if (held.account === account) return held;
  discardPendingPlan();
  return null;
}

export function discardPendingPlan() {
  memory = null;
  try { window.sessionStorage.removeItem(KEY); } catch { /* Storage was unavailable when the draft was held. */ }
}

export function readPendingPlan(): PendingPlan | null {
  if (memory) return memory;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (!stored) return null;
    const parsed = pendingSchema.safeParse(JSON.parse(stored));
    if (parsed.success && parsed.data.input.selectedLook !== undefined) memory = parsed.data;
    else discardPendingPlan();
    return memory;
  } catch {
    return null;
  }
}

export function clearPendingPlan(id: string) {
  if (readPendingPlan()?.id === id) discardPendingPlan();
}
