import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import sharp from 'sharp';
import { asIso, asJson, query, reclaimDeletedData, transaction } from './database.mjs';
import { contextKey, contextSchema, decideOutfit, exclusionSchema, factsSchema, garmentSchema, interpretationSchema, photoSchema } from '../shared/wardrobe.ts';
import { buildStarterRoles, confirmStarterRole, starterSaveSchema, starterPlanActionSchema, starterPlanSchema } from '../shared/starter-plan.ts';
import { shoppingSourceListSchema } from '../shared/shopping.ts';
import shoppingSourceRecords from './shopping-sources.json' with { type: 'json' };
import { browserInterpretationSchema } from '../shared/classification.ts';

const execute = promisify(execFile);
const shoppingSources = shoppingSourceListSchema.parse(shoppingSourceRecords);
const factsPatchSchema = factsSchema.partial().refine((facts) => Object.keys(facts).length > 0);
const classifyScript = fileURLToPath(new URL('./classify.swift', import.meta.url));
function garment(row) {
  return garmentSchema.parse({ id: row.id, facts: asJson(row.facts), provenance: asJson(row.provenance),
    interpretation: asJson(row.interpretation), photoConsent: { scope: 'local-processing-and-storage', recordedAt: asIso(row.created_at) }, photoUrl: `/api/wardrobe/${row.id}/photo`, createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at) });
}

const garmentColumns = 'id, facts, provenance, interpretation, created_at, updated_at';
const listRows = async (userId) => (await query(`SELECT ${garmentColumns} FROM garments WHERE user_id = $1 ORDER BY created_at, id`, [userId])).rows;
const countGarments = async (userId, run = query) => Number((await run('SELECT count(*) AS count FROM garments WHERE user_id = $1', [userId])).rows[0].count);
function starterPlan(row) {
  return starterPlanSchema.parse({ id: row.id, status: row.status, input: asJson(row.input), roles: asJson(row.roles),
    createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at) });
}
const listStarterPlans = async (userId) => (await query('SELECT * FROM starter_plans WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [userId])).rows.map(starterPlan);

export async function exportWardrobe(userId) {
  const exclusions = (await query('SELECT garment_id AS "garmentId", context, recorded_at AS "recordedAt" FROM outfit_exclusions WHERE user_id = $1 ORDER BY recorded_at', [userId])).rows;
  const rows = (await query(`SELECT ${garmentColumns}, photo FROM garments WHERE user_id = $1 ORDER BY created_at, id`, [userId])).rows;
  return { wardrobe: rows.map((row) => ({ ...garment(row), photo: { mediaType: 'image/jpeg', base64: row.photo.toString('base64') } })),
    outfitCorrections: exclusions.map((row) => ({ ...row, recordedAt: asIso(row.recordedAt), context: JSON.parse(row.context), source: 'wearer-correction', modelVersion: null, confidence: 1 })),
    starterPlans: await listStarterPlans(userId) };
}

async function insertStarterPlan(userId, input, roles, status = 'active', run = query, id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  const plan = starterPlanSchema.parse({ id, status, input, roles, createdAt: now, updatedAt: now });
  await run('INSERT INTO starter_plans (id, user_id, status, input, roles, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
    [plan.id, userId, plan.status, JSON.stringify(plan.input), JSON.stringify(plan.roles), plan.createdAt, plan.updatedAt]);
  const { rows } = await run('SELECT * FROM starter_plans WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows.length) throw new Error('This plan could not be saved. Try a new plan.');
  return starterPlan(rows[0]);
}

async function updateStarterPlan(userId, plan, run = query) {
  const updated = starterPlanSchema.parse({ ...plan, updatedAt: new Date().toISOString() });
  await run('UPDATE starter_plans SET status = $1, input = $2, roles = $3, updated_at = $4 WHERE id = $5 AND user_id = $6',
    [updated.status, JSON.stringify(updated.input), JSON.stringify(updated.roles), updated.updatedAt, updated.id, userId]);
  return updated;
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
  if (process.env.GYF_CLASSIFIER !== 'apple-vision' || process.platform !== 'darwin') return { kind: 'unavailable', reason: 'unsupported-device' };
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
  router.get('/', async (request, response) => response.json((await listRows(request.user.id)).map(garment)));
  router.post('/review', async (request, response) => {
    const photo = await decodePhoto(request.body);
    if (!photo) return response.status(400).json({ error: 'Choose a valid JPEG, PNG, or WebP photo and confirm photo permission.' });
    response.json(await classify(photo));
  });
  router.post('/', async (request, response) => {
    const facts = factsSchema.safeParse(request.body?.facts);
    if (!facts.success || request.body?.consent !== true) return response.status(400).json({ error: 'Confirm ownership, photo permission, and all garment facts.' });
    if (await countGarments(request.user.id) >= 50) return response.status(409).json({ error: 'This wardrobe holds up to 50 garments. Remove an item before adding another.' });
    const photo = await decodePhoto({ consent: request.body.consent, image: request.body.image });
    if (!photo) return response.status(400).json({ error: 'The photo could not be opened. Choose a valid, smaller photo.' });
    const submitted = browserInterpretationSchema.safeParse(request.body?.interpretation);
    if (request.body?.interpretation !== undefined && !submitted.success) return response.status(400).json({ error: 'Invalid on-device photo review. Review the photo again.' });
    const interpretation = submitted.success ? submitted.data : await classify(photo);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const provenance = Object.fromEntries(Object.keys(facts.data).map((key) => [key, { source: 'wearer-confirmed', modelVersion: null, confidence: 1, recordedAt: now }]));
    // Locking the account row serializes this user's inserts, so the limit holds under concurrent uploads and a deleted account is refused.
    const created = await transaction(async (run) => {
      if (!(await run('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [request.user.id])).rows.length) return 'signed-out';
      if (await countGarments(request.user.id, run) >= 50) return 'full';
      return (await run(`INSERT INTO garments (id, user_id, facts, provenance, interpretation, photo, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING ${garmentColumns}`,
        [id, request.user.id, JSON.stringify(facts.data), JSON.stringify(provenance), JSON.stringify(interpretation), photo, now])).rows[0];
    });
    if (created === 'signed-out') return response.status(401).json({ error: 'Sign in to continue.' });
    if (created === 'full') return response.status(409).json({ error: 'The wardrobe is full.' });
    response.status(201).json(garment(created));
  });
  router.get('/:id/photo', async (request, response) => {
    const { rows } = await query('SELECT photo FROM garments WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    if (!rows.length) return response.status(404).end();
    response.type('jpeg').send(rows[0].photo);
  });
  router.patch('/:id', async (request, response) => {
    const changes = factsPatchSchema.safeParse(request.body);
    if (!changes.success) return response.status(400).json({ error: 'Send at least one valid garment fact before saving.' });
    const updated = await transaction(async (run) => {
      const { rows } = await run(`SELECT ${garmentColumns} FROM garments WHERE id = $1 AND user_id = $2 FOR UPDATE`, [request.params.id, request.user.id]);
      if (!rows.length) return null;
      const now = new Date().toISOString();
      const previous = garment(rows[0]);
      const facts = factsSchema.parse({ ...previous.facts, ...changes.data });
      const provenance = Object.fromEntries(Object.keys(facts).map((key) => [key, JSON.stringify(previous.facts[key]) === JSON.stringify(facts[key])
        ? previous.provenance[key] : { source: 'wearer-correction', modelVersion: null, confidence: 1, recordedAt: now }]));
      return (await run(`UPDATE garments SET facts = $1, provenance = $2, updated_at = $3 WHERE id = $4 AND user_id = $5 RETURNING ${garmentColumns}`,
        [JSON.stringify(facts), JSON.stringify(provenance), now, rows[0].id, request.user.id])).rows[0];
    });
    if (!updated) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    response.json(garment(updated));
  });
  router.delete('/:id', async (request, response) => {
    const result = await query('DELETE FROM garments WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id]);
    if (!result.rowCount) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    await reclaimDeletedData();
    response.json({ deleted: true });
  });
  router.post('/outfit', async (request, response) => {
    const context = contextSchema.safeParse(request.body);
    if (!context.success) return response.status(400).json({ error: 'Use an occasion, weather, and dress code to request an outfit.' });
    const excluded = (await query('SELECT garment_id FROM outfit_exclusions WHERE user_id = $1 AND context = $2', [request.user.id, contextKey(context.data)])).rows;
    response.json(decideOutfit(context.data, (await listRows(request.user.id)).map(garment), excluded.map((row) => row.garment_id)));
  });
  router.post('/correction', async (request, response) => {
    const parsed = exclusionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Choose an item and an outfit context to correct.' });
    const { context, garmentId, excluded } = parsed.data;
    if (!(await query('SELECT id FROM garments WHERE id = $1 AND user_id = $2', [garmentId, request.user.id])).rows.length) return response.status(404).json({ error: 'This garment is not in your wardrobe.' });
    if (excluded) await query('INSERT INTO outfit_exclusions (user_id, garment_id, context, recorded_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [request.user.id, garmentId, contextKey(context), new Date().toISOString()]);
    else await query('DELETE FROM outfit_exclusions WHERE user_id = $1 AND garment_id = $2 AND context = $3', [request.user.id, garmentId, contextKey(context)]);
    response.json({ saved: true });
  });
  router.get('/starter-plans', async (request, response) => response.json(await listStarterPlans(request.user.id)));
  router.get('/shopping-sources', (_request, response) => response.json(shoppingSources));
  router.post('/starter-plans', async (request, response) => {
    const parsed = starterSaveSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Check the occasion, budget, and outfit needs, then try again.' });
    const { needs, requestId, ...input } = parsed.data;
    const roles = buildStarterRoles(input, new Date().toISOString()).map((role) => ({ ...role, need: needs?.find((need) => need.role === role.role)?.need ?? role.need }));
    response.status(201).json(await insertStarterPlan(request.user.id, input, roles, 'active', query, requestId));
  });
  router.patch('/starter-plans/:id', async (request, response) => {
    const action = starterPlanActionSchema.safeParse(request.body);
    if (!action.success) return response.status(400).json({ error: 'That plan change is incomplete. Review it and try again.' });
    // The row lock makes concurrent changes to one plan apply one after another against the latest state.
    const { status, body } = await transaction(async (run) => {
      const { rows } = await run('SELECT * FROM starter_plans WHERE id = $1 AND user_id = $2 FOR UPDATE', [request.params.id, request.user.id]);
      if (!rows.length) return { status: 404, body: { error: 'This saved plan is no longer available.' } };
      const current = starterPlan(rows[0]);
      if (current.status !== 'active') return { status: 409, body: { error: 'Only an active plan can be changed.' } };
      if (action.data.action === 'reject') {
        return { status: 200, body: await updateStarterPlan(request.user.id, { ...current, status: 'rejected' }, run) };
      }
      if (action.data.action === 'replace-plan') {
        await updateStarterPlan(request.user.id, { ...current, status: 'replaced' }, run);
        return { status: 201, body: await insertStarterPlan(request.user.id, action.data.input, buildStarterRoles(action.data.input, new Date().toISOString()), 'active', run) };
      }
      if (action.data.action === 'confirm-owned') {
        const role = current.roles.find((item) => item.role === action.data.role);
        if (!role || role.state === 'confirmed-owned') return { status: 409, body: { error: 'That need has already been confirmed or is not in this plan.' } };
        const roles = confirmStarterRole(current.roles, action.data.role, current.input.budget, new Date().toISOString());
        return { status: 200, body: await updateStarterPlan(request.user.id, {
          ...current,
          input: { ...current.input, ownedRoles: roles.filter((item) => item.state === 'confirmed-owned').map((item) => item.role) },
          roles,
        }, run) };
      }
      const role = current.roles.find((item) => item.role === action.data.role);
      if (!role || role.state !== 'planned') return { status: 409, body: { error: 'Only a planned need can be replaced.' } };
      const roles = current.roles.map((item) => item.role === action.data.role ? { ...item, need: action.data.need } : item);
      return { status: 200, body: await updateStarterPlan(request.user.id, { ...current, roles }, run) };
    });
    response.status(status).json(body);
  });
  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Send a valid photo and garment details within the upload limit.' });
    next(error);
  });
  return router;
}
