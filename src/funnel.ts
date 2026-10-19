import type { FunnelEvent } from '../shared/funnel';

const counted = new Set<FunnelEvent>();

// Reports one anonymous step to the GetYourFit server. Visitors who send Do Not Track or Global Privacy Control are not counted.
export function countStep(event: FunnelEvent, { once = true }: { once?: boolean } = {}) {
  const signals = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (signals.doNotTrack === '1' || signals.globalPrivacyControl === true) return;
  if (once && counted.has(event)) return;
  counted.add(event);
  void fetch('/api/funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    keepalive: true,
    body: JSON.stringify({ event }),
  }).catch(() => undefined);
}
