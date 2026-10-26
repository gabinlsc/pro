// Livre des recettes : écritures chronologiques non modifiables (on corrige par une écriture inverse), totaux par mois et par période de déclaration, jauge de plafond, export CSV.
// Règles : service-public.gouv.fr F23266 et F36018 (voir data/regles.json). Les montants sont en centimes entiers.
import { parseMontant, formaterEuros } from './money.js';
import { dateIsoValide, dernierJourDuMois, MOIS_FR } from './dates.js';
import { alertesSeuils } from './simulateur.js';

export const FORMAT = 'compta-by-glsc-livre-1';
export const CLE = 'compta:livre:v1';
export const MODES = { cheque: 'Chèque', cb: 'Carte bancaire', virement: 'Virement', especes: 'Espèces', autre: 'Autre' };
const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export const etatVide = () => ({ format: FORMAT, activite: 'bic_services', periodicite: 'mois', auto: false, suivant: 1, entrees: [] });

/** Valide une saisie et renvoie { erreurs, entree }. `montant` peut être négatif seulement pour une correction (créée par `corriger`). */
export function validerSaisie(s) {
  const erreurs = [];
  const date = String(s.date ?? '');
  if (!dateIsoValide(date)) erreurs.push({ champ: 'date', message: 'Indiquez la date d’encaissement.' });
  const origine = String(s.origine ?? '').trim();
  if (!origine) erreurs.push({ champ: 'origine', message: 'Indiquez l’origine de la recette (le nom du client ou de la société qui vous a payé).' });
  if (origine.length > 120) erreurs.push({ champ: 'origine', message: 'Origine trop longue (120 caractères au maximum).' });
  const montant = parseMontant(s.montant);
  if (montant === null || montant <= 0) erreurs.push({ champ: 'montant', message: 'Indiquez le montant encaissé, en euros et supérieur à zéro (par exemple 450 ou 450,50).' });
  if (montant !== null && montant > 100_000_000_00) erreurs.push({ champ: 'montant', message: 'Montant trop élevé.' });
  if (!MODES[s.mode]) erreurs.push({ champ: 'mode', message: 'Choisissez le mode de règlement.' });
  if (erreurs.length) return { erreurs };
  return { erreurs, entree: { date, origine, nature: txt(s.nature, 160).trim(), montant, mode: s.mode, piece: txt(s.piece, 60).trim(), global: s.global === true } };
}

/** Ajoute une écriture : numérotée, verrouillée. */
export function ajouter(etat, entree) {
  const n = { ...entree, id: etat.suivant, corrige: null };
  return { ...etat, suivant: etat.suivant + 1, entrees: [...etat.entrees, n] };
}
/** Corrige une écriture sans la modifier : ajoute une écriture inverse (montant négatif) à la date du jour, qui la référence. */
export function corriger(etat, id, dateIso) {
  const e = etat.entrees.find((x) => x.id === id);
  if (!e) return { erreur: 'Écriture introuvable.' };
  if (e.montant < 0 || etat.entrees.some((x) => x.corrige === id)) return { erreur: 'Cette écriture a déjà été corrigée, ou est elle-même une correction.' };
  const inverse = { id: etat.suivant, date: dateIso, origine: e.origine, nature: `Correction de l’écriture n° ${e.id}`, montant: -e.montant, mode: e.mode, piece: e.piece, global: e.global, corrige: e.id };
  return { etat: { ...etat, suivant: etat.suivant + 1, entrees: [...etat.entrees, inverse] } };
}
/** Écritures de l'année, dans l'ordre chronologique (date, puis ordre de saisie). */
export const chronologie = (etat, annee) => etat.entrees.filter((e) => e.date.startsWith(String(annee))).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
export const total = (entrees) => entrees.reduce((a, e) => a + e.montant, 0);
export const totauxMensuels = (etat, annee) => { const m = Array(12).fill(0); for (const e of chronologie(etat, annee)) m[Number(e.date.slice(5, 7)) - 1] += e.montant; return m; };

/** Périodes de déclaration de l'année avec leur date limite : fin du mois suivant le mois ; trimestres : dates de data/regles.json (30 avril, 31 juillet, 31 octobre, 31 janvier). */
export function periodes(annee, periodicite, regles) {
  const out = [];
  if (periodicite === 'mois') {
    for (let m = 1; m <= 12; m++) out.push({ cle: `${annee}-${String(m).padStart(2, '0')}`, libelle: `${MOIS_FR[m - 1][0].toUpperCase()}${MOIS_FR[m - 1].slice(1)} ${annee}`, du: `${annee}-${String(m).padStart(2, '0')}-01`, au: dernierJourDuMois(annee, m), echeance: m === 12 ? dernierJourDuMois(annee + 1, 1) : dernierJourDuMois(annee, m + 1) });
    return out;
  }
  const ids = ['decl_trimestre_1', 'decl_trimestre_2', 'decl_trimestre_3', 'decl_trimestre_4'];
  for (let q = 0; q < 4; q++) {
    const jm = regles.valeur(ids[q]); if (jm === null) return [];
    out.push({ cle: `${annee}-T${q + 1}`, libelle: `${q + 1 === 1 ? '1er' : `${q + 1}e`} trimestre ${annee}`, du: `${annee}-${String(q * 3 + 1).padStart(2, '0')}-01`, au: dernierJourDuMois(annee, q * 3 + 3), echeance: `${q === 3 ? annee + 1 : annee}-${jm}` });
  }
  return out;
}
export const totauxPeriodes = (etat, annee, regles) => periodes(annee, etat.periodicite, regles).map((p) => ({ ...p, total: total(chronologie(etat, annee).filter((e) => e.date >= p.du && e.date <= p.au)) }));

/** Période à déclarer en priorité : la plus ancienne terminée dont l'échéance n'est pas passée, sinon la période en cours. */
export function prochainePeriode(lignes, aujourdhui) {
  const finies = lignes.filter((p) => p.au < aujourdhui && p.echeance >= aujourdhui);
  return finies[0] ?? lignes.find((p) => p.du <= aujourdhui && aujourdhui <= p.au) ?? null;
}

export const alertes = (etat, annee, regles) => alertesSeuils({ annuel: total(chronologie(etat, annee)), activite: etat.activite }, regles);

// ---------------------------------------------------------------- CSV
/** Une cellule CSV : neutralise les formules (=, +, -, @, tabulation, retour chariot) sauf pour un nombre ; guillemets doublés. Même règle que acct_csv_cell de accounting.php. */
export function celluleCsv(v) {
  let s = String(v ?? '');
  const nombre = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(s.replaceAll(',', '.')); // équivalent de is_numeric(str_replace(',', '.', $s)) en PHP 8
  if (s !== '' && ['=', '+', '-', '@', '\t', '\r'].includes(s[0]) && !nombre) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
/** CSV pour Excel en français : séparateur « ; », virgule décimale, BOM UTF-8, fins de ligne CRLF. */
export function csv(entetes, lignes) {
  const l = (r) => r.map(celluleCsv).join(';');
  return '﻿' + l(entetes) + '\r\n' + lignes.map((r) => l(r) + '\r\n').join('');
}
const montantCsv = (c) => (c < 0 ? '-' : '') + String(Math.floor(Math.abs(c) / 100)) + ',' + String(Math.abs(c) % 100).padStart(2, '0');
export function exporterCsv(etat, annee) {
  const lignes = chronologie(etat, annee).map((e, i) => [i + 1, e.date, e.origine + (e.global ? ' (écriture globale de fin de journée)' : ''), e.nature, MODES[e.mode], e.piece, montantCsv(e.montant)]);
  lignes.push(['', '', '', '', '', 'Total', montantCsv(total(chronologie(etat, annee)))]);
  return csv(['N°', 'Date d’encaissement', 'Origine de la recette', 'Nature', 'Mode de règlement', 'Référence de la pièce justificative', 'Montant (€)'], lignes);
}

// ---------------------------------------------------------------- sauvegarde
export function nettoyerEtat(brut) {
  const r = brut && typeof brut === 'object' ? brut : {}, base = etatVide();
  const entrees = [];
  for (const x of (Array.isArray(r.entrees) ? r.entrees : []).slice(0, 20000)) {
    if (!x || typeof x !== 'object' || !dateIsoValide(x.date) || !Number.isSafeInteger(x.montant) || x.montant === 0 || Math.abs(x.montant) > 100_000_000_00 || !MODES[x.mode] || !Number.isInteger(x.id) || x.id < 1) continue;
    entrees.push({ id: x.id, date: x.date, origine: txt(x.origine, 120), nature: txt(x.nature, 160), montant: x.montant, mode: x.mode, piece: txt(x.piece, 60), global: x.global === true, corrige: Number.isInteger(x.corrige) ? x.corrige : null });
  }
  const ids = new Set(); const uniques = entrees.filter((e) => (ids.has(e.id) ? false : (ids.add(e.id), true)));
  return { ...base, activite: ['vente', 'bic_services', 'bnc_ssi', 'bnc_cipav'].includes(r.activite) ? r.activite : base.activite, periodicite: r.periodicite === 'trimestre' ? 'trimestre' : 'mois', auto: r.auto === true, entrees: uniques, suivant: Math.max(1, ...uniques.map((e) => e.id + 1)) };
}
export const exporterEtat = (etat) => JSON.stringify({ ...etat, format: FORMAT }, null, 2);
export function importerEtat(texte) {
  if (typeof texte !== 'string' || texte.length > 5_000_000) throw new Error('Fichier trop volumineux.');
  let brut; try { brut = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas un JSON valide.'); }
  if (!brut || brut.format !== FORMAT) throw new Error('Ce fichier ne vient pas de Compta by glsc (livre des recettes).');
  return nettoyerEtat(brut);
}
export { formaterEuros };
