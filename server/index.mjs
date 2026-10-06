import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth, clearLocalMailbox, clearLockout, consumeEmailVerificationToken, hashPassword, isLockedOut, localMailbox, migrateAuth, recordSignInResult, sendLocalMail } from './auth.mjs';
import { audit, database, ensureAuthSchema } from './database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedHosts = new Set(['localhost:4174', '127.0.0.1:4174']);
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4174', 'http://127.0.0.1:4174']);
const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"],
      baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '32kb' }));
app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  if (!allowedHosts.has(request.headers.host)) return response.status(403).json({ error: 'This local service only accepts local requests.' });
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'This local service only accepts requests from GetYourFit.' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origin) return response.status(403).json({ error: 'A same-site request is required.' });
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

app.post('/api/auth/request-password-reset', limitSensitiveRequest, (request, response) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const user = database.prepare('SELECT id FROM user WHERE lower(email) = ?').get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    database.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, user.id, Date.now() + 15 * 60_000);
    const baseURL = process.env.BETTER_AUTH_URL || (process.env.NODE_ENV === 'production' ? 'http://127.0.0.1:4174' : 'http://127.0.0.1:5173');
    const resetURL = new URL('/', baseURL);
    resetURL.searchParams.set('token', token);
    void sendLocalMail({ to: email, subject: 'Reset your GetYourFit password', text: `Use this single-use link within 15 minutes to reset your password:\n\n${resetURL}\n\nIf you did not request this, ignore this message.` }).catch(() => audit('mail-delivery-failed'));
  }
  response.json({ status: true, message: 'If this email has an account, check your local inbox for a reset link.' });
});

app.post('/api/auth/reset-password', limitSensitiveRequest, async (request, response) => {
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
  if (!user) return response.json({ signedIn: false });
  response.json({ signedIn: true, email: user.email, twoFactorEnabled: user.twoFactorEnabled === true });
});

app.get('/__mail', (_request, response) => {
  if (process.env.NODE_ENV === 'production' && process.env.GYF_ENABLE_LOCAL_MAILCATCHER !== '1') return response.status(404).end();
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const cards = localMailbox().map((mail) => {
    const urls = [...`${mail.text}\n${mail.html}`.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0].replaceAll('&amp;', '&'));
    return `<article><small>${escapeHtml(mail.to)} · ${escapeHtml(mail.receivedAt)}</small><h2>${escapeHtml(mail.subject)}</h2><p>${escapeHtml(mail.text)}</p>${urls.map((url) => `<a href="${escapeHtml(url)}">Open link</a>`).join(' ')}</article>`;
  }).join('') || '<p>No messages yet. Create an account or request a password reset.</p>';
  response.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local mail catcher · GetYourFit</title><style>body{max-width:760px;margin:48px auto;padding:0 20px;background:#f4f1ea;color:#26312c;font:16px/1.5 system-ui}article{background:white;border:1px solid #ddd8cd;padding:24px;margin:16px 0;border-radius:14px}small{color:#68736c}a{color:#225d4f;font-weight:650}h1{font-size:28px}</style><h1>Local mail catcher</h1><p>Messages stay in this process memory and are never delivered externally.</p>${cards}`);
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
  };
  response.setHeader('Content-Disposition', 'attachment; filename="getyourfit-account-export.json"');
  response.json(exported);
});

app.delete('/api/data', requireUser, (request, response) => {
  if (request.body?.confirm !== 'delete my account') return response.status(400).json({ error: 'Confirm deletion to erase your local account.' });
  const { id, email } = request.user;
  database.prepare('DELETE FROM user WHERE id = ?').run(id);
  clearLockout(email);
  clearLocalMailbox(email);
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.exec('VACUUM');
  audit('account-deleted');
  response.setHeader('Set-Cookie', '__Secure-gyf.session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  response.json({ deleted: true });
});

app.use('/api/auth', (request, response, next) => {
  if (request.path.endsWith('request-password-reset') || request.path.endsWith('reset-password')) {
    return limitSensitiveRequest(request, response, next);
  }
  next();
}, (request, response, next) => {
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
        const error = typeof location === 'string' ? new URL(location, 'http://127.0.0.1:4174').searchParams.get('error') : null;
        process.stdout.write(`${JSON.stringify({ event: 'email-verification', status: response.statusCode, location, error })}\n`);
      }
    });
    if (!callbackIsTrusted || !consumeEmailVerificationToken(request.query.token)) return response.redirect(302, errorURL);
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
  response.status(500).json({ error: 'The local service hit a problem. Try again.' });
});

if (process.env.NODE_ENV === 'production') {
  const staticRoot = path.join(root, 'dist');
  app.use(express.static(staticRoot, { etag: true, maxAge: '1h' }));
  app.use((request, response) => {
    if (request.path.startsWith('/api/')) return response.status(404).json({ error: 'This action is not available.' });
    if (request.path === '/__mail') return response.status(404).end();
    response.sendFile('index.html', { root: staticRoot });
  });
}

await migrateAuth();
ensureAuthSchema();
const port = Number(process.env.GYF_PORT || 4174);
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(port, '127.0.0.1', () => {});
