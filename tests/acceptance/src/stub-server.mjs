import http from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 4179);
const mutation = process.env.MUTATION || '';
const origin = 'http://localhost:4179';
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const totpSecret = encodeBase32(randomBytes(10));
const users = new Map();
const sessions = new Map();
const wardrobe = new Map();
const photos = new Map();
const links = new Map();
const mail = [];
const usedTokens = new Set();
const challenges = new Map();
const resetAttempts = new Map();
let nextItem = 1;
const linkTtl = 30000;
const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', ...extra });
  res.end(JSON.stringify(body));
};
const issueLink = (email, purpose) => {
  const token = randomUUID();
  const expiresAt = Date.now() + linkTtl;
  links.set(token, { email, purpose, expiresAt });
  mail.push({ email, purpose, token, expiresAt });
  return token;
};
const sessionCookie = token => `gyf_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/`;
const clearedCookie = 'gyf_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
function totp(secret, now = Date.now()) {
  let bits = '';
  for (const char of secret) bits += base32Alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  let counter = BigInt(Math.floor(now / 30000));
  const message = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { message[i] = Number(counter & 0xffn); counter >>= 8n; }
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1000000).padStart(6, '0');
}
function encodeBase32(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let offset = 0; offset < bits.length; offset += 5) encoded += base32Alphabet[parseInt(bits.slice(offset, offset + 5).padEnd(5, '0'), 2)];
  return encoded;
}
function sessionFor(req) {
  const token = decodeURIComponent((req.headers.cookie || '').match(/gyf_session=([^;]+)/)?.[1] || '');
  return { token, email: sessions.get(token) };
}
function field(raw, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw.match(new RegExp(`name="${escaped}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
}
function outfitItem(id, category, facts) {
  return { id, category, ownership: 'owned', available: true, fits: true, weather_compatible: true, dress_code_compatible: true, weather: facts.weather, dress_code: facts.dress_code };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (req.method === 'GET' && url.pathname === '/__mail') {
    const wanted = url.searchParams.get('purpose');
    const message = mutation === 'reset-mail-race' && wanted === 'reset'
      ? mail.find(item => item.email === url.searchParams.get('email'))
      : [...mail].reverse().find(item => item.email === url.searchParams.get('email') && item.purpose === wanted);
    if (!message) return json(res, 404, { error: 'no new message' });
    const path = message.purpose === 'reset' ? '/reset-password' : '/verify';
    return json(res, 200, { url: `${origin}${path}?email=${encodeURIComponent(message.email)}&token=${message.token}&expires_at=${message.expiresAt}` });
  }
  if (req.method === 'GET' && url.pathname === '/__photo-size') {
    const bytes = photos.get(url.searchParams.get('id'));
    return bytes === undefined ? json(res, 404, { error: 'photo not found' }) : json(res, 200, { bytes });
  }
  if (req.method === 'POST' && url.pathname === '/__reset') {
    users.clear(); sessions.clear(); wardrobe.clear(); photos.clear(); links.clear(); mail.length = 0; usedTokens.clear(); challenges.clear(); resetAttempts.clear(); nextItem = 1;
    return json(res, 200, { reset: true });
  }
  if (req.method === 'POST' && url.pathname === '/__expire') {
    const body = await new Promise(resolve => { const chunks=[]; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({}); } }); });
    const issued = links.get(body.token);
    if (!issued) return json(res, 404, { error: 'unknown link' });
    if (mutation !== 'expired-link') issued.expiresAt = Date.now() - 1;
    return json(res, 200, { expired: true });
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/') {
    if (mutation === 'performance-budget') await new Promise(resolve => setTimeout(resolve, 2700));
    const page = `<!doctype html><html ${mutation === 'accessibility' ? '' : 'lang="en"'}><head><title>${mutation === 'browser' ? '' : 'GetYourFit'}</title></head><body><main><h1>GetYourFit</h1><p>Know what to wear.</p>${mutation === 'keyboard' ? 'Get started' : '<a href="/sign-up">Get started</a>'}${mutation === 'responsive' ? '<svg width="1200" height="1"></svg>' : ''}</main>${mutation === 'console' ? '<script>console.error("acceptance fixture error")</script>' : ''}</body></html>`;
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    if (mutation !== 'security-headers') Object.assign(headers, { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'", 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' });
    res.writeHead(200, headers);
    return res.end(page);
  }
  if (req.method === 'GET' && url.pathname === '/sign-up' && mutation === 'sign-up-render') {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><html lang="en"><head><title>Error</title></head><body></body></html>');
  }
  if (req.method === 'GET' && url.pathname === '/sign-up') return res.end(`<!doctype html><html lang="en"><head><title>Create account</title></head><body><main><h1>Create your account</h1><form id="signup"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><label><input name="age_confirmed" type="checkbox" required>I confirm I meet the age requirements</label><button>${mutation === 'browser-auth' ? 'Unavailable' : 'Create account'}</button></form><p role="status" aria-live="polite"></p></main><script>document.querySelector('#signup').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password'),age_confirmed:f.has('age_confirmed')})});document.querySelector('[role=status]').textContent=r.ok?'Check your email to verify your account':'Account could not be created'}</script></body></html>`);
  if (req.method === 'GET' && url.pathname === '/sign-in') return res.end(`<!doctype html><html lang="en"><head><title>Sign in</title></head><body><main><h1>Sign in</h1><form id="signin"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" required></label><button>Sign in</button></form><p role="status" aria-live="polite"></p></main><script>document.querySelector('#signin').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});const state=document.querySelector('[role=status]');if(r.status>=500&&'${mutation}'==='server-down-recovery'){state.textContent=await r.text();document.querySelector('[name=email]').value='';document.querySelector('[name=password]').value=''}else state.textContent=r.status>=500?'The service is temporarily unavailable. Try again.':r.ok?'Signed in':'Sign-in failed'}</script></body></html>`);
  if (req.method === 'GET' && url.pathname === '/verify') return res.end(`<!doctype html><html lang="en"><head><title>Verify email</title></head><body><main><h1>Verify your email</h1><p role="status" aria-live="polite">Checking your link…</p></main><script>const q=new URLSearchParams(location.search);fetch('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:q.get('email'),token:q.get('token')})}).then(r=>document.querySelector('[role=status]').textContent=r.ok?'Email verified':'This link is invalid or expired')</script></body></html>`);
  if (req.method === 'GET' && url.pathname === '/wardrobe' && mutation === 'wardrobe-route') { res.writeHead(404); return res.end('not found'); }
  if (req.method === 'GET' && url.pathname === '/wardrobe') {
    return res.end(`<!doctype html><html lang="en"><head><title>Your wardrobe</title></head><body><main><h1>Your wardrobe</h1><p id="state" role="status">Loading wardrobe…</p><button type="button" onclick="loadWardrobe()">Try again</button><form id="photo-form"><label>Garment photo <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label><input id="consent" type="checkbox">I give permission to process this photo on this device</label><button id="review" type="button" disabled>Review photo on this device</button><button id="save" type="button" disabled>Save garment</button></form><button id="signout" type="button" hidden onclick="signOut()">Sign out</button></main><script>
      const state=document.querySelector('#state'), photo=document.querySelector('#photo'), consent=document.querySelector('#consent'), review=document.querySelector('#review'), save=document.querySelector('#save'); let interpretation;
      async function loadWardrobe(){try{const r=await fetch('/api/wardrobe');if(r.status>=500){state.textContent=${JSON.stringify(mutation === 'server-down-recovery' ? '' : 'The service is temporarily unavailable. Try again.')};return}if(r.ok){state.textContent='Your wardrobe is ready';document.querySelector('#signout').hidden=false;return}state.textContent='Sign in to see your wardrobe'}catch{state.textContent=${JSON.stringify(mutation === 'offline-recovery' ? '' : 'Connection problem. You may be offline. Try again.')}}}
      async function signOut(){const r=await fetch('/api/auth/logout',{method:'POST'});state.textContent=r.ok?'Signed out':'Sign out failed'}
      consent.onchange=()=>{review.disabled=(!consent.checked&&!${mutation === 'photo-consent'})||!photo.files.length};photo.onchange=()=>{review.disabled=(!consent.checked&&!${mutation === 'photo-consent'})||!photo.files.length};
      review.onclick=async()=>{const file=photo.files[0];if(!consent.checked&&!${mutation === 'photo-consent'}){state.textContent='Give permission before reviewing this photo.';return}if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)&&'${mutation}'!=='unsupported-photo'){state.textContent='Choose a JPEG, PNG, or WebP photo.';save.disabled=true;return}try{await createImageBitmap(file)}catch{if('${mutation}'!=='unsupported-photo'){state.textContent='This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.';save.disabled=true;return}}const response=await fetch('/api/vision/classify',{method:'POST',body:file});interpretation=await response.json();state.textContent='Photo reviewed on this device';save.disabled=!response.ok};
      save.onclick=async()=>{const original=photo.files[0];let saved=original;if('${mutation}'!=='photo-resize'){const bitmap=await createImageBitmap(original);const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));saved=new File([blob],original.name,{type:'image/jpeg'})}const data=new FormData();data.append('photo',saved);data.append('ownership','unknown');data.append('photo_consent','true');const response=await fetch('/api/wardrobe/items',{method:'POST',body:data});state.textContent=response.ok?'Garment saved':'Garment could not be saved'};loadWardrobe();
    </script></body></html>`);
  }
  const mutating = ['POST','PATCH','DELETE'].includes(req.method);
  if (mutating && mutation !== 'wrong-origin' && mutation !== 'missing-origin' && (!req.headers.origin || req.headers.origin !== origin)) return json(res, 403, { error: 'origin refused' });
  if (req.method === 'POST' && req.headers['sec-fetch-site'] === 'cross-site' && mutation !== 'csrf') return json(res, 403, { error: 'cross-site request refused' });
  let body = {};
  let raw = Buffer.alloc(0);
  if (!['GET','HEAD'].includes(req.method)) {
    try {
      raw = await new Promise((resolve, reject) => { const chunks=[]; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
      body = req.headers['content-type']?.startsWith('application/json') ? JSON.parse(raw.toString()) : {};
    } catch { return json(res, 400, { error: 'invalid request' }); }
  }
  const { token: sessionToken, email: sessionEmail } = sessionFor(req);
  const email = String(body.email || '').toLowerCase();
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    if (mutation === 'log-privacy') console.log(JSON.stringify(body));
    if (mutation === 'registration') return json(res, 500, { error: 'registration broken' });
    const weak = (body.password || '').length < 12;
    if ((!body.email?.includes('@') || weak && mutation !== 'weak-password' || body.age_confirmed !== true && mutation !== 'age-confirmation')) return json(res, 400, { error: 'invalid registration' });
    if (users.has(email) && mutation !== 'duplicate-email') return json(res, 409, { error: 'email unavailable' });
    users.set(email, { email, password: body.password, verified: false, deleted: false, attempts: 0 });
    issueLink(email, 'verification');
    return json(res, 201, { message: 'Check your email to verify your account.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/verify') {
    if (mutation === 'verification') return json(res, 500, { error: 'verification broken' });
    const user = users.get(email);
    const issued = links.get(body.token);
    const expired = issued && Date.now() > issued.expiresAt;
    if (!user || issued?.email !== email || issued.purpose !== 'verification' || expired && mutation !== 'expired-link' || usedTokens.has(body.token) && mutation !== 'reuse-link') return json(res, 410, { error: 'link invalid or expired' });
    usedTokens.add(body.token); user.verified = true;
    return json(res, 200, { verified: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const user = users.get(email);
    if (mutation === 'login' && user?.verified) return json(res, 401, { error: 'Sign-in failed. Check your details or verify your email.' });
    if (!user || user.deleted || !user.verified && mutation !== 'unverified-login') return json(res, 401, { error: 'Sign-in failed. Check your details or verify your email.' });
    if (user.attempts >= 4 && mutation !== 'lockout') return json(res, 423, { error: 'temporarily locked' });
    if (body.password !== user.password && mutation !== 'wrong-password') { user.attempts++; return json(res, 401, { error: 'Sign-in failed. Check your details or verify your email.' }); }
    user.attempts = 0;
    if (user.twoFactor) { const challenge = randomUUID(); challenges.set(challenge, email); return json(res, 202, { challenge }); }
    const session = randomUUID(); sessions.set(session, email);
    return json(res, 200, { user: { email } }, { 'set-cookie': sessionCookie(session) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/2fa/enable') {
    const user = users.get(sessionEmail); if (!user) return json(res, 401, { error: 'unauthorized' });
    user.twoFactor = true;
    return json(res, 200, { provisioning_uri: `otpauth://totp/GetYourFit:acceptance?secret=${totpSecret}&issuer=GetYourFit` });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/2fa/verify') {
    const owner = challenges.get(body.challenge);
    if (!owner || body.code !== totp(totpSecret) || mutation === 'second-factor') return json(res, 401, { error: 'invalid code' });
    challenges.delete(body.challenge);
    const session = randomUUID(); sessions.set(session, owner);
    return json(res, 200, { user: { email: owner } }, { 'set-cookie': sessionCookie(session) });
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/session') return sessionEmail && mutation !== 'session-refresh' ? json(res, 200, { email: sessionEmail }) : json(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url.pathname === '/api/auth/password/forgot') {
    if (mutation === 'enumeration') return json(res, users.has(email) ? 200 : 404, users.has(email) ? { message: 'Reset sent' } : { error: 'No account' });
    const attempt = (resetAttempts.get(email) || 0) + 1; resetAttempts.set(email, attempt);
    if (attempt > 4 && mutation !== 'rate-controls') return json(res, 429, { message: 'If an account exists, reset instructions will be sent.' });
    if (users.has(email)) issueLink(email, 'reset');
    return json(res, 200, { message: 'If an account exists, reset instructions will be sent.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/password/reset') {
    const user = users.get(email);
    if (mutation === 'reset') return json(res, 500, { error: 'reset failed' });
    const issued = links.get(body.token);
    const expired = issued && Date.now() > issued.expiresAt;
    if (!user || issued?.email !== email || issued.purpose !== 'reset' || expired && mutation !== 'expired-link' || usedTokens.has(body.token)) return json(res, 410, { error: 'link invalid or expired' });
    usedTokens.add(body.token); user.password = body.password;
    if (mutation !== 'password-reset-revocation') for (const [id, owner] of sessions) if (owner === email) sessions.delete(id);
    return json(res, 200, { changed: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    if (sessionToken && mutation !== 'logout') sessions.delete(sessionToken);
    return json(res, 200, { signed_out: true }, { 'set-cookie': clearedCookie });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout-everywhere') {
    if (mutation !== 'logout-everywhere') for (const [id, owner] of sessions) if (owner === sessionEmail) sessions.delete(id);
    return json(res, 200, { signed_out_everywhere: true }, { 'set-cookie': clearedCookie });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/auth/account') {
    const user = users.get(sessionEmail); if (!user) return json(res, 401, { error: 'unauthorized' });
    if (mutation === 'deletion') return json(res, 500, { error: 'deletion failed' });
    user.deleted = true; wardrobe.delete(sessionEmail);
    for (const [id, owner] of sessions) if (owner === sessionEmail) sessions.delete(id);
    return json(res, 200, { deleted: true }, { 'set-cookie': clearedCookie });
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/export') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    const items = [...(wardrobe.get(sessionEmail)?.values() || [])];
    if (mutation === 'export') return json(res, 200, { email: sessionEmail, wardrobe: items.map(({ id }) => ({ id })) });
    return json(res, 200, { email: sessionEmail, wardrobe: items });
  }
  if (req.method === 'POST' && url.pathname === '/api/vision/classify') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    if (mutation === 'vision') return json(res, 200, { category: 'shirt', confidence: 0.96 });
    return json(res, 200, { category: 'shirt', color: 'white', confidence: 0.96, model_version: 'Apple Vision local fixture', provenance: { source: 'vision' } });
  }
  if (url.pathname === '/api/wardrobe/items') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST') {
      const consented = field(raw.toString(), 'photo_consent') === 'true';
      if (!consented) return json(res, 400, { error: 'photo consent required' });
      if (mutation === 'vision') return json(res, 201, { id: 'garment-1', ownership: 'unknown', interpretation: { category: 'shirt' } });
      const item = { id: `garment-${nextItem++}`, category: 'top', color: 'white', ownership: 'unknown', available: true, fits: true, weather: 'mild and dry', dress_code: 'smart casual', photo_data: 'stored-local-photo-fixture', provenance: { image: 'user-upload', interpretation: 'vision' }, interpretation: { category: 'shirt', color: 'white', confidence: 0.96, model_version: 'Apple Vision local fixture', provenance: { source: 'vision' } } };
      const start = raw.indexOf(Buffer.from([0xff, 0xd8])); const end = raw.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (start >= 0 && end > start) photos.set(item.id, end - start + 2);
      const items = wardrobe.get(sessionEmail) || new Map(); items.set(item.id, item); wardrobe.set(sessionEmail, items);
      return json(res, 201, item);
    }
    if (req.method === 'GET') return json(res, 200, { items: [...(wardrobe.get(sessionEmail)?.values() || [])] });
  }
  const wardrobeItem = url.pathname.match(/^\/api\/wardrobe\/items\/([^/]+)$/);
  if (wardrobeItem) {
    const item = wardrobe.get(sessionEmail)?.get(wardrobeItem[1]);
    if (!sessionEmail) return json(res, 401, { error: 'not found' });
    if (!item) {
      const foreign = [...wardrobe.entries()].map(([owner, items]) => ({ owner, items, item: items.get(wardrobeItem[1]) })).find(value => value.item && value.owner !== sessionEmail);
      if (foreign && mutation === 'tenant-isolation' && req.method === 'GET') return json(res, 200, foreign.item);
      if (foreign && mutation === 'tenant-update-isolation' && req.method === 'PATCH') {
        if (body.corrections?.color) foreign.item.color = body.corrections.color;
        return json(res, 200, foreign.item);
      }
      if (foreign && mutation === 'tenant-delete-isolation' && req.method === 'DELETE') {
        foreign.items.delete(foreign.item.id); return json(res, 200, { deleted: true });
      }
      return json(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET') {
      if (mutation === 'correction-persistence') return json(res, 200, { ...item, color: 'white' });
      if (mutation === 'provenance') return json(res, 200, { ...item, ownership: 'owned', provenance: {} });
      return json(res, 200, item);
    }
    if (req.method === 'PATCH') {
      if (body.corrections?.color) {
        item.color = body.corrections.color;
        item.correction = { source: 'wearer-correction', model_version: null, confidence: 1 };
      }
      if (body.ownership) item.ownership = body.ownership;
      for (const key of ['available','fits']) if (key in body) item[key] = body[key];
      return json(res, 200, item);
    }
    if (req.method === 'DELETE') { wardrobe.get(sessionEmail).delete(item.id); return json(res, 200, { deleted: true }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/wardrobe') return sessionEmail ? json(res, 200, { items: [...(wardrobe.get(sessionEmail)?.values() || [])] }) : json(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url.pathname === '/api/outfits') {
    if (!sessionEmail) return json(res, 401, { error: 'unauthorized' });
    const facts = body.request || {};
    const hasFacts = facts.occasion && facts.weather && facts.dress_code;
    if (mutation === 'outfit-generation') return json(res, 200, { outfits: [] });
    if (mutation === 'low-confidence') return json(res, 200, { status: 'ready', outfits: [{ items: [outfitItem('shirt', 'top', facts)], explanation: 'Confident suggestion.' }] });
    if (!hasFacts && mutation !== 'low-confidence') return json(res, 200, { status: 'needs_clarification', question: 'What is the weather and dress code?', outfits: [] });
    const owned = [...(wardrobe.get(sessionEmail)?.values() || [])].find(item => item.ownership === 'owned' && item.available && item.fits);
    if (mutation !== 'incomplete-outfit' && (!owned || !hasFacts)) return json(res, 200, { status: hasFacts ? 'no_complete_outfit' : 'needs_clarification', question: 'What is the weather and dress code?', outfits: [] });
    const top = outfitItem(owned?.id || 'garment-top', 'top', facts);
    if (mutation === 'wardrobe-reuse') top.ownership = 'wishlist';
    const items = mutation === 'incomplete-outfit' ? [top] : [top, outfitItem('garment-bottom', 'bottom', facts), outfitItem('garment-footwear', 'footwear', facts)];
    return json(res, 200, { status: 'ready', wardrobe_reuse: items.every(item => item.ownership === 'owned'), outfits: [{ explanation: 'Your owned pieces satisfy the stated weather and dress code.', items }] });
  }
  return json(res, 404, { error: 'not found' });
});

server.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
