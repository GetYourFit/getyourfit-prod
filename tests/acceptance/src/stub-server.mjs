import http from 'node:http';

const port = Number(process.env.PORT || 4179);
const mutation = process.env.MUTATION || '';
const users = new Map();
const sessions = new Map();
const wardrobe = new Map();
const usedTokens = new Set();
let verifyToken = 'verify-valid';
const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': 'http://127.0.0.1:4179', 'access-control-allow-credentials': 'true', ...extra });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/__reset') {
    users.clear(); sessions.clear(); wardrobe.clear(); usedTokens.clear(); verifyToken = 'verify-valid';
    return json(res, 200, { reset: true });
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/') {
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    if (mutation !== 'security-headers') Object.assign(headers, { 'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
    res.writeHead(200, headers);
    const page = `<!doctype html><html ${mutation === 'accessibility' ? '' : 'lang="en"'}><head><title>${mutation === 'browser' ? '' : 'GetYourFit'}</title></head><body><main><h1>GetYourFit</h1><p>Know what to wear.</p>${mutation === 'keyboard' ? 'Sign in' : '<a href="/sign-in">Sign in</a>'}${mutation === 'responsive' ? '<svg width="1200" height="1"></svg>' : ''}</main>${mutation === 'console' ? '<script>console.error("acceptance fixture error")</script>' : ''}</body></html>`;
    if (mutation === 'performance') return setTimeout(() => res.end(page), 3000);
    return res.end(page);
  }
  if (req.method === 'GET' && url.pathname === '/wardrobe') {
    const message = mutation === 'offline-recovery' ? '' : 'Connection problem. You may be offline. Try again.';
    const outage = mutation === 'server-down-recovery' ? '' : 'The service is temporarily unavailable. Try again.';
    return res.end(`<!doctype html><html lang="en"><head><title>Your wardrobe</title></head><body><main><h1>Your wardrobe</h1><p id="state" role="status">Loading wardrobe…</p><button type="button" onclick="loadWardrobe()">Try again</button><button id="signout" type="button" hidden onclick="signOut()">Sign out</button></main><script>async function loadWardrobe(){const state=document.querySelector('#state');try{const r=await fetch('/api/wardrobe');if(r.status>=500){state.textContent=${JSON.stringify(outage)};return}if(r.ok){state.textContent='Your wardrobe is ready';document.querySelector('#signout').hidden=false;return}state.textContent='Sign in to see your wardrobe'}catch{state.textContent=${JSON.stringify(message)}}}async function signOut(){await fetch('/api/auth/logout',{method:'POST'});document.querySelector('#state').textContent='Signed out';document.querySelector('#signout').hidden=true}loadWardrobe()</script></body></html>`);
  }
  if (req.method === 'GET' && url.pathname === '/sign-up') return res.end(`<!doctype html><html lang="en"><head><title>Create account</title></head><body><main><h1>Create your account</h1><form id="signup"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><label><input name="age_confirmed" type="checkbox" required>I confirm I meet the age requirements</label><button>${mutation === 'browser-auth' ? 'Unavailable' : 'Create account'}</button></form><p role="status" aria-live="polite"></p></main><script>document.querySelector('#signup').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password'),age_confirmed:f.has('age_confirmed')})});document.querySelector('[role=status]').textContent=r.ok?'Check your email to verify your account':'Account could not be created'}</script></body></html>`);
  if (req.method === 'GET' && url.pathname === '/sign-in') return res.end(`<!doctype html><html lang="en"><head><title>Sign in</title></head><body><main><h1>Sign in</h1><form id="signin"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><button>Sign in</button></form><p role="status" aria-live="polite"></p></main><script>document.querySelector('#signin').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});document.querySelector('[role=status]').textContent=r.ok?'Signed in':'Sign-in failed'}</script></body></html>`);
  if (req.method === 'GET' && url.pathname === '/verify') return res.end(`<!doctype html><html lang="en"><head><title>Verify email</title></head><body><main><h1>Verify your email</h1><p role="status" aria-live="polite">Checking your link…</p></main><script>const q=new URLSearchParams(location.search);fetch('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:q.get('email'),token:q.get('token')})}).then(r=>document.querySelector('[role=status]').textContent=r.ok?'Email verified':'This link is invalid or expired')</script></body></html>`);
  if (['POST','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}` && mutation !== 'wrong-origin') return json(res, 403, { error: 'origin refused' });
  if (req.method === 'POST' && req.headers['sec-fetch-site'] === 'cross-site' && mutation !== 'csrf') return json(res, 403, { error: 'cross-site request refused' });
  let body = {};
  if (!['GET','HEAD'].includes(req.method)) {
    try {
      const raw = await new Promise((resolve, reject) => { let chunks=[]; req.on('data', x => chunks.push(x)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
      body = req.headers['content-type']?.startsWith('application/json') ? JSON.parse(raw.toString()) : {};
    }
    catch { return json(res, 400, { error: 'invalid json' }); }
  }
  const email = String(body.email || '').toLowerCase();
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    if (mutation === 'registration') return json(res, 500, { error: 'registration broken' });
    if (!body.email?.includes('@') || (body.password || '').length < 12 && mutation !== 'weak-password' || body.age_confirmed !== true && mutation !== 'age-confirmation') return json(res, 400, { error: 'invalid registration' });
    if (users.has(email) && mutation !== 'duplicate-email') return json(res, 409, { error: 'email unavailable' });
    users.set(email, { email, password: body.password, verified: false, deleted: false, attempts: 0 });
    return json(res, 201, { message: 'Check your email to verify your account.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/verify') {
    if (mutation === 'verification') return json(res, 500, { error: 'verification broken' });
    const user = users.get(email);
    const tokenKey = `${email}:${body.token}`;
    if (!user || body.token !== verifyToken && !(mutation === 'expired-link' && body.token === 'verify-expired') || usedTokens.has(tokenKey) && mutation !== 'reuse-link' || body.token === 'verify-expired' && mutation !== 'expired-link') return json(res, 410, { error: 'link invalid or expired' });
    usedTokens.add(tokenKey); user.verified = true;
    return json(res, 200, { verified: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const user = users.get(email);
    if (mutation === 'login' && user?.verified) return json(res, 401, { error: 'valid sign-in broken' });
    if (!user || user.deleted || !user.verified && mutation !== 'unverified-login') return json(res, 401, { error: 'Sign-in failed. Check your details or verify your email.' });
    if (mutation !== 'lockout' && user.attempts >= 8) return json(res, 423, { error: 'temporarily locked' });
    if (body.password !== user.password && mutation !== 'wrong-password') { user.attempts++; return json(res, 401, { error: 'Sign-in failed. Check your details or verify your email.' }); }
    user.attempts = 0;
    if (mutation === 'second-factor') return json(res, 202, { challenge: 'challenge-valid' });
    if (user.twoFactor) return json(res, 202, { challenge: 'challenge-valid' });
    const token = `session-${email}-${Math.random()}`;
    sessions.set(token, email);
    return json(res, 200, { session_token: token, user: { email } }, { 'set-cookie': `gyf_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/` });
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || decodeURIComponent((req.headers.cookie || '').match(/gyf_session=([^;]+)/)?.[1] || '');
  const sessionEmail = sessions.get(token);
  if (req.method === 'GET' && url.pathname === '/api/auth/session') return sessionEmail && mutation !== 'session-refresh' ? json(res, 200, { email: sessionEmail }) : json(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url.pathname === '/api/auth/2fa/verify') return body.code === '123456' && mutation !== 'second-factor' ? json(res, 200, { session_token: '2fa-session' }) : json(res, 401, { error: 'invalid code' });
  if (req.method === 'POST' && url.pathname === '/api/auth/2fa/challenge') return sessionEmail ? json(res, 200, { challenge: 'challenge-valid' }) : json(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url.pathname === '/api/auth/2fa/enable') {
    const user = users.get(sessionEmail); if (!user) return json(res, 401, { error: 'unauthorized' });
    user.twoFactor = true; return json(res, 200, { enabled: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/password/forgot') {
    if (mutation === 'enumeration') return json(res, users.has(email) ? 200 : 404, users.has(email) ? { message: 'Reset sent' } : { error: 'No account' });
    return json(res, 200, { message: 'If an account exists, reset instructions will be sent.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/password/reset') {
    const user = users.get(email);
    if (mutation === 'reset') return json(res, 500, { error: 'reset failed' });
    const tokenKey = `${email}:${body.token}`;
    if (body.token === 'reset-expired' && mutation === 'expired-link') return json(res, 200, { changed: true });
    if (!user || body.token !== 'reset-valid' || usedTokens.has(tokenKey)) return json(res, 410, { error: 'link invalid or expired' });
    usedTokens.add(tokenKey); user.password = body.password;
    return json(res, 200, { changed: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    if (token && mutation !== 'logout') sessions.delete(token);
    return json(res, 200, { signed_out: true }, { 'set-cookie': 'gyf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout-everywhere') {
    if (mutation !== 'logout-everywhere') for (const [id, owner] of sessions) if (owner === sessionEmail) sessions.delete(id);
    return json(res, 200, { signed_out_everywhere: true });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/auth/account') {
    const user = users.get(sessionEmail); if (!user) return json(res, 401, { error: 'unauthorized' });
    if (mutation === 'deletion') return json(res, 500, { error: 'deletion failed' });
    user.deleted = true; for (const [id, owner] of sessions) if (owner === sessionEmail) sessions.delete(id);
    return json(res, 200, { deleted: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/export') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    if (mutation === 'export') return json(res, 200, { email: sessionEmail, wardrobe: 'not-an-array' });
    return json(res, 200, { email: sessionEmail, wardrobe: [wardrobe.get(sessionEmail)].filter(Boolean) });
  }
  if (req.method === 'GET' && url.pathname === '/api/wardrobe') return sessionEmail ? json(res, 200, { wardrobe: [wardrobe.get(sessionEmail)].filter(Boolean) }) : json(res, 401, { error: 'unauthorized' });
  if (url.pathname === '/api/wardrobe/items') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST') {
      if (mutation === 'vision') return json(res, 201, { id: 'garment-1', ownership: 'unknown', interpretation: { category: 'shirt' } });
      const item = { id: 'garment-1', category: 'top', color: 'white', ownership: 'unknown', provenance: { image: 'user-upload', interpretation: 'vision' }, interpretation: { category: 'shirt', color: 'white', confidence: 0.96, provenance: { source: 'vision' } } };
      wardrobe.set(sessionEmail, item); return json(res, 201, item);
    }
    if (req.method === 'GET') return json(res, 200, { items: [wardrobe.get(sessionEmail)].filter(Boolean) });
  }
  const wardrobeItem = url.pathname.match(/^\/api\/wardrobe\/items\/([^/]+)$/);
  if (wardrobeItem && sessionEmail) {
    const item = wardrobe.get(sessionEmail); if (!item || item.id !== wardrobeItem[1]) return json(res, 404, { error: 'not found' });
    if (req.method === 'GET') {
      if (mutation === 'correction-persistence') return json(res, 200, { ...item, color: 'white' });
      if (mutation === 'provenance') return json(res, 200, { ...item, ownership: 'owned', provenance: {} });
      return json(res, 200, item);
    }
    if (req.method === 'PATCH') {
      if (body.corrections?.color) item.color = body.corrections.color;
      if (body.ownership) item.ownership = body.ownership;
      return json(res, 200, item);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/outfits') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    if (mutation === 'outfit-generation') return json(res, 200, { outfits: [] });
    if (mutation !== 'low-confidence' && /unfamiliar|no details/i.test(body.request || '')) return json(res, 200, { status: 'needs_clarification', question: 'What kind of ceremony is it, and where will it be held?', outfits: [] });
    const top = wardrobe.get(sessionEmail);
    const owned = mutation === 'wardrobe-reuse' ? 'unknown' : top?.ownership || 'unknown';
    return json(res, 200, { status: 'ready', wardrobe_reuse: mutation !== 'wardrobe-reuse' && owned === 'owned', outfits: [{ explanation: 'Your light shirt keeps the look relaxed while dark trousers and simple shoes make it dinner-ready.', items: [{ id: top?.id || 'shirt', category: 'top', ownership: owned }, { id: 'trousers', category: 'bottom', ownership: 'owned' }, { id: 'shoes', category: 'footwear', ownership: 'owned' }] }] });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/users/')) return mutation === 'tenant-isolation' ? json(res, 200, { email: 'alice@example.test', wardrobe: ['private'] }) : json(res, 404, { error: 'not found' });
  return json(res, 404, { error: 'not found' });
});

server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
