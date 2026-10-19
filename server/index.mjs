import crypto from 'node:crypto';
import http from 'node:http';
import { isIP } from 'node:net';
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth, clearLockout, consumeEmailVerificationToken, hashPassword, isLockedOut, migrateAuth, recordSignInResult } from './auth.mjs';
import { emailConnected, emailDeliveryMode, localMailbox, sendMail, settleMailForAccountDeletion } from './mail.mjs';
import { audit, database, ensureAuthSchema } from './database.mjs';
import { ensureFunnelSchema, funnelRouter } from './funnel.mjs';
import { ensureWardrobeSchema, exportWardrobe, wardrobeRouter } from './wardrobe.mjs';
import { allowedHosts, allowedOrigins, apiOrigin, apiPort, authOrigin, trustedProxies } from './config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', trustedProxies);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"], connectSrc: ["'self'", 'https://huggingface.co', 'https://*.hf.co'], objectSrc: ["'none'"],
      workerSrc: ["'self'"],
      baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
}));
app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  if (!allowedHosts.has(request.headers.host?.toLowerCase())) return response.status(403).json({ error: 'This service only accepts configured GetYourFit hosts.' });
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'This service only accepts configured GetYourFit origins.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origin) return response.status(403).json({ error: 'A same-site request is required.' });
  const clientIP = request.ip;
  if (!isIP(clientIP)) return response.status(400).json({ error: 'The request has an invalid client address.' });
  request.headers['x-gyf-client-ip'] = clientIP;
  next();
});

async function userFor(request) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  return session?.user ?? null;
}

async function requireUser(request, response, next) {
  try {
    const user = await userFor(request);
    if (!user) return response.status(401).json({ error: 'Sign in to continue.' });
    request.user = user;
    next();
  } catch {
    response.status(401).json({ error: 'Sign in to continue.' });
  }
}

app.use('/api/wardrobe', wardrobeRouter(requireUser));
app.use('/api/funnel', funnelRouter());
app.use(express.json({ limit: '32kb' }));

const requestLimits = new Map();
function limitSensitiveRequest(request, response, next) {
  const now = Date.now();
  const key = `${request.path}:${request.ip}`;
  const current = requestLimits.get(key);
  const active = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + 60_000 };
  active.count += 1;
  requestLimits.set(key, active);
  if (active.count > (request.path.endsWith('request-password-reset') ? 3 : 5)) return response.status(429).json({ message: 'Please wait before trying again.' });
  next();
}

const emailNotConnected = { status: false, code: 'EMAIL_NOT_CONNECTED', message: 'Email delivery is not connected to GetYourFit yet, so we cannot send a reset link. Try again once it is.' };

app.post('/api/auth/request-password-reset', limitSensitiveRequest, (request, response) => {
  if (emailDeliveryMode === 'disabled') return response.status(404).json({ message: 'Password recovery is unavailable in this local version.' });
  if (!emailConnected) return response.status(503).json(emailNotConnected);
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const user = database.prepare('SELECT id FROM user WHERE lower(email) = ?').get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    database.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, user.id, Date.now() + 15 * 60_000);
    const resetURL = new URL('/', authOrigin);
    resetURL.searchParams.set('token', token);
    void sendMail({ to: email, subject: 'Reset your GetYourFit password', text: `Use this single-use link within 15 minutes to reset your password:\n\n${resetURL}\n\nIf you did not request this, ignore this message.` }).catch(() => audit('mail-delivery-failed'));
  }
  response.json({ status: true, message: 'If this email has an account, a reset message will be sent.' });
});

app.post('/api/auth/reset-password', limitSensitiveRequest, async (request, response) => {
  if (emailDeliveryMode === 'disabled') return response.status(404).json({ message: 'Password recovery is unavailable in this local version.' });
  if (!emailConnected) return response.status(503).json(emailNotConnected);
  const token = typeof request.body?.token === 'string' ? request.body.token : '';
  const password = typeof request.body?.newPassword === 'string' ? request.body.newPassword : '';
  if (password.length < 12 || password.length > 1024) return response.status(400).json({ message: 'Use a password between 12 and 1024 characters.' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await hashPassword(password);
  const reset = database.transaction(() => {
    const stored = database.prepare('SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now());
    if (!stored) return false;
    const removed = database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    if (removed.changes !== 1) return false;
    const update = database.prepare("UPDATE account SET password = ? WHERE userId = ? AND providerId = 'credential'").run(passwordHash, stored.user_id);
    if (update.changes !== 1) return false;
    database.prepare('DELETE FROM session WHERE userId = ?').run(stored.user_id);
    return true;
  })();
  if (!reset) return response.status(400).json({ message: 'This reset link is invalid or expired. Request another.' });
  audit('password-reset');
  response.json({ status: true });
});

app.get('/api/session', async (request, response) => {
  const user = await userFor(request);
  if (!user) return response.json({ signedIn: false, emailDeliveryMode });
  response.json({ signedIn: true, email: user.email, twoFactorEnabled: user.twoFactorEnabled === true, emailDeliveryMode });
});

app.get('/__mail', (request, response) => {
  if (emailDeliveryMode !== 'local-test') return response.status(404).end();
  const expected = process.env.GYF_MAILBOX_RUNNER_TOKEN;
  const authorization = request.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!expected || !authorization.startsWith(prefix)) return response.status(404).end();
  const suppliedToken = Buffer.from(authorization.slice(prefix.length));
  const expectedToken = Buffer.from(expected);
  if (suppliedToken.length !== expectedToken.length || !crypto.timingSafeEqual(suppliedToken, expectedToken)) return response.status(404).end();
  response.json({ messages: localMailbox() });
});

app.post('/api/auth/sign-out-everywhere', requireUser, async (request, response) => {
  try {
    await auth.api.revokeSessions({ headers: fromNodeHeaders(request.headers) });
    audit('sign-out-everywhere');
    response.setHeader('Set-Cookie', '__Secure-gyf.session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    response.json({ signedOut: true });
  } catch {
    response.status(400).json({ error: 'Could not sign out everywhere. Try again.' });
  }
});

app.get('/api/data/export', requireUser, (request, response) => {
  const exported = {
    format: 'getyourfit-account-export-v1',
    exportedAt: new Date().toISOString(),
    account: {
      email: request.user.email,
      name: request.user.name,
      emailVerified: request.user.emailVerified,
      createdAt: request.user.createdAt,
      adultConfirmed: request.user.adultConfirmed,
    },
    ...exportWardrobe(request.user.id),
  };
  response.setHeader('Content-Disposition', 'attachment; filename="getyourfit-account-export.json"');
  response.json(exported);
});

app.delete('/api/data', requireUser, async (request, response) => {
  if (request.body?.confirm !== 'delete my account') return response.status(400).json({ error: 'Confirm deletion to erase your local account.' });
  const { id, email } = request.user;
  database.prepare('DELETE FROM user WHERE id = ?').run(id);
  clearLockout(email);
  await settleMailForAccountDeletion(email);
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.exec('VACUUM');
  audit('account-deleted');
  response.setHeader('Set-Cookie', '__Secure-gyf.session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  response.json({ deleted: true });
});

app.use('/api/auth', (request, response, next) => {
  if (emailDeliveryMode === 'disabled' && ['/verify-email', '/send-verification-email'].includes(request.path)) return response.status(404).json({ message: 'Email verification is unavailable in this local version.' });
  if (request.method === 'GET' && request.path === '/verify-email') {
    const callback = request.query.callbackURL;
    const requestOrigin = `${request.protocol}://${request.get('host')}`;
    let callbackURL;
    try { callbackURL = new URL(typeof callback === 'string' ? callback : requestOrigin, requestOrigin); } catch { callbackURL = null; }
    const callbackIsTrusted = callbackURL && allowedOrigins.has(callbackURL.origin);
    const errorURL = callbackIsTrusted && typeof callback === 'string'
      ? `${callback}${callback.includes('?') ? '&' : '?'}error=INVALID_TOKEN`
      : '/?error=INVALID_TOKEN';
    response.once('finish', () => {
      if (process.env.GYF_TRACE_AUTH_REDIRECTS === '1') {
        const location = response.getHeader('Location') ?? null;
        const error = typeof location === 'string' ? new URL(location, apiOrigin).searchParams.get('error') : null;
        process.stdout.write(`${JSON.stringify({ event: 'email-verification', status: response.statusCode, location, error })}\n`);
      }
    });
    if (!callbackIsTrusted || !consumeEmailVerificationToken(request.query.token)) return response.redirect(302, errorURL);
  }
  if (request.method === 'POST' && request.path === '/sign-up/email' && emailDeliveryMode === 'unconfigured') {
    return response.status(503).json({ ...emailNotConnected, message: 'Email delivery is not connected to GetYourFit yet, so we cannot verify new accounts. Please try again once it is.' });
  }
  if (request.method === 'POST' && request.path === '/sign-in/email') {
    const email = typeof request.body?.email === 'string' ? request.body.email : '';
    if (isLockedOut(email)) return response.status(401).json({ message: 'Email or password is incorrect. Try again later.' });
    response.once('finish', () => {
      const succeeded = response.statusCode >= 200 && response.statusCode < 300;
      recordSignInResult(email, succeeded);
      if (succeeded) { clearLockout(email); audit('sign-in-succeeded'); }
      else audit('sign-in-failed');
    });
  }
  next();
}, toNodeHandler(auth));
app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error);
  audit('request-failed');
  response.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
  const staticRoot = path.join(root, 'dist');
  app.use(compression({ filter: (request, response) => !request.path.startsWith('/api/') && compression.filter(request, response) }));
  app.use(express.static(staticRoot, { etag: true, maxAge: '1h' }));
  app.use((request, response) => {
    if (request.path.startsWith('/api/')) return response.status(404).json({ error: 'This action is not available.' });
    response.sendFile('index.html', { root: staticRoot });
  });
}

await migrateAuth();
ensureAuthSchema();
ensureWardrobeSchema();
ensureFunnelSchema();
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(apiPort, '127.0.0.1', () => {});
