// Validations d'identifiants : SIREN, SIRET (clé de Luhn), IBAN (modulo 97), BIC.

export const chiffres = (v) => String(v ?? '').replace(/\s+/g, '');

/** Clé de contrôle de Luhn (identique à bill_luhn de billing.php). */
export function luhn(digits) {
  if (!/^\d+$/.test(digits)) return false;
  let somme = 0;
  [...digits].reverse().forEach((d, i) => { const n = Number(d) * (i % 2 ? 2 : 1); somme += n > 9 ? n - 9 : n; });
  return somme % 10 === 0;
}
export const sirenValide = (v) => { const d = chiffres(v); return d.length === 9 && luhn(d); };
export const siretValide = (v) => {
  const d = chiffres(v);
  if (d.length !== 14) return false;
  // Exception connue : les établissements de La Poste (SIREN 356 000 000) se contrôlent par somme des chiffres multiple de 5.
  if (d.startsWith('356000000')) return [...d].reduce((a, x) => a + Number(x), 0) % 5 === 0;
  return luhn(d);
};

const LONGUEURS_IBAN = { FR: 27, DE: 22, BE: 16, ES: 24, IT: 27, LU: 20, NL: 18, PT: 25, CH: 21, GB: 22, IE: 22, AT: 20 };
/** IBAN : longueur du pays (si connu), caractères, puis reste modulo 97 égal à 1. */
export function ibanValide(v) {
  const s = chiffres(v).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (LONGUEURS_IBAN[s.slice(0, 2)] && s.length !== LONGUEURS_IBAN[s.slice(0, 2)]) return false;
  const rearrange = s.slice(4) + s.slice(0, 4);
  let reste = 0;
  for (const ch of rearrange) { const val = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const c of val) reste = (reste * 10 + Number(c)) % 97; }
  return reste === 1;
}
export const bicValide = (v) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(chiffres(v).toUpperCase());
export const formaterIban = (v) => chiffres(v).toUpperCase().replace(/(.{4})/g, '$1 ').trim();
export const formaterSiren = (v) => chiffres(v).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
export const formaterSiret = (v) => chiffres(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
export const emailValide = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim());
