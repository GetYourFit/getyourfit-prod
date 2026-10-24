import assert from 'node:assert/strict';
import test from 'node:test';
import { guides, guideOrigin, guidePath } from '../shared/guides.ts';
import { start } from './support/server.mjs';

test('public guide HTTP documents contain readable content and canonical metadata without scripts', async (t) => {
  const { origin } = await start(t);
  for (const guide of guides) {
    const response = await fetch(`${origin}${guidePath(guide)}?q=private-test-marker`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    assert.ok(html.includes(`<title>${guide.title} - GetYourFit</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${guideOrigin}${guidePath(guide)}"`));
    assert.ok(html.includes(`<meta name="description" content="${guide.description}"`));
    assert.match(html, /<article[ >]/);
    assert.match(html, /href="\/sign-up\?next=%2Fplan"/);
    assert.doesNotMatch(html, /href="\/plan"/);
    assert.match(html, guide.slug.startsWith('capsule') ? /href="\/sign-up\?next=%2Fwardrobe"/ : /href="\/sign-in\?next=%2Fplan"/);
    assert.doesNotMatch(html, /private-test-marker|<script>|<img[^>]+api\/funnel/);
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
    assert.equal(scripts.length, 1);
    const source = scripts[0].match(/^<script type="module" src="([^"]+)"><\/script>$/)?.[1];
    assert.ok(source);
    const script = await fetch(`${origin}${source}`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    const head = await fetch(`${origin}${guidePath(guide)}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
});

test('guide redirects, missing pages, discovery files and private API boundaries remain factual', async (t) => {
  const { origin } = await start(t);
  const redirect = await fetch(`${origin}/guides`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/guides/');
  const missing = await fetch(`${origin}/guides/no-such-guide/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
  assert.match(await missing.text(), /This guide could not be found/);
  const sitemap = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  for (const guide of guides) assert.ok(xml.includes(`<loc>${guideOrigin}${guidePath(guide)}</loc>`));
  assert.doesNotMatch(xml, /\/account|\/sign-up|\/wardrobe|\/api\//);
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/app.getyourfit.co\/sitemap.xml/);
  for (const route of ['/api/wardrobe', '/api/data/export']) {
    assert.equal((await fetch(`${origin}${route}`)).status, 401);
  }
});
