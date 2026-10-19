import http from 'node:http';
import { inspect } from 'node:util';
import { isIP } from 'node:net';
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth, clearLockout, isLockedOut, prepareAuthSchema, recordSignInResult } from './auth.mjs';
import { audit, closeDatabase, query, reclaimDeletedData, runMigrations } from './database.mjs';
import { funnelRouter } from './funnel.mjs';
import { exportWardrobe, wardrobeRouter } from './wardrobe.mjs';
import { allowedHosts, allowedOrigins, apiPort, trustedProxies } from './config.mjs';

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

// Email is not connected, so there is no reset or verification link to send. The signed-in password change in
// Better Auth (/api/auth/change-password) is the recovery path until a mail provider is added.
const emailUnavailable = { status: false, code: 'EMAIL_NOT_AVAILABLE', message: 'Email is not available yet, so password reset links cannot be sent. Change your password from Account while signed in.' };
const emailRoutes = new Set(['/request-password-reset', '/forget-password', '/reset-password', '/send-verification-email', '/verify-email', '/change-email']);

// A real query, so a monitor or keep-alive request also counts as database activity for Supabase's free-plan pause check.
app.get('/api/health', async (_request, response) => {
  try {
    await query('SELECT 1');
    response.json({ ok: true });
  } catch {
    response.status(503).json({ ok: false });
  }
});

app.get('/api/session', async (request, response) => {
  const user = await userFor(request);
  if (!user) return response.json({ signedIn: false });
  response.json({ signedIn: true, email: user.email, twoFactorEnabled: user.twoFactorEnabled === true });
});

app.post('/api/auth/sign-out-everywhere', requireUser, async (request, response) => {
  try {
    await auth.api.revokeSessions({ headers: fromNodeHeaders(request.headers) });
    await audit('sign-out-everywhere');
    response.setHeader('Set-Cookie', '__Secure-gyf.session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    response.json({ signedOut: true });
  } catch {
    response.status(400).json({ error: 'Could not sign out everywhere. Try again.' });
  }
});

app.get('/api/data/export', requireUser, async (request, response) => {
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
    ...await exportWardrobe(request.user.id),
  };
  response.setHeader('Content-Disposition', 'attachment; filename="getyourfit-account-export.json"');
  response.json(exported);
});

app.delete('/api/data', requireUser, async (request, response) => {
  if (request.body?.confirm !== 'delete my account') return response.status(400).json({ error: 'Confirm deletion to erase your local account.' });
  const { id, email } = request.user;
  await query('DELETE FROM "user" WHERE id = $1', [id]);
  await reclaimDeletedData();
  await clearLockout(email);
  await audit('account-deleted');
  response.setHeader('Set-Cookie', '__Secure-gyf.session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  response.json({ deleted: true });
});

app.use('/api/auth', async (request, response, next) => {
  try {
    if (emailRoutes.has(request.path)) return response.status(request.method === 'GET' ? 404 : 503).json(emailUnavailable);
    if (request.method === 'POST' && request.path === '/sign-in/email') {
      const email = typeof request.body?.email === 'string' ? request.body.email : '';
      if (await isLockedOut(email)) return response.status(401).json({ message: 'Email or password is incorrect. Try again later.' });
      response.once('finish', () => {
        const succeeded = response.statusCode >= 200 && response.statusCode < 300;
        void (async () => {
          await recordSignInResult(email, succeeded);
          await audit(succeeded ? 'sign-in-succeeded' : 'sign-in-failed');
        })().catch(() => {});
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}, toNodeHandler(auth));
app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error);
  process.stderr.write(`request failed: ${error?.stack || inspect(error)}\n`);
  void audit('request-failed');
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

await runMigrations();
await prepareAuthSchema();
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(apiPort, '127.0.0.1', () => {});

const shutdown = () => {
  server.close(() => { void closeDatabase().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
