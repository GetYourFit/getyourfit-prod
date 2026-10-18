import assert from 'node:assert/strict';
import test from 'node:test';
import { shoppingSourceListSchema, suggestShopping } from '../shared/shopping.ts';
import { buildStarterRoles } from '../shared/starter-plan.ts';
import records from '../server/shopping-sources.json' with { type: 'json' };

const [source] = shoppingSourceListSchema.parse(records);
const now = new Date().toISOString();
const input = { occasion: 'College days', outfitType: 'separates', budget: 3000, currency: 'INR', weather: 'warm', dressCode: 'casual', mustHave: '', ownedRoles: [] };
const plan = (changes = {}) => { const value = { ...input, ...changes }; return [value, buildStarterRoles(value, now)]; };

test('the shipped source grants no product facts, prices, or images and links only through the approved channel', () => {
  assert.equal(shoppingSourceListSchema.parse(records).length, 1);
  assert.deepEqual(source.rights, { productFacts: false, prices: false, images: false });
  assert.equal(source.region.country, 'IN');
  assert.equal(source.currency, 'INR');
  for (const destination of source.destinations) {
    const tracked = new URL(destination.affiliateUrl);
    assert.equal(tracked.hostname, 'linksredirect.com');
    assert.deepEqual([...tracked.searchParams.keys()], ['cid', 'source', 'url']);
    assert.equal(tracked.searchParams.get('cid'), String(source.affiliate.channelId));
    assert.equal(tracked.searchParams.get('url'), destination.url);
    assert.equal(new URL(destination.url).hostname, 'www.decathlon.in');
    assert(!destination.dressCodes.includes('formal'), 'A sportswear section must not claim a formal dress code');
  }
});

test('the source schema rejects private tracking fields, other hosts, and unapproved channels', () => {
  const changed = (change) => { const copy = structuredClone(records); change(copy[0]); return shoppingSourceListSchema.safeParse(copy).success; };
  assert.equal(changed((item) => { item.destinations[0].affiliateUrl += '&subid=wearer%40example.test'; }), false);
  assert.equal(changed((item) => { item.destinations[0].url = 'https://evil.example/c/men-tshirts-17107'; }), false);
  assert.equal(changed((item) => { item.destinations[0].url = 'http://www.decathlon.in/c/men-tshirts-17107'; }), false);
  assert.equal(changed((item) => { item.affiliate.channelId = 274785; }), false);
  assert.equal(changed((item) => { item.destinations[0].affiliateUrl = item.destinations[1].affiliateUrl; }), false);
  assert.equal(changed((item) => { item.rights.images = 'yes'; }), false);
});

test('asks for a retailer department before naming any section', () => {
  assert.deepEqual(suggestShopping(source, ...plan(), null), { kind: 'department-needed' });
});

test('links every planned role of a casual outfit to a section in the chosen department with its planning share', () => {
  const [value, roles] = plan();
  const result = suggestShopping(source, value, roles, 'women');
  assert.equal(result.kind, 'picks');
  assert.equal(result.complete, true);
  assert.deepEqual(result.picks.map((pick) => [pick.role, pick.state, pick.destination.department, pick.allocation]), [
    ['top', 'linked', 'women', 1000], ['bottom', 'linked', 'women', 1000], ['footwear', 'linked', 'women', 1000],
  ]);
});

test('uses dress-code specific sections where the source has them', () => {
  const [value, roles] = plan({ dressCode: 'smart-casual' });
  const top = suggestShopping(source, value, roles, 'men').picks.find((pick) => pick.role === 'top');
  assert.equal(top.destination.label, 'Men’s shirts');
  const [casual, casualRoles] = plan();
  assert.equal(suggestShopping(source, casual, casualRoles, 'men').picks.find((pick) => pick.role === 'top').destination.label, 'Men’s T-shirts');
});

test('never links a role the wearer already owns and keeps its budget at zero', () => {
  const [value, roles] = plan({ ownedRoles: ['footwear'] });
  const result = suggestShopping(source, value, roles, 'men');
  assert.deepEqual(result.picks.find((pick) => pick.role === 'footwear'), { role: 'footwear', state: 'owned' });
  assert.equal(result.picks.filter((pick) => pick.state === 'linked').reduce((sum, pick) => sum + pick.allocation, 0), 3000);
});

test('abstains for other currencies, zero budgets, fully owned plans, and formal dress codes', () => {
  assert.deepEqual(suggestShopping(source, ...plan({ currency: 'USD' }), 'men'), { kind: 'unavailable', reason: 'currency' });
  assert.deepEqual(suggestShopping(source, ...plan({ budget: 0 }), 'men'), { kind: 'unavailable', reason: 'zero-budget' });
  assert.deepEqual(suggestShopping(source, ...plan({ ownedRoles: ['top', 'bottom', 'footwear'] }), 'men'), { kind: 'unavailable', reason: 'all-owned' });
  assert.deepEqual(suggestShopping(source, ...plan({ dressCode: 'formal' }), null), { kind: 'unavailable', reason: 'no-section' });
});

test('reports an incomplete outfit instead of inventing a one-piece section', () => {
  const [value, roles] = plan({ outfitType: 'one-piece' });
  const result = suggestShopping(source, value, roles, 'women');
  assert.equal(result.complete, false);
  assert.deepEqual(result.picks.map((pick) => [pick.role, pick.state]), [['one-piece', 'unmatched'], ['footwear', 'linked']]);
  assert.deepEqual(suggestShopping(source, ...plan({ outfitType: 'one-piece', ownedRoles: ['footwear'] }), 'women'), { kind: 'unavailable', reason: 'no-section' });
});
