import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = 'http://localhost:4179';
const mutation = process.env.MUTATION || '';
const photo = await readFile(fileURLToPath(new URL('../fixtures/garment-photo.jpg', import.meta.url)));
const users = new Map(), sessions = new Map(), garments = new Map();
const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
const page = (res, content) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GetYourFit</title><style>body{font:18px sans-serif;margin:16px;color:#222}input,button{display:block;max-width:100%;box-sizing:border-box;margin:8px 0}img{max-width:100%;width:240px}</style></head><body><main>${content}</main></body></html>`); };
const authenticated = req => sessions.get((req.headers.cookie || '').match(/gyf_session=([^;]+)/)?.[1]);
const owns = (email, item) => item?.email === email;
function multipartField(raw, key) { return raw.match(new RegExp(`name="${key}"\\r\\n\\r\\n([^\\r]+)`))?.[1]; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  const email = authenticated(req);
  if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/') return page(res, `<h1>Know what to wear</h1><p>Add your shirt and get an outfit for tonight.</p><a href="/sign-up">Get started</a>`);
  if (req.method === 'GET' && url.pathname === '/sign-up') {
    return page(res, `<h1>Create account</h1><form><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><label><input type="checkbox" name="age">I am 18 or older</label><button>${mutation === 'browser' ? 'Unavailable' : 'Create account'}</button></form><p role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password'),age_confirmed:f.has('age')})});if(r.ok)location.href='/wardrobe';else document.querySelector('[role=status]').textContent='Cannot create account'}</script>`);
  }
  if (req.method === 'GET' && url.pathname === '/wardrobe') {
    return page(res, `<h1>Your wardrobe</h1><form id="photo"><label>Garment photo<input name="photo" type="file" accept="image/jpeg"></label><label><input name="photo_consent" type="checkbox">Process this photo</label><button>Save garment</button></form><section id="garments"></section><form id="outfit"><label>Occasion<input name="occasion"></label><label>Weather<input name="weather"></label><label>Dress code<input name="dress_code"></label><button>Suggest an outfit</button></form><p role="status"></p><section id="outfits"></section><script>
      const render=items=>{document.querySelector('#garments').replaceChildren(...items.map(item=>{const img=document.createElement('img');img.alt='Your garment shirt';img.src=item.photo_url;return img}))};
      fetch('/api/wardrobe/items').then(r=>r.json()).then(data=>render(data.items||[]));
      document.querySelector('#photo').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);f.set('photo_consent',f.has('photo_consent')?'true':'false');f.set('ownership','owned');const r=await fetch('/api/wardrobe/items',{method:'POST',body:f});const item=await r.json();if(r.ok)render([item]);else document.querySelector('[role=status]').textContent='Cannot save photo'};
      document.querySelector('#outfit').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/outfits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const data=await r.json();document.querySelector('#outfits').replaceChildren(...(data.outfits||[]).map(outfit=>{const p=document.createElement('p');p.textContent=outfit.explanation;return p}))};
    </script>`);
  }
  const buffers = []; for await (const chunk of req) buffers.push(chunk);
  const raw = Buffer.concat(buffers);
  let body = {};
  if (req.headers['content-type']?.includes('application/json')) { try { body = JSON.parse(raw.toString()); } catch { return json(res, 400, { error: 'invalid request' }); } }
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    if (mutation === 'signup') return json(res, 503, { error: 'unavailable' });
    if (users.has(body.email)) {
      if (mutation === 'duplicate') users.set(body.email, body.password);
      return json(res, 409, { error: 'cannot create account' });
    }
    users.set(body.email, body.password);
    const token = randomUUID(); sessions.set(token, body.email);
    return json(res, 201, { email: body.email }, { 'set-cookie': `gyf_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    if (users.get(body.email) !== body.password) {
      if (mutation === 'authentication') return json(res, 200, { email: body.email });
      return json(res, 401, { error: mutation === 'enumeration' && !users.has(body.email) ? 'unknown account' : 'invalid credentials' });
    }
    const token = randomUUID(); sessions.set(token, body.email);
    return json(res, 200, { email: body.email }, { 'set-cookie': `gyf_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (!email) return json(res, 401, { error: 'sign in required' });
  if (url.pathname === '/api/auth/session') return mutation === 'session' ? json(res, 401, { error: 'lost session' }) : json(res, 200, { email });
  if (url.pathname === '/api/wardrobe/items' && req.method === 'POST') {
    const source = raw.toString('latin1');
    const consent = multipartField(source, 'photo_consent');
    const start = raw.indexOf(Buffer.from([0xff, 0xd8]));
    const end = raw.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
    if (consent !== 'true' && mutation !== 'consent') return json(res, 422, { error: 'consent required' });
    if ((start < 0 || end < 0 || !/content-type: image\/jpeg/i.test(source)) && mutation !== 'invalid-photo') return json(res, 415, { error: 'invalid photo' });
    const id = randomUUID();
    const item = { id, photo_url: `/api/photos/${id}`, ownership: multipartField(source, 'ownership'), email };
    garments.set(id, item);
    return json(res, 201, item);
  }
  if (url.pathname === '/api/wardrobe/items' && req.method === 'GET') return json(res, 200, { items: [...garments.values()].filter(item => mutation === 'list-isolation' || owns(email, item)) });
  const match = url.pathname.match(/^\/api\/(wardrobe\/items|photos)\/([^/]+)$/);
  if (match) {
    const item = garments.get(match[2]);
    const operation = match[1] === 'photos' ? 'photo-isolation' : req.method === 'GET' ? 'read-isolation' : req.method === 'PATCH' ? 'update-isolation' : 'delete-isolation';
    if (!item || (!owns(email, item) && mutation !== operation)) return json(res, 404, { error: 'not found' });
    if (match[1] === 'photos') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(mutation === 'photo' ? Buffer.from('not a photograph') : photo); }
    if (req.method === 'PATCH') { item.color = body.color; return json(res, 200, item); }
    if (req.method === 'DELETE') { garments.delete(item.id); return json(res, 200, { deleted: true }); }
    return json(res, 200, item);
  }
  if (url.pathname === '/api/outfits' && req.method === 'POST') {
    const shirt = [...garments.values()].find(item => owns(email, item));
    if (!shirt) return json(res, 422, { error: 'add a shirt' });
    if (!['occasion', 'weather', 'dress_code'].every(key => typeof body[key] === 'string' && body[key].trim())) return json(res, 422, { error: 'state occasion, weather and dress code' });
    const items = [{ id: shirt.id, category: 'top', ownership: 'owned' }, { id: 'suggested-trousers', category: 'bottom', ownership: 'wishlist' }, { id: 'suggested-shoes', category: 'footwear', ownership: 'wishlist' }];
    if (mutation === 'outfit') items.pop();
    if (mutation === 'photo-reuse') items[0].id = 'ignored-shirt';
    return json(res, 200, { outfits: [{ items, explanation: 'Wear your shirt with dark trousers and simple shoes for a relaxed dinner. The trousers and shoes are suggestions, not clothes in your wardrobe.' }] });
  }
  json(res, 404, { error: 'not found' });
});
server.listen(4179, '127.0.0.1');
