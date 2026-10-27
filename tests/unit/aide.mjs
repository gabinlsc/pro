import { readFileSync } from 'node:fs';
import { creerRegles } from '../../public/espace/js/lib/facture.js';
export const regles = creerRegles(JSON.parse(readFileSync(new URL('../../public/espace/data/regles.json', import.meta.url), 'utf8')).entrees);
export const AUJ = '2026-10-26';
