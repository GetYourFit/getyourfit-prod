import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT);
const origin = `http://127.0.0.1:${port}`;
const mutation = process.env.MUTATION || '';
const photos = new Map(await Promise.all(['garment-photo.jpg', 'bottom.jpg', 'footwear.jpg'].map(async filename => [filename, await readFile(fileURLToPath(new URL(`../fixtures/${filename}`, import.meta.url)))])));
const users = new Map(), sessions = new Map(), garments = new Map(), garmentPhotos = new Map();
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
    return page(res, `<h1>Create account</h1><form><label>Your name<input name="name" ${mutation === 'empty-name' ? '' : 'required'}></label><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><label><input type="checkbox" name="age">I am 18 or older</label><button>${mutation === 'browser' ? 'Unavailable' : 'Create account'}</button></form><p role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),password:f.get('password'),age_confirmed:f.has('age')})});if(r.ok)location.href='/wardrobe';else document.querySelector('[role=status]').textContent='Cannot create account'}</script>`);
  }
  if (req.method === 'GET' && url.pathname === '/wardrobe') {
    return page(res, `<h1>Your wardrobe</h1><form id="photo" hidden><label>Garment photo<input name="photo" type="file" accept="image/jpeg"></label><label><input name="photo_consent" type="checkbox">Process this photo</label><img id="preview" alt="Garment photo preview" hidden><section id="facts" hidden><h2>Confirm your garment facts</h2><label>Name<input name="name"></label><label>Category<select name="category"><option value="">Choose a category</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="footwear">Footwear</option></select></label><label>Color<input name="color"></label><label>Size on label<input name="size"></label><label>Does it fit you now?<select name="fit"><option value="unknown">I'm not sure</option><option value="fits">Fits</option><option value="does-not-fit">Does not fit</option></select></label><fieldset><legend>Weather you would wear it in</legend><label><input type="checkbox" name="weather" value="warm">warm</label><label><input type="checkbox" name="weather" value="mild">mild</label><label><input type="checkbox" name="weather" value="cold">cold</label></fieldset><fieldset><legend>Dress codes you would wear it for</legend><label><input type="checkbox" name="dress_code" value="casual">casual</label><label><input type="checkbox" name="dress_code" value="smart-casual">smart-casual</label><label><input type="checkbox" name="dress_code" value="formal">formal</label></fieldset><label><input type="checkbox" name="available" value="true">Available to wear now</label><label><input type="checkbox" name="ownership" value="true">I confirm this garment is mine and these are my facts.</label></section><button>Save garment</button></form><div id="entry"></div><section id="garments"></section><form id="outfit"><label>Occasion<input name="occasion"></label><label>Weather<select name="weather"><option value="unknown">I'm not sure</option><option value="mild">Mild</option><option value="warm">Warm</option><option value="cold">Cold</option></select></label><label>Dress code<select name="dress_code"><option value="unknown">I'm not sure</option><option value="casual">Casual</option><option value="smart-casual">Smart casual</option><option value="formal">Formal</option></select></label><button>Find an outfit</button></form><p role="status"></p><section id="outfits"></section><script>
      setTimeout(()=>{const b=document.createElement('button');b.type='button';b.textContent='Add garment';b.onclick=()=>{document.getElementById('photo').hidden=false};document.getElementById('entry').append(b)},700);
      const render=items=>{document.querySelector('#garments').replaceChildren(...items.map(item=>{const img=document.createElement('img');img.alt='Your garment shirt';img.src=item.photo_url;return img}))};
      fetch('/api/wardrobe/items').then(r=>r.json()).then(data=>render(data.items||[]));
      document.querySelector('[name=photo]').onchange=e=>{document.querySelector('#preview').src=URL.createObjectURL(e.target.files[0]);document.querySelector('#preview').hidden=false;document.querySelector('#facts').hidden=false};
      document.querySelector('#photo').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);f.set('photo_consent',f.has('photo_consent')?'true':'false');f.set('ownership',f.has('ownership')?'owned':'');const r=await fetch('/api/wardrobe/items',{method:'POST',body:f});const item=await r.json();if(r.ok)render([item]);else document.querySelector('[role=status]').textContent='Cannot save photo'};
      document.querySelector('#outfit').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/outfits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const data=await r.json();document.querySelector('#outfits').replaceChildren(...(data.outfits||[]).map(outfit=>{const p=document.createElement('p');p.textContent=outfit.explanation;return p}));if(data.question||data.abstention){const p=document.createElement('p');p.textContent=data.question||data.abstention;document.querySelector('#outfits').append(p)}};
    </script>`);
  }
  const buffers = []; for await (const chunk of req) buffers.push(chunk);
  const raw = Buffer.concat(buffers);
  let body = {};
  if (req.headers['content-type']?.includes('application/json')) { try { body = JSON.parse(raw.toString()); } catch { return json(res, 400, { error: 'invalid request' }); } }
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    if (mutation === 'signup') return json(res, 503, { error: 'unavailable' });
    if (body.name === '' && mutation !== 'empty-name') return json(res, 422, { error: 'name required' });
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
    const filename = source.match(/name="photo"; filename="([^"]+)"/)?.[1];
    const start = raw.indexOf(Buffer.from([0xff, 0xd8]));
    const end = raw.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
    if (consent !== 'true' && mutation !== 'consent') return json(res, 422, { error: 'consent required' });
    if ((start < 0 || end < 0 || !/content-type: image\/jpeg/i.test(source) || !photos.has(filename)) && mutation !== 'invalid-photo') return json(res, 415, { error: 'invalid photo' });
    const id = randomUUID();
    const item = { id, photo_url: `/api/photos/${id}`, ownership: multipartField(source, 'ownership'), name: multipartField(source, 'name'), category: multipartField(source, 'category'), color: multipartField(source, 'color'), size: multipartField(source, 'size'), fit: multipartField(source, 'fit'), available: multipartField(source, 'available') === 'true', weather: (multipartField(source, 'weather') || '').split(',').filter(Boolean), dress_codes: (multipartField(source, 'dress_code') || '').split(',').filter(Boolean), email };
    garments.set(id, item);
    garmentPhotos.set(id, filename);
    return json(res, 201, item);
  }
  if (url.pathname === '/api/wardrobe/items' && req.method === 'GET') return json(res, 200, { items: [...garments.values()].filter(item => mutation === 'list-isolation' || owns(email, item)) });
  const match = url.pathname.match(/^\/api\/(wardrobe\/items|photos)\/([^/]+)$/);
  if (match) {
    const item = garments.get(match[2]);
    const operation = match[1] === 'photos' ? 'photo-isolation' : req.method === 'GET' ? 'read-isolation' : req.method === 'PATCH' ? 'update-isolation' : 'delete-isolation';
    if (!item || (!owns(email, item) && mutation !== operation)) return json(res, 404, { error: 'not found' });
    if (match[1] === 'photos') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(mutation === 'photo' ? Buffer.from('not a photograph') : photos.get(garmentPhotos.get(item.id))); }
    if (req.method === 'PATCH') { item.color = body.color; return json(res, 200, item); }
    if (req.method === 'DELETE') { garments.delete(item.id); return json(res, 200, { deleted: true }); }
    return json(res, 200, item);
  }
  if (url.pathname === '/api/outfits' && req.method === 'POST') {
    const owned = [...garments.values()].filter(item => owns(email, item));
    if (!owned.length) return json(res, 422, { error: 'add a shirt' });
    const missingWeather = !body.weather || body.weather === 'unknown';
    const missingDressCode = !body.dress_code || body.dress_code === 'unknown';
    const complete = () => {
      const items = owned.map(({ id, category }) => ({ id, category }));
      if (mutation === 'outfit') items.pop();
      if (mutation === 'photo-reuse') items[0].id = items[1].id;
      if (mutation === 'unowned-outfit') items[1].id = 'suggested-trousers';
      return { outfits: [{ items, explanation: 'Wear the owned shirt, cargo pants and black trainers for a relaxed dinner.' }] };
    };
    if (missingWeather || missingDressCode) {
      if (missingWeather && mutation === 'missing-weather' || missingDressCode && mutation === 'missing-dress-code') return json(res, 200, complete());
      return json(res, 200, { outfits: [], question: missingWeather ? 'What weather should the outfit suit?' : 'What dress code should the outfit suit?' });
    }
    if (owned.length < 3) {
      if (mutation === 'single-shirt') return json(res, 200, { outfits: [{ items: [{ id: owned[0].id, category: owned[0].category }, { id: 'suggested-trousers', category: 'bottom' }, { id: 'suggested-shoes', category: 'footwear' }], explanation: 'Add suggested clothes to complete this outfit.' }] });
      return json(res, 200, { outfits: [], question: 'What other clothes do you own to complete this outfit?' });
    }
    const expectedCategories = new Set(['top', 'bottom', 'footwear']);
    if ([...expectedCategories].some(category => !owned.some(item => item.category === category))) return json(res, 200, { outfits: [], abstention: 'The wardrobe does not contain a complete owned set for this request.' });
    const result = complete();
    if (mutation === 'missing-weather' || mutation === 'missing-dress-code') return json(res, 200, result);
    return json(res, 200, result);
  }
  json(res, 404, { error: 'not found' });
});
server.once('error', error => { console.error(error); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`stub listening ${port}`));
