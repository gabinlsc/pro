// Accessibilité : axe-core sur chaque vue de l'espace (avec des données de démonstration), en clair et en sombre. Échec s'il reste une violation « serious » ou « critical ».
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { servir, ok } from './serveur.mjs';
import { sauvegardeDemo } from './graine.mjs';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const { base, close } = await servir();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const auj = new Date().toISOString().slice(0, 10), fichier = '/tmp/pro-demo.json'; writeFileSync(fichier, sauvegardeDemo(auj));
const VUES = ['#/', '#/documents', '#/clients', '#/clients/c1', '#/documents/d1', '#/documents/d3', '#/documents/d4', '#/documents/d5', '#/documents/nouveau?type=facture', '#/encaissements', '#/echeances', '#/reglages'];
const problemes = []; let nb = 0;
for (const theme of ['light', 'dark']) {
  const page = await (await browser.newContext({ colorScheme: theme, reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(base + '/espace/'); await page.waitForSelector('.bienvenue');
  await page.evaluate(axeSource);
  const bienv = await page.evaluate(() => window.axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })); nb++;
  for (const v of bienv.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) problemes.push(`bienvenue (${theme}) ${v.id} : ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' ; ')}`);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Importer une sauvegarde')]); await fc.setFiles(fichier); await page.waitForSelector('.coque'); await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 }); await page.mouse.move(2, 2);
  for (const vue of VUES) {
    await page.evaluate((h) => { location.hash = h; }, vue); await page.waitForTimeout(250);
    const r = await page.evaluate(() => window.axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })); nb++;
    for (const v of r.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) problemes.push(`${vue} (${theme}) ${v.id} : ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' ; ')}`);
    if (process.env.CAPTURES && theme === 'light') await page.screenshot({ path: `${process.env.CAPTURES}/${vue.replace(/\W+/g, '_')}.png`, fullPage: true });
  }
  if (process.env.CAPTURES && theme === 'dark') { await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.CAPTURES}/sombre.png` }); }
}
await browser.close(); close();
assert.deepEqual(problemes, []);
ok(`accessibilité : ${nb} vues vérifiées avec axe-core, aucune violation grave`);
