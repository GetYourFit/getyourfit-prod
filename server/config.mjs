export const authSecret = process.env.BETTER_AUTH_SECRET || '';
if (authSecret.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a stable random key of at least 32 characters and retain it with this database.');
export const apiPort = Number(process.env.GYF_PORT || 4174);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Set GYF_PORT to a port between 1 and 65535.');
export const apiOrigin = `http://127.0.0.1:${apiPort}`;
