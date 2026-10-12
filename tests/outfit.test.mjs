import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { contextKey, decideOutfit, garmentSchema, decisionSchema } from '../shared/wardrobe.ts';

const context = { occasion: 'Lunch', weather: 'mild', dressCode: 'casual' };
const now = new Date().toISOString();
function item(category, changes = {}) {
  const id = randomUUID();
  const facts = { name: category, category, color: 'blue', size: 'M', owned: true, available: true, fit: 'fits', weather: ['mild'], dressCode: ['casual'], ...changes };
  return garmentSchema.parse({ id, facts, provenance: Object.fromEntries(Object.keys(facts).map((key) => [key, { source: 'wearer-confirmed', modelVersion: null, confidence: 1, recordedAt: now }])),
    interpretation: { kind: 'unavailable', reason: 'unsupported-device' }, photoConsent: { scope: 'local-processing-and-storage', recordedAt: now }, photoUrl: `/api/wardrobe/${id}/photo`, createdAt: now, updatedAt: now });
}

test('returns complete owned top, bottom, footwear and factual explanation', () => {
  const result = decisionSchema.parse(decideOutfit(context, [item('top'), item('bottom'), item('footwear')], []));
  assert.equal(result.kind, 'complete');
  assert.equal(result.items.length, 3);
  assert.match(result.explanation, /nothing to buy/);
});
test('supports one-piece and footwear without fabricating missing garments', () => {
  const result = decideOutfit(context, [item('one-piece'), item('footwear')], []);
  assert.equal(result.kind, 'complete'); assert.equal(result.items.length, 2);
  const bad = decideOutfit(context, [item('top'), item('bottom')], []);
  assert.equal(bad.kind, 'incomplete'); assert.equal('items' in bad, false);
});
test('one clarifying question, first context then fit, without a partial recommendation', () => {
  const garments = [item('top', { fit: 'unknown' }), item('bottom'), item('footwear')];
  assert.equal(decideOutfit({ ...context, occasion: '', weather: 'unknown' }, garments, []).field, 'occasion');
  assert.equal(decideOutfit({ ...context, weather: 'unknown', dressCode: 'unknown' }, garments, []).field, 'weather');
  assert.equal(decideOutfit({ ...context, dressCode: 'unknown' }, garments, []).field, 'dressCode');
  const fit = decideOutfit(context, garments, []);
  assert.equal(fit.kind, 'fit-question'); assert.equal(fit.garmentId, garments[0].id); assert.equal('items' in fit, false);
});
test('availability, fit, weather, dress code and wearer rejection each prevent completeness', () => {
  for (const changes of [{ available: false }, { fit: 'does-not-fit' }, { weather: ['cold'] }, { dressCode: ['formal'] }]) {
    assert.equal(decideOutfit(context, [item('top', changes), item('bottom'), item('footwear')], []).kind, 'incomplete');
  }
  const clothes = [item('top'), item('bottom'), item('footwear')];
  assert.equal(decideOutfit(context, clothes, [clothes[2].id]).kind, 'incomplete');
  assert.equal(contextKey({ ...context, occasion: ' LUNCH ' }), contextKey(context));
  assert.notEqual(contextKey({ ...context, weather: 'cold' }), contextKey(context));
});
