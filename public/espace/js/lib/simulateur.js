// Simulateur « combien me reste-t-il ? » : cotisations, versement libératoire, net avant impôt, alertes de plafond.
// Tous les taux, plafonds et seuils viennent de data/regles.json ; une donnée non vérifiée bloque le calcul au lieu d'être remplacée.
import { parseMontant } from './money.js';
import { dateIsoValide, dernierJourDuMois, dateLongue } from './dates.js';

export const ACTIVITES = {
  vente: { libelle: 'Vente de marchandises, fourniture de logement (BIC)', taux: 'taux_vente', vl: 'taux_vl_vente', abattement: 'abattement_vente', plafond: 'plafond_ca_vente', tvaBase: 'tva_franchise_vente', tvaMajore: 'tva_majore_vente' },
  bic_services: { libelle: 'Prestations de services commerciales ou artisanales (BIC)', taux: 'taux_bic_services', vl: 'taux_vl_bic_services', abattement: 'abattement_bic_services', plafond: 'plafond_ca_services', tvaBase: 'tva_franchise_services', tvaMajore: 'tva_majore_services' },
  bnc_ssi: { libelle: 'Profession libérale non réglementée (BNC, SSI)', taux: 'taux_bnc_ssi', vl: 'taux_vl_bnc_ssi', abattement: 'abattement_bnc', plafond: 'plafond_ca_services', tvaBase: 'tva_franchise_services', tvaMajore: 'tva_majore_services' },
  bnc_cipav: { libelle: 'Profession libérale réglementée (BNC, Cipav)', taux: 'taux_bnc_cipav', vl: 'taux_vl_bnc_cipav', abattement: 'abattement_bnc', plafond: 'plafond_ca_services', tvaBase: 'tva_franchise_services', tvaMajore: 'tva_majore_services' },
};
export const PERIODES = { mois: { libelle: 'par mois', facteur: 12 }, trimestre: { libelle: 'par trimestre', facteur: 4 }, annee: { libelle: 'par an', facteur: 1 } };

const bp = (pourcent) => Math.round(pourcent * 100); // 12,3 % → 1230 points de base
const diviser = (n, d) => { const h = d / 2n; return n >= 0n ? (n + h) / d : (n - h) / d; }; // arrondi demi vers l'extérieur
const partDe = (centimes, num, den) => Number(diviser(BigInt(centimes) * BigInt(num), BigInt(den)));
export const formaterBp = (v) => `${(v / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/** Fin de l'Acre : dernier jour du N-ième trimestre civil suivant celui du début d'activité. */
export function finAcre(debutIso, trimestres) {
  const [a, m] = debutIso.split('-').map(Number);
  const total = a * 4 + Math.floor((m - 1) / 3) + trimestres;
  return dernierJourDuMois(Math.floor(total / 4), (total % 4) * 3 + 3);
}


/** Alertes de plafond de chiffre d'affaires et de seuils de franchise de TVA, sur un chiffre d'affaires annuel en centimes (projeté si `projection`). */
export function alertesSeuils({ annuel, activite, projection = false }, regles) {
  const act = ACTIVITES[activite], alertes = [];
  const plafond = regles.valeur(act.plafond), tvaBase = regles.valeur(act.tvaBase), tvaMajore = regles.valeur(act.tvaMajore);
  const eurosTxt = (c) => `${(c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
  const proj = projection ? ` (estimation sur l’année : ${eurosTxt(annuel)})` : '';
  if (plafond !== null) {
    const p = plafond * 100;
    if (annuel > p) alertes.push({ niveau: 'danger', texte: `Plafond de chiffre d’affaires dépassé${proj} : ${eurosTxt(p)}. Si vous le dépassez deux années de suite, vous quittez le régime de la micro-entreprise.` });
    else if (annuel * 10 >= p * 9) alertes.push({ niveau: 'attention', texte: `Vous approchez du plafond de chiffre d’affaires${proj} : ${eurosTxt(p)}.` });
  }
  if (tvaBase !== null && tvaMajore !== null) {
    const b = tvaBase * 100, m = tvaMajore * 100;
    if (annuel > m) alertes.push({ niveau: 'danger', texte: `Seuil majoré de franchise de TVA dépassé${proj} : ${eurosTxt(m)}. Vous devenez redevable de la TVA dès le jour du dépassement.` });
    else if (annuel > b) alertes.push({ niveau: 'attention', texte: `Seuil de franchise de TVA dépassé${proj} : ${eurosTxt(b)}. Vous restez en franchise cette année tant que vous ne dépassez pas ${eurosTxt(m)} ; si le seuil de base est dépassé l’année civile précédente, la TVA s’applique dès le 1er janvier suivant.` });
    else if (annuel * 10 >= b * 9) alertes.push({ niveau: 'info', texte: `Vous approchez du seuil de franchise de TVA${proj} : ${eurosTxt(b)}.` });
  }
  return alertes;
}

export function simuler(e, regles, aujourdhui) {
  const erreurs = [], alertes = [];
  const act = ACTIVITES[e.activite], per = PERIODES[e.periode];
  if (!act || !per) return { erreurs: [{ champ: 'activite', message: 'Choisissez votre activité et la période.' }], bloque: true, alertes };
  const ca = parseMontant(e.ca), depenses = e.depenses.trim() === '' ? 0 : parseMontant(e.depenses);
  if (ca === null || ca < 0) erreurs.push({ champ: 'ca', message: 'Indiquez votre chiffre d’affaires en euros (par exemple 2 500 ou 2 500,50).' });
  if (depenses === null || depenses < 0) erreurs.push({ champ: 'depenses', message: 'Dépenses invalides : indiquez un montant en euros, ou laissez vide.' });
  if (ca !== null && ca > 100_000_000_00) erreurs.push({ champ: 'ca', message: 'Montant trop élevé.' });
  const donnee = (id) => { const v = regles.valeur(id); if (v === null) erreurs.push({ champ: 'donnees', message: `Donnée en cours de vérification (${id}) : le calcul est bloqué.` }); return v; };
  const taux = donnee(act.taux), vl = donnee(act.vl);
  let exo = 0, fin = null;
  if (e.acre) {
    const debut = donnee('acre_debut_regime'), pct = donnee('acre_exoneration_micro'), tri = donnee('acre_trimestres_suivants');
    if (debut !== null && pct !== null && tri !== null) {
      exo = pct;
      if (e.debutActivite) {
        if (!dateIsoValide(e.debutActivite)) erreurs.push({ champ: 'debutActivite', message: 'Date de début d’activité invalide.' });
        else if (e.debutActivite < debut) erreurs.push({ champ: 'debutActivite', message: `Ce simulateur ne calcule que l’Acre des créations à partir du ${dateLongue(debut)} (exonération de ${pct} %). Pour une création antérieure, utilisez le simulateur de l’Urssaf.` });
        else { fin = finAcre(e.debutActivite, tri); if (aujourdhui > fin) alertes.push({ niveau: 'attention', texte: `Votre Acre s’est terminée le ${dateLongue(fin)} : décochez-la pour une période plus récente.` }); }
      }
    }
  }
  if (erreurs.length) return { erreurs, bloque: true, alertes };

  const tauxBp = bp(taux), exoBp = bp(exo), vlBp = bp(vl);
  const social = partDe(ca, tauxBp * (10000 - exoBp), 100_000_000);
  const impotVl = e.vl ? partDe(ca, vlBp - tauxBp, 10000) : 0;
  const total = social + impotVl, net = ca - total - depenses;
  const annuel = ca * per.facteur, projection = e.periode !== 'annee';

  // Impôt : sans versement libératoire, le revenu imposable est le chiffre d'affaires moins l'abattement forfaitaire (avant le barème de l'impôt).
  let imposable = null;
  if (!e.vl && ca > 0) {
    const pct = donnee(act.abattement), mini = donnee('abattement_minimum');
    if (pct !== null && mini !== null) { const abat = Math.max(partDe(annuel, bp(pct), 10000), Math.round(mini * 100)); imposable = { abattement: abat, pct, base: Math.max(annuel - abat, 0) }; }
  }

  alertes.push(...alertesSeuils({ annuel, activite: e.activite, projection }, regles));
  if (net < 0) alertes.push({ niveau: 'attention', texte: 'Vos dépenses dépassent ce qu’il vous reste après cotisations : le résultat est négatif.' });
  if (ca > 0 && e.activite !== 'vente') alertes.push({ niveau: 'info', texte: 'Pour certaines activités (avocat, auteur, artiste-interprète…), d’autres seuils de TVA s’appliquent : vérifiez sur service-public.gouv.fr.' });

  const parts = [{ id: 'net', libelle: 'Ce qu’il vous reste', montant: Math.max(net, 0) }, { id: 'cotisations', libelle: 'Cotisations sociales', montant: social }];
  if (e.vl) parts.push({ id: 'impot', libelle: 'Impôt (versement libératoire)', montant: impotVl });
  if (depenses > 0) parts.push({ id: 'depenses', libelle: 'Vos dépenses', montant: depenses });

  return { erreurs, bloque: false, ca, depenses, social, impotVl, total, net, tauxBp, exoBp, vlBp, tauxEffectifBp: Math.round(tauxBp * (10000 - exoBp) / 10000), annuel, projection, imposable, finAcre: fin, alertes, parts, activite: act, periode: per };
}
