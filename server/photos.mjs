import { backend } from './database.mjs';

const bucket = process.env.GYF_PHOTO_BUCKET || 'garment-photos';
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

// Photos stay in the database unless SUPABASE_URL and SUPABASE_SECRET_KEY are both set (opt-in, Postgres only).
// The bucket is private, the key is the project's secret key and never leaves the server, and every object lives under
// `<user id>/`. Browsers never talk to Storage: the wardrobe routes check ownership in the database, then read or write.
function configure() {
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY together to store garment photos in Supabase Storage.');
  if (backend !== 'postgres') throw new Error('Supabase Storage for garment photos requires the Postgres backend (DATABASE_URL).');
  const parsed = new URL(url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) throw new Error('SUPABASE_URL must be an HTTPS origin.');
  return parsed.origin;
}

const origin = configure();
export const photoStorageEnabled = origin !== null;

// New secret keys (sb_secret_...) go in the apikey header only; legacy service_role JWTs also go in Authorization.
const headers = (extra = {}) => ({ apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...extra });
const objectUrl = (objectPath) => `${origin}/storage/v1/object/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;

async function call(target, init) {
  const response = await fetch(target, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!response.ok && response.status !== 404) throw new Error(`Supabase Storage answered ${response.status}.`);
  return response;
}

export const objectPathFor = (userId, garmentId) => `${userId}/${garmentId}.jpg`;

export async function putPhoto(objectPath, bytes) {
  await call(objectUrl(objectPath), { method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: bytes });
}

export async function getPhoto(objectPath) {
  const response = await call(objectUrl(objectPath), { headers: headers() });
  return response.status === 404 ? null : Buffer.from(await response.arrayBuffer());
}

export async function removePhotos(objectPaths) {
  if (!objectPaths.length) return;
  await call(`${origin}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: objectPaths }) });
}

// Every object under one account's folder, for account deletion (also catches objects a failed upload left behind).
export async function removeAccountPhotos(userId) {
  for (;;) {
    const listed = await call(`${origin}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }) });
    const names = (await listed.json()).map((entry) => `${userId}/${entry.name}`);
    if (!names.length) return;
    await removePhotos(names);
  }
}

// Idempotent: creates the private bucket (JPEG only, 1 MB) when it does not exist yet.
export async function ensurePhotoBucket() {
  const found = await call(`${origin}/storage/v1/bucket/${bucket}`, { headers: headers() });
  if (found.status !== 404) {
    if ((await found.json()).public) throw new Error(`Storage bucket ${bucket} is public; garment photos must be private.`);
    return false;
  }
  await call(`${origin}/storage/v1/bucket`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 1_000_000, allowed_mime_types: ['image/jpeg'] }) });
  return true;
}
