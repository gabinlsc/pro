// Regroupe pdf-lib et fontkit (licence MIT) en un seul module ES chargé à la demande par l'export Factur-X : public/espace/js/vendor/pdf-lib.js
// Usage : npm run vendor. Le fichier produit est versionné pour que le site reste statique, sans étape de construction.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(new URL('..', import.meta.url).pathname), sortie = join(racine, 'public/espace/js/vendor');
mkdirSync(sortie, { recursive: true });
const entree = "export { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFStream, StandardFonts, rgb, AFRelationship, degrees } from 'pdf-lib';\nimport fontkit from '@pdf-lib/fontkit';\nexport { fontkit };\n";
await build({ stdin: { contents: entree, resolveDir: racine, sourcefile: 'entree.js' }, bundle: true, format: 'esm', minify: true, target: 'es2022', outfile: join(sortie, 'pdf-lib.js'), legalComments: 'none', logLevel: 'warning' });
const v = (p) => JSON.parse(readFileSync(join(racine, 'node_modules', p, 'package.json'), 'utf8')).version;
writeFileSync(join(sortie, 'LICENCES.txt'), `Ce dossier regroupe deux bibliothèques sous licence MIT :\n- pdf-lib ${v('pdf-lib')} (c) Andrew Dillon, https://github.com/Hopding/pdf-lib\n- @pdf-lib/fontkit ${v('@pdf-lib/fontkit')} (c) Devon Govett, https://github.com/Hopding/fontkit\nRégénéré par : npm run vendor.\n`);
console.log('vendor/pdf-lib.js écrit.');
