import { isIP } from 'node:net';

export const authSecret = process.env.BETTER_AUTH_SECRET || '';
if (authSecret.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a stable random key of at least 32 characters and retain it with this database.');
export const apiPort = Number(process.env.GYF_PORT || 4174);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Set GYF_PORT to a port between 1 and 65535.');
export const apiOrigin = `http://127.0.0.1:${apiPort}`;

function configuredOrigin(value, setting) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${setting} must contain an absolute HTTP(S) origin.`); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!['http:', 'https:'].includes(url.protocol)) || (url.protocol === 'http:' && !loopback)
    || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${setting} must contain an HTTPS origin (HTTP is allowed only for loopback), without credentials, paths, queries, fragments, or wildcards.`);
  }
  return url.origin;
}

export const authOrigin = process.env.BETTER_AUTH_URL
  ? configuredOrigin(process.env.BETTER_AUTH_URL, 'BETTER_AUTH_URL')
  : process.env.NODE_ENV === 'production' ? apiOrigin : 'http://127.0.0.1:5173';
export const allowedHosts = new Set([`localhost:${apiPort}`, `127.0.0.1:${apiPort}`,
  ...(process.env.BETTER_AUTH_URL ? [new URL(authOrigin).host] : []),
]);
export const allowedOrigins = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${apiPort}`, apiOrigin, authOrigin,
  ...(process.env.GYF_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
    .map((value) => configuredOrigin(value, 'GYF_ALLOWED_ORIGINS')),
]);

export const trustedProxies = (process.env.GYF_TRUSTED_PROXIES || '').split(',').map((value) => value.trim()).filter(Boolean);
for (const proxy of trustedProxies) {
  const [address, prefix, extra] = proxy.split('/');
  const family = isIP(address);
  if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix)
    || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
    throw new Error('GYF_TRUSTED_PROXIES must contain only trusted ingress IP addresses or CIDRs with a nonzero prefix.');
  }
}
