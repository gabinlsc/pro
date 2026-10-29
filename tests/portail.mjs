// Contrôle du portail : liens, CSP stricte (aucun script ni style en ligne), ressources locales, raccourcis clavier, mobile.
// Le navigateur est facultatif en local : CHROMIUM_PATH ou Playwright installé.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const racine = resolve(new URL('..', import.meta.url).pathname), pub = join(racine, 'public');
const csp = readFileSync(join(racine, 'deploy/pro-security.conf'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain' };
const ok = (m) => console.log('✓ ' + m);

for (const f of ['index.html', '404.html']) {
  const h = readFileSync(join(pub, f), 'utf8');
  assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)/i, `${f} : script en ligne`);
  assert.doesNotMatch(h, /<style/i, `${f} : style en ligne`); assert.doesNotMatch(h, /\sstyle=/i, `${f} : attribut style`);
  assert.doesNotMatch(h, /\son\w+=/i, `${f} : gestionnaire d'événement en ligne`);
  assert.match(h, /<meta name="robots" content="noindex, nofollow">/); assert.equal((h.match(/<h1/g) || []).length, 1);
  for (const [, u] of h.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) assert.ok(existsSync(join(pub, u)), `${f} : ${u} introuvable`);
}
ok('pages : pas de code en ligne, liens locaux valides, noindex, un seul h1');
const index = readFileSync(join(pub, 'index.html'), 'utf8');
for (const u of ['https://gst.glsc.fr', 'https://admin.glsc.fr', 'https://studio.glsc.fr', 'https://compta.glsc.fr']) assert.ok(index.includes(`href="${u}"`), u);
const css = readFileSync(join(pub, 'assets/pro.css'), 'utf8'); assert.doesNotMatch(css, /https?:\/\//); assert.doesNotMatch(css, /@import/); assert.match(css, /#2447d6/i); assert.match(css, /Inter Display/);
ok('quatre portes : StudioGLSC, admin, studio, compta ; CSS aux couleurs et polices du kit de marque, sans ressource externe');

const srv = createServer((q, r) => { const p = join(pub, decodeURIComponent(new URL(q.url, 'http://x').pathname)); const f = existsSync(p) && !p.endsWith('/') ? p : join(pub, 'index.html'); r.setHeader('content-type', types[extname(f)] ?? 'application/octet-stream'); r.setHeader('content-security-policy', csp); r.end(readFileSync(f)); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res)); const base = `http://127.0.0.1:${srv.address().port}`;
let chromium; try { ({ chromium } = await import('playwright')); } catch { console.log('Playwright absent : contrôle navigateur ignoré'); srv.close(); process.exit(0); }
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); const erreurs = [], ext = [];
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text())); page.on('pageerror', (e) => erreurs.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith(base)) ext.push(r.url()); });
await page.route('https://**', (r) => r.abort());
await page.goto(base + '/'); await page.waitForSelector('.tile');
assert.equal(await page.locator('.tile').count(), 4);
assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length), 0);
for (const [touche, url] of [['e', base + '/espace/'], ['g', 'https://gst.glsc.fr'], ['a', 'https://admin.glsc.fr'], ['s', 'https://studio.glsc.fr'], ['c', 'https://compta.glsc.fr']]) {
  const p2 = await page.context().newPage(); await p2.route('https://**', (r) => r.abort()); await p2.route('**/espace/**', (r) => r.abort()); await p2.goto(base + '/'); await p2.waitForSelector('.tile');
  const nav = p2.waitForRequest((r) => r.url().startsWith(url), { timeout: 3000 }); await p2.keyboard.press(touche); await nav; await p2.close();
}
ok('raccourcis E, G, A, S, C : ouvrent bien chaque espace');
const m = await (await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true })).newPage(); await m.goto(base + '/');
assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); ok('mobile 360 px : pas de défilement horizontal');
assert.deepEqual(erreurs.filter((e) => !/gst\.glsc|admin\.glsc|studio\.glsc|compta\.glsc|ERR_FAILED|Failed to load/.test(e)), []);
assert.deepEqual(ext.filter((u) => !/glsc\.fr/.test(u)), []); ok('aucune erreur de console ni requête tierce');
await page.screenshot({ path: process.env.CAPTURE || '/tmp/pro-bureau.png' }); await m.screenshot({ path: '/tmp/pro-mobile.png' });
await b.close(); srv.close();
