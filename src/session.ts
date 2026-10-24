import { z } from 'zod';

export const sessionSchema = z.discriminatedUnion('signedIn', [
  z.object({ signedIn: z.literal(false) }),
  z.object({ signedIn: z.literal(true), id: z.string(), email: z.string(), twoFactorEnabled: z.boolean() }),
]);
export type SessionState = z.infer<typeof sessionSchema>;
export type SignedInSession = Extract<SessionState, { signedIn: true }>;
export const SESSION_EXPIRED = 'gyf:session-expired';

export function sessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}

export async function readSession(): Promise<SessionState> {
  let response: Response;
  try { response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new Error('We could not connect to GetYourFit. Check your connection and try again.'); }
  if (!response.ok) throw new Error('GetYourFit is temporarily unavailable. Try again in a moment.');
  const parsed = sessionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('GetYourFit could not check your session. Try again in a moment.');
  return parsed.data;
}

export async function requireSession(account?: string) {
  const session = await readSession();
  if (!session.signedIn || (account !== undefined && session.id !== account)) {
    sessionExpired();
    throw new Error('Your session has ended or changed. Sign in again to continue.');
  }
  return session;
}
