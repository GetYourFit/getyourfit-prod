export const authSecret = process.env.BETTER_AUTH_SECRET || '';
if (authSecret.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a stable random key of at least 32 characters and retain it with this database.');
