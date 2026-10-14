import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const port = Number(process.env.PORT);
const origin = `http://127.0.0.1:${port}`;
const mutation = process.env.MUTATION || '';
const photos = new Map(await Promise.all(['garment-photo.jpg', 'bottom.jpg', 'footwear.jpg'].map(async filename => [filename, await readFile(fileURLToPath(new URL(`../fixtures/${filename}`, import.meta.url)))])));
const users = new Map(), sessions = new Map(), garments = new Map(), garmentPhotos = new Map();
const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
const page = (res, content) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GetYourFit</title><style>body{font:18px sans-serif;margin:16px;color:#222}input,button{display:block;max-width:100%;box-sizing:border-box;margin:8px 0;font-size:16px}button,a{min-height:44px}a{display:inline-flex;align-items:center}img{max-width:100%;width:240px}label{display:block}</style></head><body><main>${content}</main><script type="module" src="/assets/public.js"></script></body></html>`); };
const authenticated = req => sessions.get((req.headers.cookie || '').match(/gyf_session=([^;]+)/)?.[1]);
const owns = (email, item) => item?.email === email;
const publicItem = item => { const result = { ...item }; delete result.email; return result; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  const email = authenticated(req);
  if (req.method === 'GET' && url.pathname === '/assets/public.js') {
    const script = Buffer.from('void 0;\n'.repeat(300));
    const compressed = mutation !== 'public-uncompressed' && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'content-type': 'text/javascript', ...(compressed ? { 'content-encoding': 'gzip' } : {}) });
    return res.end(compressed ? gzipSync(script) : script);
  }
  if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const examplePhoto = url.pathname.match(/^\/example\/(garment-photo|bottom|footwear)\.jpg$/);
  if (req.method === 'GET' && examplePhoto) {
    if (mutation === 'public-photo') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')); }
    res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(photos.get(`${examplePhoto[1]}.jpg`));
  }
  if (req.method === 'GET' && url.pathname === '/') {
    if (mutation === 'public-login-wall') return page(res, '<h1>Sign in</h1><label>Email<input type="email"></label><label>Password<input type="password"></label>');
    return page(res, `<h1>Know what to wear</h1><p${mutation === 'contrast' ? ' style="color:#74736b;background:#f4f1eb;font-size:14px"' : ''}>Add your shirt and get an outfit for tonight.</p><section aria-labelledby="example-title"><h2 id="example-title">Example outfit</h2><img src="/example/garment-photo.jpg" alt="Example shirt"><img src="/example/bottom.jpg" alt="Example trousers"><img src="/example/footwear.jpg" alt="Example footwear">${mutation === 'public-reason' ? '' : '<h3>Why this works</h3>'}<p>One complete top, bottom and footwear set.${mutation === 'public-facts' ? '' : ' Illustrative facts: available, fitting and compatible with the occasion.'}</p><a href="/sign-up"${mutation === 'public-small-action' ? ' style="min-height:20px"' : ''}>Build my wardrobe</a></section><section aria-labelledby="privacy-title"><h2 id="privacy-title">Your wardrobe stays private</h2><p>${mutation === 'public-privacy' ? 'Your photos stay on this phone.' : 'Photos go to the GetYourFit server; no external AI service is used.'}</p></section><a href="/sign-in">Sign in</a>`);
  }
  if (req.method === 'GET' && ['/sign-up', '/sign-in'].includes(url.pathname)) {
    const signingUp = url.pathname === '/sign-up';
    return page(res, `<p id="loading" ${mutation === 'auth-loading' ? '' : 'role="status"'}>Opening your account…</p><div id="account-entry" hidden><h1>${signingUp ? 'Create account' : 'Sign in'}</h1><form>${signingUp ? `<label>Your name<input name="name" ${mutation === 'empty-name' ? '' : 'required'}></label>` : ''}<label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required${mutation === 'auth-password-help' ? '' : ' aria-describedby="password-help"'}${mutation === 'auth-small-input' ? ' style="font-size:12px"' : ''}></label>${mutation === 'auth-password-help' ? '' : '<p id="password-help">At least 12 characters.</p>'}${!signingUp || mutation === 'browser-age-missing' ? '' : `<label><input type="checkbox" name="age" ${mutation === 'browser-age-unchecked' ? '' : 'required'}>I am 18 or older</label>`}<button${mutation === 'auth-tap' ? ' type="button"' : ''}>${mutation === 'browser' ? 'Unavailable' : signingUp ? 'Create account' : 'Sign in'}</button></form><a href="/sign-up">Create an account</a><p id="auth-error" role="alert" tabindex="-1" hidden></p></div><script>
      fetch('/api/session').then(()=>{document.getElementById('loading').remove();document.getElementById('account-entry').hidden=false;${mutation === 'auth-focus' ? '' : "document.querySelector('input').focus();"}});
      ${mutation === 'auth-enter' ? "document.querySelector('form').onkeydown=e=>{if(e.key==='Enter')e.preventDefault()};" : ''}
      document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/${signingUp ? 'sign-up' : 'sign-in'}/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),password:f.get('password'),adultConfirmed:f.has('age'),callbackURL:location.origin})});if(r.ok)location.href='/wardrobe';else{const error=document.getElementById('auth-error');error.hidden=false;error.textContent='Cannot create account. Try again.';${mutation === 'auth-error-focus' ? '' : 'error.focus();'}}};
    </script>`);
  }
  if (req.method === 'GET' && url.pathname === '/wardrobe') {
    return page(res, `<h1 tabindex="-1" ${mutation === 'wardrobe-focus' ? '' : 'autofocus'}>Your wardrobe</h1>${mutation === 'wardrobe-saved-device' ? '<p>Saved on this device</p>' : mutation === 'wardrobe-stays-device' ? '<p>Your wardrobe stays on this device</p>' : ''}<form id="photo" hidden><label>Garment photo<input name="photo" type="file" accept="image/jpeg"></label><label><input name="photo_consent" type="checkbox">${mutation === 'consent-device' ? 'I consent to processing and storing this photo on this device' : 'Process this photo on the GetYourFit server'}</label><img id="preview" alt="Garment photo preview" hidden><section id="facts" hidden><h2>Confirm your garment facts</h2><label>Name<input name="name"></label><label>Category<select name="category"><option value="">Choose a category</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="footwear">Footwear</option></select></label><label>Color<input name="color"></label><label>Size on label<input name="size"></label><label>Does it fit you now?<select name="fit"><option value="unknown">I'm not sure</option><option value="fits">Fits</option><option value="does-not-fit">Does not fit</option></select></label><fieldset><legend>Weather you would wear it in</legend><label><input type="checkbox" name="weather" value="warm">warm</label><label><input type="checkbox" name="weather" value="mild">mild</label><label><input type="checkbox" name="weather" value="cold">cold</label></fieldset><fieldset><legend>Dress codes you would wear it for</legend><label><input type="checkbox" name="dress_code" value="casual">casual</label><label><input type="checkbox" name="dress_code" value="smart-casual">smart-casual</label><label><input type="checkbox" name="dress_code" value="formal">formal</label></fieldset><label><input type="checkbox" name="available" value="true">Available to wear now</label><label><input type="checkbox" name="ownership" value="true">I confirm this garment is mine and these are my facts.</label></section><button>Save garment</button></form><div id="entry"></div><section id="garments"></section><form id="outfit"><label>Occasion<input name="occasion"></label><label>Weather<select name="weather"><option value="unknown">I'm not sure</option><option value="mild">Mild</option><option value="warm">Warm</option><option value="cold">Cold</option></select></label><label>Dress code<select name="dress_code"><option value="unknown">I'm not sure</option><option value="casual">Casual</option><option value="smart-casual">Smart casual</option><option value="formal">Formal</option></select></label><button>Find an outfit</button></form><p role="status"></p><section id="outfits"></section><script>
      setTimeout(()=>{const b=document.createElement('button');b.type='button';b.textContent='Add garment';b.onclick=()=>{document.getElementById('photo').hidden=false};document.getElementById('entry').append(b)},700);
      const render=items=>{${mutation === 'garment-saved-device' ? "if(items.length){const p=document.createElement('p');p.textContent='Saved on this device';document.querySelector('#entry').append(p)}" : ''}document.querySelector('#garments').replaceChildren(...items.map(item=>{const img=document.createElement('img');img.alt='Your garment shirt';img.src=item.photoUrl;return img}))};
      fetch('/api/wardrobe').then(r=>r.json()).then(render);
      document.querySelector('[name=photo]').onchange=e=>{document.querySelector('#preview').src=URL.createObjectURL(e.target.files[0]);document.querySelector('#preview').hidden=false;document.querySelector('#facts').hidden=false};
      document.querySelector('#photo').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const file=f.get('photo');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const facts={name:f.get('name'),category:f.get('category'),color:f.get('color'),size:f.get('size'),fit:f.get('fit'),owned:f.has('ownership'),available:f.has('available'),weather:f.getAll('weather'),dressCode:f.getAll('dress_code')};const r=await fetch('/api/wardrobe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({facts,consent:f.has('photo_consent'),image:btoa(binary)})});const item=await r.json();if(r.ok)render([item]);else document.querySelector('[role=status]').textContent='Cannot save photo'};
      document.querySelector('#outfit').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/wardrobe/outfit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({occasion:f.get('occasion'),weather:f.get('weather'),dressCode:f.get('dress_code')})});const data=await r.json();document.querySelector('#outfits').replaceChildren();if(data.kind==='complete'){const p=document.createElement('p');p.textContent=data.explanation;document.querySelector('#outfits').append(p)}else{const p=document.createElement('p');p.textContent=data.question||data.explanation;document.querySelector('#outfits').append(p)}};
    </script>`);
  }
  const buffers = []; for await (const chunk of req) buffers.push(chunk);
  let body = {};
  try { body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}; } catch { return json(res, 400, { error: 'invalid request' }); }
  if (url.pathname === '/api/auth/sign-up/email' && req.method === 'POST') {
    if (mutation === 'signup' && body.adultConfirmed === true) return json(res, 503, { error: 'unavailable' });
    if (body.name === '' && mutation !== 'empty-name') return json(res, 422, { error: 'name required' });
    const missingAgeConfirmation = !Object.hasOwn(body, 'adultConfirmed');
    const acceptsUncheckedAge = mutation === 'age-unchecked' && body.adultConfirmed === false;
    const acceptsMissingAge = mutation === 'age-missing' && missingAgeConfirmation;
    if (body.adultConfirmed !== true && !acceptsUncheckedAge && !acceptsMissingAge) return json(res, 422, { error: '18+ confirmation required' });
    if (users.has(body.email)) {
      if (mutation === 'duplicate') users.set(body.email, { ...users.get(body.email), password: body.password });
      return json(res, 409, { error: 'cannot create account' });
    }
    const user = { id: randomUUID(), name: body.name, email: body.email, emailVerified: false, adultConfirmed: Boolean(body.adultConfirmed) };
    users.set(body.email, { password: body.password, user });
    const token = randomUUID(); sessions.set(token, body.email);
    return json(res, 201, { redirect: body.callbackURL || false, token, user }, { 'set-cookie': `gyf_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (url.pathname === '/api/auth/sign-in/email' && req.method === 'POST') {
    const saved = users.get(body.email);
    if (!saved || saved.password !== body.password) {
      if (mutation === 'authentication') return json(res, 200, { redirect: '/wardrobe', token: randomUUID(), user: { id: randomUUID(), email: body.email } });
      return json(res, 401, { message: mutation === 'enumeration' && !saved ? 'Unknown account' : 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    const token = randomUUID(); sessions.set(token, body.email);
    return json(res, 200, { redirect: body.callbackURL || false, token, user: saved.user }, { 'set-cookie': `gyf_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (url.pathname === '/api/session' && req.method === 'GET') {
    if (mutation === 'session') return json(res, 401, { error: 'lost session' });
    return json(res, 200, email ? { signedIn: true, email, twoFactorEnabled: false, emailDeliveryMode: 'disabled' } : { signedIn: false, emailDeliveryMode: 'disabled' });
  }
  if (url.pathname === '/api/wardrobe' && req.method === 'GET') {
    if (!email) {
      if (mutation === 'anonymous-list-isolation') return json(res, 200, [...garments.values()].map(publicItem));
      return json(res, 401, { error: 'sign in required' });
    }
    return json(res, 200, [...garments.values()].filter(item => mutation === 'list-isolation' || owns(email, item)).map(item => {
      const value = publicItem(item);
      return mutation === 'refresh-photo-render' && owns(email, item) ? { ...value, photoUrl: `${value.photoUrl}?wrong=1` } : value;
    }));
  }
  if (!email) return json(res, 401, { error: 'sign in required' });
  if (url.pathname === '/api/wardrobe' && req.method === 'POST') {
    if (!body.consent && mutation !== 'consent') return json(res, 422, { error: 'consent required' });
    const image = Buffer.from(body.image || '', 'base64');
    const filename = [...photos].find(([, photo]) => photo.equals(image))?.[0];
    const validPhoto = image.length > 4 && image[0] === 0xff && image[1] === 0xd8 && image.at(-2) === 0xff && image.at(-1) === 0xd9 && filename;
    if (!validPhoto && mutation !== 'invalid-photo') return json(res, 415, { error: 'invalid photo' });
    const id = randomUUID();
    const item = { id, facts: body.facts || {}, provenance: [], interpretation: null, photoConsent: Boolean(body.consent), photoUrl: `/api/wardrobe/${id}/photo`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), email };
    garments.set(id, item);
    garmentPhotos.set(id, filename || 'garment-photo.jpg');
    return json(res, 201, publicItem(item));
  }
  const photoMatch = url.pathname.match(/^\/api\/wardrobe\/([^/]+)\/photo$/);
  if (photoMatch && req.method === 'GET') {
    const item = garments.get(photoMatch[1]);
    if (!item || (!owns(email, item) && !['read-isolation', 'photo-isolation'].includes(mutation))) return json(res, 404, { error: 'not found' });
    if (mutation === 'read-isolation' && !owns(email, item)) return json(res, 200, publicItem(item));
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    const photo = mutation === 'refresh-photo-render' && url.searchParams.has('wrong') ? photos.get('footwear.jpg') : photos.get(garmentPhotos.get(item.id));
    return res.end(mutation === 'photo' ? Buffer.from('not a photograph') : photo);
  }
  const itemMatch = url.pathname.match(/^\/api\/wardrobe\/([^/]+)$/);
  if (itemMatch && ['PATCH', 'DELETE'].includes(req.method)) {
    const item = garments.get(itemMatch[1]);
    if (!item || (!owns(email, item) && mutation !== (req.method === 'PATCH' ? 'update-isolation' : 'delete-isolation'))) return json(res, 404, { error: 'not found' });
    if (req.method === 'PATCH') {
      item.facts = body;
      item.updatedAt = new Date().toISOString();
      return json(res, 200, publicItem(item));
    }
    if (req.method === 'DELETE') { garments.delete(item.id); return json(res, 200, { deleted: true }); }
  }
  if (url.pathname === '/api/wardrobe/outfit' && req.method === 'POST') {
    const owned = [...garments.values()].filter(item => owns(email, item));
    const missingWeather = !body.weather || body.weather === 'unknown';
    const missingDressCode = !body.dressCode || body.dressCode === 'unknown';
    const incomplete = explanation => ({ kind: 'incomplete', excludedCount: owned.length, explanation });
    const question = (field, prompt) => ({ kind: 'context-question', field, question: prompt });
    const categories = ['top', 'bottom', 'footwear'];
    const select = (weather, dressCode) => {
      const valid = item => item.facts.owned && item.facts.available && item.facts.fit === 'fits' && item.facts.weather.includes(weather) && item.facts.dressCode.includes(dressCode);
      return categories.map(category => owned.find(item => item.facts.category === category && valid(item)));
    };
    const selected = select(body.weather, body.dressCode);
    const complete = (chosen = selected) => {
      const items = chosen.filter(Boolean).map(publicItem);
      if (mutation === 'outfit') items.pop();
      if (mutation === 'photo-reuse') items[0] = { ...items[0], id: 'suggested-shirt' };
      if (mutation === 'unowned-outfit') items[1] = { ...items[1], id: 'suggested-trousers' };
      const badVariants = {
        'unavailable-outfit': item => !item.facts.available,
        'misfit-outfit': item => item.facts.fit !== 'fits',
        'weather-outfit': item => !item.facts.weather.includes(body.weather),
        'dress-code-outfit': item => !item.facts.dressCode.includes(body.dressCode),
      };
      const invalid = badVariants[mutation];
      if (invalid) {
        const replacement = owned.find(item => item.facts.category === 'bottom' && invalid(item));
        if (replacement) items[1] = publicItem(replacement);
      }
      return { kind: 'complete', items, excludedCount: owned.length - items.length, explanation: 'For dinner: every selected item is yours, available, fits, and matches the known weather and dress code.' };
    };
    if (missingWeather) {
      if (mutation === 'missing-weather') return json(res, 200, complete(select('mild', body.dressCode)));
      return json(res, 200, question('weather', 'What weather should the outfit work for?'));
    }
    if (missingDressCode) {
      if (mutation === 'missing-dress-code') return json(res, 200, complete(select(body.weather, 'smart-casual')));
      return json(res, 200, question('dressCode', 'What is the dress code?'));
    }
    if (owned.length === 1 && owned[0].facts.category === 'top') {
      if (mutation === 'single-shirt') return json(res, 200, { kind: 'complete', items: [publicItem(owned[0]), { id: 'suggested-trousers', facts: { category: 'bottom' } }, { id: 'suggested-shoes', facts: { category: 'footwear' } }], explanation: 'Add suggested clothes to complete this outfit.' });
      return json(res, 200, incomplete('The wardrobe does not contain a complete owned set for this request.'));
    }
    if (selected.some(item => !item)) return json(res, 200, incomplete('The wardrobe does not contain a complete owned set for this request.'));
    return json(res, 200, complete());
  }
  json(res, 404, { error: 'not found' });
});
server.once('error', error => { console.error(error); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`stub listening ${port}`));
