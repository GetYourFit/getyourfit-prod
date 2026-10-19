import { starterInputSchema, type StarterInput } from '../shared/starter-plan';

const KEY = 'gyf.pending-plan';

// A visitor's plan waits in this tab's session storage until they sign up. It never leaves the browser before then.
export function holdPendingPlan(input: StarterInput) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(input)); } catch { /* Storage can be blocked; the visitor can plan again. */ }
}

export function takePendingPlan(): StarterInput | null {
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (!stored) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed = starterInputSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
