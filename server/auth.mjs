import crypto from 'node:crypto';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { hash, verify } from '@node-rs/argon2';
import { allowedOrigins, authOrigin, authSecret } from './config.mjs';
import { pool, query } from './database.mjs';

const argon2id = { memoryCost: 65536, timeCost: 3, parallelism: 2, outputLen: 32, algorithm: 2 };
export const hashPassword = (password) => hash(password, argon2id);
export const auth = betterAuth({
  appName: 'GetYourFit',
  baseURL: authOrigin,
  secret: authSecret,
  database: pool,
  trustedOrigins: [...allowedOrigins],
  logger: { disabled: true },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    storage: 'database',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 1024,
    password: {
      hash: hashPassword,
      verify: ({ password, hash: encoded }) => verify(encoded, password, argon2id),
    },
    onExistingUserSignUp: async () => {},
  },
  user: {
    additionalFields: {
      adultConfirmed: { type: 'boolean', required: true, input: true, defaultValue: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12, cookieCache: { enabled: false } },
  advanced: {
    // assertAuthSchema() checks the schema once after migrations; Better Auth's own check would run at import, before they do.
    database: { validateSchema: false },
    ipAddress: { ipAddressHeaders: ['x-gyf-client-ip'] },
    useSecureCookies: true,
    cookiePrefix: 'gyf',
    defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
  },
  plugins: [twoFactor({ issuer: 'GetYourFit', backupCodeOptions: { amount: 8, length: 10 } })],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (user.adultConfirmed !== true) throw new Error('You must confirm you are at least 18 to create an account.');
          return { data: user };
        },
      },
    },
  },
});

// The schema comes from migrations/, not from Better Auth. Refuse to start if the installed Better Auth expects anything else.
export async function assertAuthSchema() {
  const { toBeCreated, toBeAdded, toBeAddedIndexes, unsafeChanges, schemaProblems } = await (await import('better-auth/db/migration')).getMigrations(auth.options);
  if (toBeCreated.length || toBeAdded.length || toBeAddedIndexes.length || unsafeChanges.length || schemaProblems.length) {
    throw new Error('The database does not match the Better Auth schema. Add a migration in migrations/.');
  }
}

export function emailKey(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

export async function recordSignInResult(email, succeeded) {
  const key = emailKey(email);
  if (succeeded) {
    await query('DELETE FROM auth_lockouts WHERE email_hash = $1', [key]);
    return;
  }
  const now = Date.now();
  const window = 15 * 60_000;
  // One atomic upsert: concurrent failures for the same address cannot lose a count.
  await query(`INSERT INTO auth_lockouts (email_hash, failures, window_started, locked_until) VALUES ($1, 1, $2, 0)
    ON CONFLICT (email_hash) DO UPDATE SET
      failures = CASE WHEN $2 - auth_lockouts.window_started < $3 THEN auth_lockouts.failures + 1 ELSE 1 END,
      window_started = CASE WHEN $2 - auth_lockouts.window_started < $3 THEN auth_lockouts.window_started ELSE $2 END,
      locked_until = CASE WHEN (CASE WHEN $2 - auth_lockouts.window_started < $3 THEN auth_lockouts.failures + 1 ELSE 1 END) >= 8 THEN $2 + $3 ELSE 0 END`,
  [key, now, window]);
}

export async function isLockedOut(email) {
  const { rows } = await query('SELECT locked_until FROM auth_lockouts WHERE email_hash = $1', [emailKey(email)]);
  return Boolean(rows[0] && rows[0].locked_until > Date.now());
}

export async function clearLockout(email) {
  await query('DELETE FROM auth_lockouts WHERE email_hash = $1', [emailKey(email)]);
}
