import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { composeBoard, garments, layoutFor } from '../shared/outfit-board.ts';
import { buildStarterRoles } from '../shared/starter-plan.ts';
import { funnelEvents } from '../shared/funnel.ts';

const now = new Date().toISOString();
const input = { occasion: 'Office day', outfitType: 'separates', budget: 6000, currency: 'INR', weather: 'mild', dressCode: 'smart-casual', mustHave: '', ownedRoles: [] };
const board = (changes = {}) => { const value = { ...input, ...changes }; return composeBoard(value, buildStarterRoles(value, now)); };
const provenance = JSON.parse(readFileSync(new URL('../public/example/provenance.json', import.meta.url), 'utf8'));

test('every board garment is a real photograph with a recorded redistributable licence', () => {
  for (const garment of garments) {
    const record = provenance.assets.find((asset) => asset.name === garment.file);
    assert(record, `${garment.id} has a provenance record`);
    assert(['CC0-1.0', 'CC-BY-2.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0', 'Pexels'].includes(record.license));
    assert.equal(record.record, garment.source);
    assert.equal(record.author, garment.author);
    assert.equal(record.license_record, garment.licenseUrl);
    assert.equal(record.width, garment.width);
    assert.equal(record.height, garment.height);
    const image = readFileSync(new URL(`../public/example/${garment.file}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(image).digest('hex'), record.output_sha256);
    for (const file of [`${garment.file}.webp`, `${garment.file}-360.webp`, `${garment.file}-600.webp`]) assert(existsSync(new URL(`../public/example/${file}`, import.meta.url)), file);
  }
});

test('a separates plan composes a complete look with a photograph for each piece and shows reasons', () => {
  const result = board();
  assert.equal(result.looks.length, 4);
  for (const look of result.looks) assert.deepEqual(look.pieces.map((piece) => piece.role), ['top', 'bottom', 'footwear']);
  assert(result.looks.every((look) => look.pieces.every((piece) => !piece.owned && piece.garment.role === piece.role)));
  assert(result.looks.every((look) => !/\b(?:Top|Bottom|Footwear|One-piece garment) [AB]\b/.test(look.why)));
  assert(result.reasons.length >= 3);
  assert(result.reasons.some((reason) => reason.includes('₹6,000')));
});

test('climate changes which photographs lead, and options differ across looks', () => {
  assert.equal(board({ weather: 'cold', dressCode: 'casual' }).looks[0].pieces[0].garment.id, 'sweater');
  assert.equal(board({ weather: 'warm' }).looks[0].pieces[0].garment.id, 'shirt');
  const ids = new Set(board().looks.map((look) => look.pieces.map((piece) => piece.garment.id).join()));
  assert.equal(ids.size, 4);
});

test('a role the wearer already owns becomes a category tile, not a photograph', () => {
  const result = board({ ownedRoles: ['footwear'] });
  assert(result.looks.every((look) => look.pieces[2].owned === true && !('garment' in look.pieces[2])));
  assert(layoutFor(result.looks[0].pieces).length === 3);
});

test('a one-piece plan uses the one-piece layout and zero budget suggests reuse', () => {
  const result = board({ outfitType: 'one-piece', budget: 0 });
  assert.deepEqual(result.looks[0].pieces.map((piece) => piece.role), ['one-piece', 'footwear']);
  assert.equal(result.looks[0].pieces[1].garment.id, 'pumps');
  assert(result.reasons.some((reason) => reason.includes('reuse or borrow')));
});

test('funnel steps record no identifying fields', () => {
  assert.deepEqual([...funnelEvents], ['plan_opened', 'plan_submitted', 'outfit_shown', 'save_prompt_shown', 'save_prompt_accepted', 'plan_saved_after_visit']);
});
