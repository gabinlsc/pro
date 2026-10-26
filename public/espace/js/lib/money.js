// Montants : tout est calculé en centimes entiers (jamais de nombres à virgule pour l'argent).
// Mêmes règles d'arrondi que admin/lib/billing.php du dépôt portfolio (demi vers l'extérieur), vérifiées par tests/crosscheck-php.mjs.

/** « 1 234,56 », « 1234.5 », « 12 € » → centimes (entier), ou null si le texte n'est pas un montant valide (plus de 2 décimales refusé). */
export function parseMontant(texte) {
  const s = String(texte ?? '').replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s) && !/^-?\.\d{1,2}$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [ent, dec = ''] = s.replace('-', '').split('.');
  const c = Number(ent || '0') * 100 + Number(dec.padEnd(2, '0'));
  return Number.isSafeInteger(c) ? (neg ? -c : c) : null;
}

/** Quantité « 2,5 » → centièmes (250), ou null. Deux décimales au plus, strictement positive. */
export function parseQuantite(texte) {
  const s = String(texte ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [ent, dec = ''] = s.split('.');
  const q = Number(ent) * 100 + Number(dec.padEnd(2, '0'));
  return q > 0 && q <= 999900 ? q : null;
}

/** Pourcentage « 12,5 » → centièmes de pour cent (1250), entre 0 et 100 inclus, ou null. */
export function parsePourcent(texte) {
  const s = String(texte ?? '').replace(/[\s%]/g, '').replace(',', '.');
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [ent, dec = ''] = s.split('.');
  const p = Number(ent) * 100 + Number(dec.padEnd(2, '0'));
  return p <= 10000 ? p : null;
}

const divArrondi = (n, d) => { // division entière arrondie « demi vers l'extérieur », sur des BigInt
  const half = d / 2n;
  return n >= 0n ? (n + half) / d : (n - half) / d;
};

/** Total d'une ligne en centimes : quantité (en centièmes) × prix unitaire (centimes), arrondi au centime. Remise en centièmes de pour cent. */
export function totalLigne({ qty100, unit, remise100 = 0 }) {
  const brut = divArrondi(BigInt(qty100) * BigInt(unit), 100n);
  if (!remise100) return Number(brut);
  return Number(divArrondi(brut * BigInt(10000 - remise100), 10000n));
}

export const somme = (lignes) => lignes.reduce((a, l) => a + totalLigne(l), 0);

/** Part d'un montant en pourcentage entier (acompte) : arrondi demi vers le haut, comme billing.php. */
export const partEnPourcent = (total, pct) => Number(divArrondi(BigInt(total) * BigInt(pct), 100n));

/** 123456 → « 1 234,56 € » (espace fine insécable entre milliers, espace insécable avant €). `decimales: 2` force « 590,00 € ». */
export function formaterEuros(centimes, { decimales = 'auto' } = {}) {
  const neg = centimes < 0, c = Math.abs(centimes);
  const ent = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dec = c % 100;
  return (neg ? '−' : '') + ent + (decimales === 2 || dec ? ',' + String(dec).padStart(2, '0') : '') + ' €';
}

/** Quantité en centièmes → « 2,5 ». */
export const formaterQuantite = (q100) => String(q100 / 100).replace('.', ',');
