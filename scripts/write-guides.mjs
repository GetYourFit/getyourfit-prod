import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { guides, guideOrigin, guidePath } from '../shared/guides.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
const styles = new Set();
function collectStyles(key) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing build manifest entry: ${key}`);
  for (const file of chunk.css ?? []) styles.add(file);
  for (const dependency of chunk.imports ?? []) collectStyles(dependency);
}
collectStyles('index.html');
collectStyles('src/GuidePage.tsx');

const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: GuidePage } = await vite.ssrLoadModule('/src/GuidePage.tsx');
  const routes = [
    { route: '/guides/', guide: null, title: 'Outfit and capsule wardrobe guides', description: 'Practical guides to choosing complete outfits and building a small wardrobe from clothes you own. India-first examples, adaptable to your day and climate.' },
    ...guides.map((guide) => ({ route: guidePath(guide), guide, title: guide.title, description: guide.description })),
    { route: '/guide-not-found.html', guide: undefined, title: 'Guide not found', description: 'Find an outfit guide or open the GetYourFit planner.' },
  ];
  for (const { route, guide, title, description } of routes) {
    const canonical = `${guideOrigin}${route}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f8f5"><title>${escape(title)} - GetYourFit</title><meta name="description" content="${escape(description)}">${guide === undefined ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}">`}<meta property="og:type" content="${guide ? 'article' : 'website'}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:site_name" content="GetYourFit"><link rel="icon" href="/favicon.svg"><link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>${[...styles].map((file) => `<link rel="stylesheet" href="/${escape(file)}">`).join('')}</head><body>${renderToStaticMarkup(createElement(GuidePage, { guide }))}</body></html>`;
    const file = route.endsWith('/') ? path.join(dist, route, 'index.html') : path.join(dist, route);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  const urls = ['/', '/guides/', ...guides.map(guidePath)];
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((route) => `<url><loc>${guideOrigin}${route}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /wardrobe\nDisallow: /sign-in\nDisallow: /sign-up\nSitemap: ${guideOrigin}/sitemap.xml\n`);
} finally {
  await vite.close();
}
