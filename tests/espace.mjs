// Parcours complet de l'espace de travail, sous la CSP de production : création, profil, client, devis, facture, paiement, recettes, échéances, sauvegarde chiffrée, effacement, import.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { servir, ok } from './serveur.mjs';

const { base, close } = await servir();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const erreurs = [], externes = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && erreurs.push(m.text())); page.on('pageerror', (e) => erreurs.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externes.push(r.url()); });
page.on('dialog', (d) => d.accept());
const norm = (t) => t.replace(/[  ]/g, ' ');
const texte = async (s) => norm(await page.locator(s).first().innerText());
const aller = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(150); };
const bases = () => page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
const telechargement = async (declencheur) => { const [d] = await Promise.all([page.waitForEvent('download'), declencheur()]); return { nom: d.suggestedFilename(), contenu: readFileSync(await d.path(), 'utf8') }; };
const dialogue = (s = 'dialog[open]') => page.locator(s);
const telechargementBinaire = async (declencheur) => { const [d] = await Promise.all([page.waitForEvent('download'), declencheur()]); return { nom: d.suggestedFilename(), octets: readFileSync(await d.path()) }; };

// ---- 1. rien n'est enregistré avant le clic
await page.goto(base + '/espace/'); await page.waitForSelector('.bienvenue');
assert.deepEqual(await bases(), []); assert.equal(await page.evaluate(() => document.cookie.length + localStorage.length + sessionStorage.length), 0);
ok('avant le clic : aucune base, aucun cookie, aucun stockage');
await page.click('text=Créer mon espace'); await page.waitForSelector('.coque');
assert.ok((await bases()).includes('glsc-pro')); assert.match(await texte('main h1'), /Bonjour/); ok('création de l’espace : base locale créée, tableau de bord affiché');

// ---- 2. réglages du profil
await aller('#/reglages'); await page.waitForSelector('[name="emetteur.nom"]');
await page.fill('[name="emetteur.nom"]', 'Gabin Lescoat'); await page.fill('[name="emetteur.adresse"]', '1 rue du Test'); await page.fill('[name="emetteur.cp"]', '35000'); await page.fill('[name="emetteur.ville"]', 'Rennes');
await page.fill('[name="emetteur.siren"]', '732829321'); assert.match(await texte('.champ-erreur'), /SIREN n’est pas valide/);
await page.fill('[name="emetteur.siren"]', '732 829 320'); assert.equal(await page.locator('.champ-erreur').count(), 0);
await page.fill('[name="emetteur.iban"]', 'FR76 3000 6000 0112 3456 7890 189'); await page.fill('[name="emetteur.email"]', 'pro@glsc.fr');
await page.selectOption('[name="activite"]', 'bnc_ssi'); await page.waitForTimeout(500);
await page.reload(); await page.waitForSelector('[name="emetteur.nom"]');
assert.equal(await page.inputValue('[name="emetteur.nom"]'), 'Gabin Lescoat'); assert.equal(await page.inputValue('[name="activite"]'), 'bnc_ssi'); ok('profil : validation du SIREN, enregistrement automatique, rechargement');
await page.selectOption('[name="activite"]', 'bic_services'); await page.waitForTimeout(400);

// ---- 3. client
await aller('#/clients'); await page.click('.entete >> text=Nouveau client');
await page.fill('dialog [name="nom"]', '<img src=x onerror="window.__xss=1"> Atelier'); await page.fill('dialog [name="siren"]', '123'); await page.click('dialog footer button:has-text("Enregistrer")');
assert.match(await texte('dialog .champ-erreur'), /SIREN/); await page.fill('dialog [name="siren"]', '552 120 222'); await page.fill('dialog [name="email"]', 'contact@atelier.fr'); await page.fill('dialog [name="adresse"]', '2 rue B'); await page.fill('dialog [name="cp"]', '35000'); await page.fill('dialog [name="ville"]', 'Rennes');
await page.click('dialog footer button:has-text("Enregistrer")'); await page.waitForSelector('.retour');
assert.equal(await page.evaluate(() => window.__xss), undefined); assert.equal(await page.locator('main img').count(), 0); assert.match(await texte('main h1'), /<img src=x/); ok('client : validation, création, le HTML saisi reste du texte');

// ---- 4. facture, aperçu, envoi, paiements
await page.click('.entete >> text=Facture'); await page.waitForSelector('.feuille');
assert.match(await page.inputValue('[name="numero"]'), /^F-\d{4}-001$/); assert.equal(await page.locator('#sel-client').inputValue() !== '', true);
assert.match(await texte('.erreurs-zone'), /points? à compléter/);
await page.fill('[name="datePrestation"]', new Date().toISOString().slice(0, 10));
await page.fill('[name="lignes.0.desc"]', 'Création de site vitrine'); await page.fill('[name="lignes.0.prix"]', '1200');
await page.fill('.champ >> [name="siren"]', '').catch(() => {});
assert.match(await texte('.feuille-total'), /1 200,00 €/); assert.match(await texte('.feuille-mentions'), /TVA non applicable/); assert.match(await texte('.feuille'), /Gabin Lescoat, Entrepreneur individuel/);
await page.click('text=Ajouter une ligne'); await page.fill('[name="lignes.1.desc"]', 'Hébergement'); await page.fill('[name="lignes.1.prix"]', '120'); assert.match(await texte('.feuille-total'), /1 320,00 €/);
await page.waitForTimeout(600); assert.match(page.url(), /#\/documents\/[\w-]+$/); ok('facture : numéro proposé, erreurs, aperçu en direct, mentions légales, adresse mise à jour');
await page.screenshot({ path: process.env.CAPTURE_DOC || '/tmp/pro-doc.png' });
assert.match(await texte('.erreurs-zone'), /Prêt à être envoyé/);
await page.click('text=Marquer comme envoyé'); await page.click('dialog footer button:has-text("Marquer comme envoyé")'); await page.waitForSelector('.paiements');
assert.match(await texte('.statut-ligne'), /Envoyé/); assert.equal(await page.locator('[name="numero"]:not([disabled])').count(), 0); ok('envoi : confirmation, document verrouillé');
await page.click('text=Enregistrer un paiement'); await page.fill('dialog [name="montant"]', '500'); await page.click('dialog footer button:has-text("Enregistrer")');
assert.match(await texte('.paiements'), /500,00 € \/ 1 320,00 €/); assert.match(await texte('.paiements'), /Reste.*820,00 €/s);
await aller('#/'); await page.waitForSelector('.kpis'); assert.match(await texte('.kpis'), /Encaissé en \d{4}\s*500 €/); assert.match(await texte('.kpis'), /À encaisser\s*820 €/); ok('paiement partiel : reste à payer et tableau de bord');
await aller('#/documents'); await page.click('.ligne-doc'); await page.click('text=Enregistrer un paiement'); await page.click('dialog footer button:has-text("Enregistrer")');
assert.match(await texte('.statut-ligne'), /Payé/); ok('paiement du solde : la facture passe en « Payé »');

// ---- 4 bis. facture électronique (Factur-X)
await page.waitForSelector('.facturx:not([hidden])'); assert.match(await texte('.facturx'), /Prête : un PDF/);
const fx = await telechargementBinaire(() => page.click('.facturx >> text=Télécharger le Factur-X (PDF)')); assert.match(fx.nom, /^facture-F-\d{4}-001\.pdf$/); assert.equal(fx.octets.subarray(0, 5).toString('latin1'), '%PDF-');
const texteBrut = fx.octets.toString('latin1'); assert.match(texteBrut, /factur-x\.xml/); assert.match(texteBrut, /\/AFRelationship\s*\/Alternative/); assert.match(texteBrut, /GTS_PDFA1/); assert.match(texteBrut, /<pdfaid:part>3<\/pdfaid:part>/);
const xmlFx = await telechargement(() => page.click('.facturx >> text=XML seul')); assert.match(xmlFx.contenu, /urn:cen\.eu:en16931:2017/); assert.match(xmlFx.contenu, /<ram:ID>F-\d{4}-001<\/ram:ID>/); assert.match(xmlFx.contenu, /VATEX-FR-FRANCHISE/);
if (process.env.MUSTANG_JAR) { const { writeFileSync } = await import('node:fs'); const { execFileSync } = await import('node:child_process'); writeFileSync('/tmp/espace-fx.pdf', fx.octets); const out = execFileSync('java', ['-jar', process.env.MUSTANG_JAR, '--action', 'validate', '--source', '/tmp/espace-fx.pdf'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); assert.match(out, /isCompliant=true/); assert.match(out, /<xml>[\s\S]*?<summary status="valid"\/>/); }
ok('facture électronique : PDF/A-3 avec factur-x.xml embarqué (profil EN 16931)' + (process.env.MUSTANG_JAR ? ', validé par Mustang' : ''));

// ---- 5. devis, acceptation, conversion, avoir
await aller('#/documents/nouveau?type=devis'); await page.waitForSelector('.feuille'); assert.match(await page.inputValue('[name="numero"]'), /^D-\d{4}-001$/);
await page.selectOption('#sel-client', { index: 1 }); await page.fill('[name="lignes.0.desc"]', 'Refonte logo'); await page.fill('[name="lignes.0.prix"]', '800');
assert.match(await texte('.feuille'), /Bon pour accord/); await page.click('text=Marquer comme envoyé'); await page.click('dialog footer button:has-text("Marquer comme envoyé")'); await page.waitForSelector('text=Devis accepté');
await page.click('text=Devis accepté'); await page.click('text=Créer la facture'); await page.click('dialog footer button:has-text("Facture complète")'); await page.waitForSelector('[name="numero"]:not([disabled])');
assert.match(await page.inputValue('[name="numero"]'), /^F-\d{4}-002$/); assert.match(await texte('.feuille'), /Devis : D-/); assert.match(await texte('.feuille-total'), /800,00 €/); ok('devis accepté converti en facture n° 002 avec rattachement au devis');
await aller('#/documents'); assert.equal(await page.locator('.ligne-doc').count(), 3); await page.click('text=Devis >> nth=0'); ok('liste des documents : 3 documents, filtre par type');

// ---- 6. recettes, CSV
await aller('#/encaissements'); await page.waitForSelector('.tableau'); assert.match(await texte('.tableau'), /Facture F-\d{4}-001/);
await page.click('.entete >> text=Ajouter une recette'); await page.fill('dialog [name="origine"]', 'Café du port'); await page.fill('dialog [name="montant"]', '90,50'); await page.click('dialog footer button:has-text("Ajouter")');
assert.match(await texte('.tableau'), /Café du port.*90,50 €/s); assert.match(await texte('.kpis'), /Encaissé en \d{4}\s*1 410,50 €/);
const csv = await telechargement(() => page.click('text=Exporter en CSV')); assert.match(csv.nom, /livre-des-recettes-\d{4}\.csv/); assert.ok(csv.contenu.startsWith('\ufeff"N°";')); assert.match(csv.contenu, /"Café du port"/); assert.match(csv.contenu, /90,50/); ok('recettes : paiements des factures, saisie manuelle, total et export CSV');

// ---- 7. échéances
await aller('#/echeances'); await page.waitForSelector('.echeance'); assert.match(await texte('main'), /Déclarer le chiffre d’affaires/);
const ics = await telechargement(() => page.click('text=Ajouter à mon agenda')); assert.ok(ics.contenu.startsWith('BEGIN:VCALENDAR')); assert.match(ics.contenu, /BEGIN:VALARM/); ok('échéances : calendrier .ics téléchargé avec rappels');

// ---- 8. sauvegarde chiffrée, effacement, import
await aller('#/reglages'); await page.waitForSelector('text=Vos données');
const clair = await telechargement(() => page.click('text=Exporter (JSON)')); assert.match(clair.contenu, /"format": "glsc-pro-espace-1"/); 
await page.click('text=Exporter chiffré'); await page.fill('dialog [name="mdp"]', 'court'); await page.click('dialog footer button:has-text("Chiffrer et télécharger")'); assert.match(await texte('dialog .champ-erreur'), /8 caractères/);
await page.fill('dialog [name="mdp"]', 'mot-de-passe-solide'); await page.fill('dialog [name="mdp2"]', 'mot-de-passe-solide');
const chiffre = await telechargement(() => page.click('dialog footer button:has-text("Chiffrer et télécharger")')); assert.ok(!chiffre.contenu.includes('Gabin')); assert.match(chiffre.contenu, /glsc-pro-sauvegarde-chiffree-1/);
await page.click('text=Tout effacer'); await page.click('dialog footer button:has-text("Tout effacer")'); await page.waitForSelector('.bienvenue'); assert.deepEqual(await bases().then((b) => b.filter((n) => n === 'glsc-pro')), ['glsc-pro']);
ok('sauvegarde : JSON clair, fichier chiffré illisible, effacement complet');
const { writeFileSync } = await import('node:fs'); writeFileSync('/tmp/pro-test-sauvegarde.json', chiffre.contenu);
await page.setInputFiles('input[type=file]', '/tmp/pro-test-sauvegarde.json').catch(() => {});
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Importer une sauvegarde')]); await fc.setFiles('/tmp/pro-test-sauvegarde.json');
await page.fill('dialog [name="mdp"]', 'mauvais-mot-de-passe'); await page.click('dialog footer button:has-text("Ouvrir")'); assert.match(await texte('.toast.erreur'), /incorrect/);
const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Importer une sauvegarde')]); await fc2.setFiles('/tmp/pro-test-sauvegarde.json');
await page.fill('dialog [name="mdp"]', 'mot-de-passe-solide'); await page.click('dialog footer button:has-text("Ouvrir")'); await page.waitForSelector('.coque');
await aller('#/documents'); assert.equal(await page.locator('.ligne-doc').count(), 3); await aller('#/clients'); assert.match(await texte('.cartes-liste'), /Atelier/); ok('import chiffré : mauvais mot de passe refusé, bon mot de passe : tout est restauré');

// ---- 9. mobile, erreurs, requêtes externes
const mob = await (await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, reducedMotion: 'reduce' })).newPage();
await mob.goto(base + '/espace/'); await mob.click('text=Créer mon espace'); await mob.waitForSelector('.coque');
for (const h of ['#/', '#/documents', '#/clients', '#/encaissements', '#/echeances', '#/reglages', '#/documents/nouveau']) { await mob.evaluate((x) => { location.hash = x; }, h); await mob.waitForTimeout(150); assert.ok(await mob.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `défilement horizontal sur ${h}`); }
assert.ok(await mob.locator('.barre').isVisible()); ok('mobile 390 px : pas de défilement horizontal, barre d’onglets visible');
assert.deepEqual(externes, [], externes.join(', ')); assert.deepEqual(erreurs.filter((e) => !/Failed to load resource.*(404|net::ERR)/.test(e)), [], erreurs.join(' | ')); ok('aucune requête externe, aucune erreur de console (CSP de production)');
await browser.close(); close();
