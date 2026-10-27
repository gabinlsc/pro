// Copie les briques de calcul de Compta by glsc (modules purs, sans DOM) et ses données réglementaires vérifiées.
// Usage : node tools/sync-compta.mjs [chemin-du-dépôt-compta]   (défaut : ../compta)
// Les fichiers copiés ne sont jamais modifiés ici : toute correction se fait dans le dépôt compta, puis on relance cette commande.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const compta = resolve(process.argv[2] ?? '../compta');
const racine = resolve(new URL('..', import.meta.url).pathname);
const LIBS = ['money', 'valid', 'dates', 'facture', 'etat', 'simulateur', 'echeances', 'ics', 'livre'];
const lib = join(racine, 'public/espace/js/lib');
mkdirSync(lib, { recursive: true });
for (const f of LIBS) writeFileSync(join(lib, `${f}.js`), readFileSync(join(compta, 'src/assets/js/lib', `${f}.js`), 'utf8'));
const regles = JSON.parse(readFileSync(join(compta, 'data/regles.json'), 'utf8'));
const entrees = regles.entrees.map(({ id, unite, valeur, statut, verifie_le: verifieLe, valable_au: valableAu }) => ({ id, unite, valeur, statut, ...(verifieLe ? { verifie_le: verifieLe } : {}), ...(valableAu ? { valable_au: valableAu } : {}) }));
let commit = 'inconnu';
try { commit = execFileSync('git', ['-C', compta, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* dépôt sans git */ }
const maj = entrees.map((e) => e.verifie_le).filter(Boolean).sort().at(-1) ?? null;
mkdirSync(join(racine, 'public/espace/data'), { recursive: true });
writeFileSync(join(racine, 'public/espace/data/regles.json'), JSON.stringify({ source: `compta@${commit}`, derniereVerification: maj, entrees }) + '\n');
console.log(`${LIBS.length} modules et ${entrees.length} données copiés depuis compta@${commit} (dernière vérification : ${maj}).`);
