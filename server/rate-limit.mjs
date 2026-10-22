// One server process owns these windows. Keep ingress limits in sync if the app gains multiple replicas.
export function rateLimit({ max, windowMs = 60_000, key = (request) => request.ip, maxKeys = 10_000, now = Date.now }) {
  const windows = new Map();
  return (request, response, next) => {
    const time = now();
    const identity = key(request);
    let active = windows.get(identity);
    if (active && active.expiresAt <= time) {
      windows.delete(identity);
      active = undefined;
    }
    if (!active) {
      if (windows.size >= maxKeys) {
        for (const [id, value] of windows) if (value.expiresAt <= time) windows.delete(id);
      }
      if (windows.size >= maxKeys) {
        response.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return response.status(429).json({ error: 'Please wait before trying again.' });
      }
      active = { count: 0, expiresAt: time + windowMs };
      windows.set(identity, active);
    }
    if (active.count >= max) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((active.expiresAt - time) / 1000))));
      return response.status(429).json({ error: 'Please wait before trying again.' });
    }
    active.count += 1;
    next();
  };
}
