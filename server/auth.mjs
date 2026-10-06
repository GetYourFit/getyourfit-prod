import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { hash, verify } from '@node-rs/argon2';
import { database } from './database.mjs';

const localOnly = process.env.NODE_ENV !== 'production';
const secret = process.env.BETTER_AUTH_SECRET || (localOnly ? crypto.randomBytes(32).toString('base64url') : '');
if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must come from the vault and contain at least 32 characters.');
const baseURL = process.env.BETTER_AUTH_URL || (localOnly ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4174');
const trustedOrigins = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4174', 'http://127.0.0.1:4174',
  baseURL,
  ...(process.env.GYF_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);

const messages = [];
const mailServer = new SMTPServer({
  authOptional: true,
  disabledCommands: ['AUTH', 'STARTTLS'],
  onConnect(session, callback) {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(session.remoteAddress)) return callback(new Error('Local mail only.'));
    callback();
  },
  onData(stream, _session, callback) {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', async () => {
      try {
        const mail = await simpleParser(Buffer.concat(chunks));
        messages.unshift({
          id: crypto.randomUUID(),
          subject: mail.subject || 'GetYourFit message',
          to: mail.to?.text || '',
          text: mail.text || '',
          html: typeof mail.html === 'string' ? mail.html : '',
          receivedAt: new Date().toISOString(),
        });
        messages.splice(50);
        callback();
      } catch {
        callback(new Error('The local mail catcher could not read this message.'));
      }
    });
  },
});
await new Promise((resolve, reject) => mailServer.listen(1025, '127.0.0.1', (error) => error ? reject(error) : resolve()));

const mailer = nodemailer.createTransport({ host: '127.0.0.1', port: 1025, secure: false, ignoreTLS: true });
export async function sendLocalMail({ to, subject, text }) {
  await mailer.sendMail({ from: 'GetYourFit <wardrobe@localhost>', to, subject, text });
}

const argon2id = { memoryCost: 65536, timeCost: 3, parallelism: 2, outputLen: 32, algorithm: 2 };
export const hashPassword = (password) => hash(password, argon2id);
function recordEmailVerificationToken(userId, token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  database.transaction(() => {
    database.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(userId);
    database.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, Date.now() + 60 * 60_000);
  })();
}

export function consumeEmailVerificationToken(token) {
  if (typeof token !== 'string' || !token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = database.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL')
    .run(Date.now(), tokenHash, Date.now());
  return result.changes === 1;
}

export const auth = betterAuth({
  appName: 'GetYourFit',
  baseURL,
  secret,
  database,
  trustedOrigins: [...trustedOrigins],
  logger: { disabled: true },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    storage: 'database',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 12,
    maxPasswordLength: 1024,
    resetPasswordTokenExpiresIn: 15 * 60,
    password: {
      hash: hashPassword,
      verify: ({ password, hash: encoded }) => verify(encoded, password, argon2id),
    },
    sendResetPassword: async ({ user, url }) => {
      const token = new URL(url).pathname.split('/').at(-1);
      const appURL = process.env.BETTER_AUTH_URL || (localOnly ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4174');
      const resetURL = new URL('/', appURL);
      resetURL.searchParams.set('token', token);
      await sendLocalMail({
        to: user.email,
        subject: 'Reset your GetYourFit password',
        text: `Use this single-use link within 15 minutes to reset your password:\n\n${resetURL}\n\nIf you did not request this, ignore this message.`,
      });
    },
    onExistingUserSignUp: async () => {},
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url, token }) => {
      recordEmailVerificationToken(user.id, token);
      await sendLocalMail({
        to: user.email,
        subject: 'Verify your GetYourFit email',
        text: `Confirm your email within 60 minutes:\n\n${url}`,
      });
    },
  },
  user: {
    additionalFields: {
      adultConfirmed: { type: 'boolean', required: true, input: true, defaultValue: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12, cookieCache: { enabled: false } },
  advanced: {
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

export async function migrateAuth() {
  const { schemaProblems, runMigrations } = await (await import('better-auth/db/migration')).getMigrations(auth.options);
  if (schemaProblems.length) throw new Error('Better Auth database schema requires review.');
  await runMigrations();
}

export const localMailbox = () => messages;
export function clearLocalMailbox(email) {
  const normalized = String(email).trim().toLowerCase();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].to.toLowerCase().includes(normalized)) messages.splice(index, 1);
  }
}

export function emailKey(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

export function recordSignInResult(email, succeeded) {
  const key = emailKey(email);
  const now = Date.now();
  if (succeeded) {
    database.prepare('DELETE FROM auth_lockouts WHERE email_hash = ?').run(key);
    return;
  }
  const row = database.prepare('SELECT failures, window_started FROM auth_lockouts WHERE email_hash = ?').get(key);
  const failures = row && now - row.window_started < 15 * 60_000 ? row.failures + 1 : 1;
  const windowStarted = row && now - row.window_started < 15 * 60_000 ? row.window_started : now;
  const lockedUntil = failures >= 8 ? now + 15 * 60_000 : 0;
  database.prepare(`INSERT INTO auth_lockouts (email_hash, failures, window_started, locked_until)
    VALUES (?, ?, ?, ?) ON CONFLICT(email_hash) DO UPDATE SET failures = excluded.failures, window_started = excluded.window_started, locked_until = excluded.locked_until`)
    .run(key, failures, windowStarted, lockedUntil);
}

export function isLockedOut(email) {
  const row = database.prepare('SELECT locked_until FROM auth_lockouts WHERE email_hash = ?').get(emailKey(email));
  return Boolean(row && row.locked_until > Date.now());
}

export function clearLockout(email) {
  database.prepare('DELETE FROM auth_lockouts WHERE email_hash = ?').run(emailKey(email));
}
