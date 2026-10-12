import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import sharp from 'sharp';
import { database } from './database.mjs';
import { contextKey, contextSchema, decideOutfit, exclusionSchema, factsSchema, garmentSchema, interpretationSchema, photoSchema } from '../shared/wardrobe.ts';

const execute = promisify(execFile);
const classifyScript = fileURLToPath(new URL('./classify.swift', import.meta.url));
export function ensureWardrobeSchema() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS garments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      facts TEXT NOT NULL,
      provenance TEXT NOT NULL,
      interpretation TEXT NOT NULL,
      photo BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS garments_owner ON garments(user_id);
    CREATE TABLE IF NOT EXISTS outfit_exclusions (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
      context TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (user_id, garment_id, context)
    );
  `);
}

function garment(row) {
  return garmentSchema.parse({ id: row.id, facts: JSON.parse(row.facts), provenance: JSON.parse(row.provenance),
    interpretation: JSON.parse(row.interpretation), photoConsent: { scope: 'local-processing-and-storage', recordedAt: row.created_at }, photoUrl: `/api/wardrobe/${row.id}/photo`, createdAt: row.created_at, updatedAt: row.updated_at });
}

const listRows = (userId) => database.prepare('SELECT * FROM garments WHERE user_id = ? ORDER BY created_at, id').all(userId);
export function exportWardrobe(userId) {
  return { wardrobe: listRows(userId).map((row) => ({ ...garment(row), photo: { mediaType: 'image/jpeg', base64: row.photo.toString('base64') } })),
    outfitCorrections: database.prepare('SELECT garment_id AS garmentId, context, recorded_at AS recordedAt FROM outfit_exclusions WHERE user_id = ? ORDER BY recorded_at').all(userId)
      .map((row) => ({ ...row, context: JSON.parse(row.context), source: 'wearer-correction', modelVersion: null, confidence: 1 })) };
}

async function decodePhoto(body) {
  const parsed = photoSchema.safeParse(body);
  if (!parsed.success) return null;
  try {
    const bytes = Buffer.from(parsed.data.image, 'base64');
    if (bytes.length > 1_000_000) return null;
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) return null;
    return await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return null;
  }
}

async function classify(photo) {
  if (process.platform !== 'darwin') return { kind: 'unavailable', reason: 'unsupported-device' };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gyf-vision-'));
  try {
    const file = path.join(directory, 'photo.jpg');
    await fs.writeFile(file, photo, { mode: 0o600 });
    const { stdout } = await execute('/usr/bin/swift', [classifyScript, file], { timeout: 30_000, maxBuffer: 32_000 });
    return interpretationSchema.parse(JSON.parse(stdout));
  } catch {
    return { kind: 'unavailable', reason: 'classification-failed' };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export function wardrobeRouter(requireUser) {
  const router = express.Router();
  router.use(requireUser, express.json({ limit: '2mb' }));
  router.get('/', (request, response) => response.json(listRows(request.user.id).map(garment)));
  router.post('/review', async (request, response) => {
    const photo = await decodePhoto(request.body);
    if (!photo) return response.status(400).json({ error: 'Choose a valid JPEG, PNG, or WebP photo and confirm photo permission.' });
    response.json(await classify(photo));
  });
  router.post('/', async (request, response) => {
    const facts = factsSchema.safeParse(request.body?.facts);
    if (!facts.success || request.body?.consent !== true) return response.status(400).json({ error: 'Confirm ownership, photo permission, and all garment facts.' });
    if (listRows(request.user.id).length >= 50) return response.status(409).json({ error: 'This local wardrobe holds up to 50 garments. Remove an item before adding another.' });
    const photo = await decodePhoto({ consent: request.body.consent, image: request.body.image });
    if (!photo) return response.status(400).json({ error: 'The photo could not be opened. Choose a valid, smaller photo.' });
    const interpretation = await classify(photo);
    // Recheck after asynchronous decoding and classification, before insertion.
    if (listRows(request.user.id).length >= 50) return response.status(409).json({ error: 'The wardrobe is full.' });
    if (!database.prepare('SELECT id FROM user WHERE id = ?').get(request.user.id)) return response.status(401).json({ error: 'Sign in to continue.' });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const provenance = Object.fromEntries(Object.keys(facts.data).map((key) => [key, { source: 'wearer-confirmed', modelVersion: null, confidence: 1, recordedAt: now }]));
    database.prepare('INSERT INTO garments (id, user_id, facts, provenance, interpretation, photo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, request.user.id, JSON.stringify(facts.data), JSON.stringify(provenance), JSON.stringify(interpretation), photo, now, now);
    response.status(201).json(garment(database.prepare('SELECT * FROM garments WHERE id = ? AND user_id = ?').get(id, request.user.id)));
  });
  router.get('/:id/photo', (request, response) => {
    const row = database.prepare('SELECT photo FROM garments WHERE id = ? AND user_id = ?').get(request.params.id, request.user.id);
    if (!row) return response.status(404).end();
    response.type('jpeg').send(row.photo);
  });
  router.patch('/:id', (request, response) => {
    const facts = factsSchema.safeParse(request.body);
    if (!facts.success) return response.status(400).json({ error: 'Confirm all garment facts before saving.' });
    const row = database.prepare('SELECT * FROM garments WHERE id = ? AND user_id = ?').get(request.params.id, request.user.id);
    if (!row) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    const now = new Date().toISOString();
    const previous = garment(row);
    const provenance = Object.fromEntries(Object.keys(facts.data).map((key) => [key, JSON.stringify(previous.facts[key]) === JSON.stringify(facts.data[key])
      ? previous.provenance[key] : { source: 'wearer-correction', modelVersion: null, confidence: 1, recordedAt: now }]));
    database.prepare('UPDATE garments SET facts = ?, provenance = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(facts.data), JSON.stringify(provenance), now, row.id, request.user.id);
    response.json(garment(database.prepare('SELECT * FROM garments WHERE id = ? AND user_id = ?').get(row.id, request.user.id)));
  });
  router.delete('/:id', (request, response) => {
    const result = database.prepare('DELETE FROM garments WHERE id = ? AND user_id = ?').run(request.params.id, request.user.id);
    if (!result.changes) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.exec('VACUUM');
    response.json({ deleted: true });
  });
  router.post('/outfit', (request, response) => {
    const context = contextSchema.safeParse(request.body);
    if (!context.success) return response.status(400).json({ error: 'Use an occasion, weather, and dress code to request an outfit.' });
    const excluded = database.prepare('SELECT garment_id FROM outfit_exclusions WHERE user_id = ? AND context = ?').all(request.user.id, contextKey(context.data));
    response.json(decideOutfit(context.data, listRows(request.user.id).map(garment), excluded.map((row) => row.garment_id)));
  });
  router.post('/correction', (request, response) => {
    const parsed = exclusionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Choose an item and an outfit context to correct.' });
    const { context, garmentId, excluded } = parsed.data;
    if (!database.prepare('SELECT id FROM garments WHERE id = ? AND user_id = ?').get(garmentId, request.user.id)) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    if (excluded) database.prepare('INSERT OR IGNORE INTO outfit_exclusions (user_id, garment_id, context, recorded_at) VALUES (?, ?, ?, ?)').run(request.user.id, garmentId, contextKey(context), new Date().toISOString());
    else database.prepare('DELETE FROM outfit_exclusions WHERE user_id = ? AND garment_id = ? AND context = ?').run(request.user.id, garmentId, contextKey(context));
    response.json({ saved: true });
  });
  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Send a valid photo and garment details within the upload limit.' });
    next(error);
  });
  return router;
}
