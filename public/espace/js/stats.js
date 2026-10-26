// Calculs de l'espace de travail : totaux des documents, restes à payer, encaissements, chiffre d'affaires, plafond, relances. Fonctions pures (testées sous Node).
import { analyser, TYPES } from './lib/facture.js';
import { ACTIVITES, alertesSeuils } from './lib/simulateur.js';
import { etatVide as livreVide, chronologie, total as totalEcritures, totauxMensuels, totauxPeriodes, prochainePeriode } from './lib/livre.js';

export const FACTURANTS = ['facture', 'acompte', 'solde'];
export const analyserDocument = (d, regles, auj) => analyser(d.doc, regles, auj);
export const totalDocument = (d, regles, auj) => analyserDocument(d, regles, auj).total;
export const totalPaye = (d) => d.paiements.reduce((a, p) => a + p.montant, 0);
/** Reste à encaisser d'une facture (0 pour un devis ou un avoir). */
export const resteAPayer = (d, regles, auj) => (FACTURANTS.includes(d.doc.type) ? Math.max(0, totalDocument(d, regles, auj) - totalPaye(d)) : 0);
export const echeanceDocument = (d, regles, auj) => analyserDocument(d, regles, auj).echeance;
export const estEnRetard = (d, regles, auj) => FACTURANTS.includes(d.doc.type) && d.statut === 'envoye' && resteAPayer(d, regles, auj) > 0 && !!echeanceDocument(d, regles, auj) && echeanceDocument(d, regles, auj) < auj;
export const joursDeRetard = (d, regles, auj) => { const e = echeanceDocument(d, regles, auj); return e && e < auj ? Math.round((Date.parse(auj) - Date.parse(e)) / 86_400_000) : 0; };
export const devisExpire = (d, regles, auj) => d.doc.type === 'devis' && d.statut === 'envoye' && analyserDocument(d, regles, auj).validJusqua && analyserDocument(d, regles, auj).validJusqua < auj;
export const clientDe = (etat, d) => etat.clients.find((c) => c.id === d.clientId) ?? null;

/** Toutes les écritures de recettes : paiements des documents et encaissements saisis à la main, classés par date. Un paiement sur un avoir est un remboursement (négatif). */
export function ecritures(etat, regles, auj) {
  const liste = [];
  for (const d of etat.documents) {
    if (!['facture', 'acompte', 'solde', 'avoir'].includes(d.doc.type)) continue;
    const client = clientDe(etat, d)?.nom || d.doc.client.nom || 'Client';
    for (const p of d.paiements) liste.push({ id: `${d.id}:${p.id}`, date: p.date, origine: client, nature: `${TYPES[d.doc.type].titre} ${d.doc.numero}`.trim(), montant: d.doc.type === 'avoir' ? -p.montant : p.montant, mode: p.mode, piece: d.doc.numero, global: false, docId: d.id });
  }
  for (const e of etat.encaissements) liste.push({ ...e, docId: null });
  return liste.sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
}
/** Les écritures au format du module livre (identifiants entiers, ordre chronologique). */
export function etatLivre(etat, regles, auj) {
  const e = livreVide(); e.activite = etat.profil.activite; e.periodicite = etat.profil.periodicite;
  e.entrees = ecritures(etat, regles, auj).map((x, i) => ({ id: i + 1, date: x.date, origine: x.origine, nature: x.nature, montant: x.montant, mode: x.mode, piece: x.piece, global: x.global, corrige: null }));
  e.suivant = e.entrees.length + 1;
  return e;
}
export function indicateurs(etat, regles, auj) {
  const annee = Number(auj.slice(0, 4)), livre = etatLivre(etat, regles, auj);
  const docs = etat.documents.map((d) => ({ d, a: analyserDocument(d, regles, auj) }));
  const envoyees = docs.filter(({ d }) => FACTURANTS.includes(d.doc.type) && d.statut === 'envoye');
  const enAttente = envoyees.reduce((s, { d }) => s + resteAPayer(d, regles, auj), 0);
  const retard = envoyees.filter(({ d }) => estEnRetard(d, regles, auj));
  const devis = docs.filter(({ d }) => d.doc.type === 'devis' && d.statut === 'envoye');
  const ca = totalEcritures(chronologie(livre, annee)), act = ACTIVITES[etat.profil.activite];
  const plafondEuros = act ? regles.valeur(act.plafond) : null;
  const periodes = totauxPeriodes(livre, annee, regles);
  return {
    annee, ca, parMois: totauxMensuels(livre, annee), plafond: plafondEuros === null ? null : plafondEuros * 100, partPlafond: plafondEuros ? Math.min(1, ca / (plafondEuros * 100)) : null,
    alertes: alertesSeuils({ annuel: ca, activite: etat.profil.activite }, regles), enAttente, retard: retard.map(({ d }) => d), devisEnAttente: devis.map(({ d }) => d),
    periodes, periodeADeclarer: periodes.length ? prochainePeriode(periodes, auj) : null,
    nbFactures: etat.documents.filter((d) => FACTURANTS.includes(d.doc.type) && d.statut !== 'brouillon' && d.statut !== 'annule').length,
  };
}
/** Numéros déjà utilisés par les documents (pour proposer le suivant). */
export const numerosExistants = (etat, exclureId = null) => etat.documents.filter((d) => d.id !== exclureId).map((d) => d.doc.numero);
