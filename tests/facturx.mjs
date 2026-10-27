// Validation externe des factures électroniques : chaque exemple est converti en PDF Factur-X, puis contrôlé par Mustang (Mustang-CLI) :
// PDF/A-3b (veraPDF), XML du profil EN 16931 (schématrons européens) et règles françaises du flux 2 (BR-FR). Les notices propres à l'Allemagne (XRechnung, BR-DE) ne sont pas des erreurs.
// Variables : MUSTANG_JAR = chemin du jar (obligatoire en CI : définir CI=1) ; la validation est ignorée en local si le jar est absent.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EXEMPLES, analyse, racine, regles } from './unit/exemples-facturx.mjs';
import { construireXml } from '../public/espace/js/facturx/cii.js';
import { exporterFacturX } from '../public/espace/js/facturx/export.js';
import * as lib from '../public/espace/js/vendor/pdf-lib.js';

const jar = process.env.MUSTANG_JAR;
if (!jar || !existsSync(jar)) { if (process.env.CI) { console.error('✗ MUSTANG_JAR introuvable en CI'); process.exit(1); } console.log('Validation Mustang ignorée : définissez MUSTANG_JAR=/chemin/Mustang-CLI-2.26.0.jar'); process.exit(0); }
const dossier = '/tmp/facturx-tests'; mkdirSync(dossier, { recursive: true });
const ressources = { lib, polices: { regulier: readFileSync(racine + 'polices/Inter-Regular.ttf'), semi: readFileSync(racine + 'polices/Inter-SemiBold.ttf'), gras: readFileSync(racine + 'polices/Inter-Bold.ttf') }, icc: readFileSync(racine + 'js/facturx/srgb.icc') };
const valider = (fichier) => {
  const sortie = execFileSync('java', ['-jar', jar, '--action', 'validate', '--source', fichier], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const rapport = sortie.slice(sortie.indexOf('<validation'));
  return { rapport, pdf: /isCompliant=true/.test(rapport), xml: /<xml>[\s\S]*?<summary status="valid"\/>[\s\S]*?<\/xml>/.test(rapport), global: /<\/xml>\s*<messages[\s\S]*?<summary status="valid"\/>\s*<\/validation>/.test(rapport) || /<summary status="valid"\/>\s*<\/validation>\s*$/.test(rapport.trim()) };
};
let n = 0;
for (const [nom, d] of Object.entries(EXEMPLES)) {
  const a = analyse(d), f = await exporterFacturX({ doc: d, a, ressourcesFournies: ressources, maintenant: new Date('2026-10-27T10:00:00Z') });
  const pdf = `${dossier}/${nom}.pdf`, xml = `${dossier}/${nom}.xml`; writeFileSync(pdf, f.octets); writeFileSync(xml, construireXml(d, a).xml);
  const r = valider(pdf); assert.ok(r.pdf, `${nom} : PDF/A-3b non conforme\n${r.rapport.slice(0, 1500)}`); assert.ok(r.xml, `${nom} : XML embarqué invalide\n${r.rapport.slice(0, 2500)}`); assert.ok(r.global, `${nom} : validation globale en échec\n${r.rapport.slice(-800)}`);
  const rx = valider(xml); assert.ok(rx.xml, `${nom} : XML seul invalide\n${rx.rapport.slice(0, 2500)}`);
  n++; console.log(`✓ ${nom} : PDF/A-3b conforme, XML EN 16931 et règles françaises valides`);
}
console.log(`✓ ${n} factures électroniques validées par Mustang`);
void regles;
