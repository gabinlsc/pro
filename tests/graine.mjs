// Données de démonstration pour les tests : un profil, trois clients, des devis et factures (payées, en retard, en attente) et quelques recettes.
import { etatVide, nettoyerEtat, exporter } from '../public/espace/js/donnees.js';
import { docVide } from '../public/espace/js/lib/facture.js';

export function etatDemo(auj) {
  const e = etatVide(auj), an = auj.slice(0, 4);
  Object.assign(e.profil.emetteur, { nom: 'Gabin Lescoat', adresse: '1 rue du Test', cp: '35000', ville: 'Rennes', siren: '732829320', email: 'pro@glsc.fr', iban: 'FR7630006000011234567890189' });
  const cl = (id, nom, extra = {}) => ({ id, type: 'pro', nom, adresse: '2 rue B', cp: '35000', ville: 'Rennes', siren: '552120222', tvaIntra: '', email: `${id}@exemple.fr`, tel: '', notes: '', ...extra });
  e.clients.push(cl('c1', 'Atelier Lumière'), cl('c2', 'Boulangerie Le Fournil'), cl('c3', 'Marie Dupont', { type: 'particulier', siren: '' }));
  const doc = (type, numero, date, lignes, client, extra = {}) => { const d = docVide(auj); Object.assign(d, { type, numero, dateEmission: date, datePrestation: type === 'devis' ? '' : date, ...extra }); d.emetteur = { ...e.profil.emetteur }; d.client = { ...d.client, nom: client.nom, adresse: client.adresse, cp: client.cp, ville: client.ville, siren: client.siren, type: client.type }; d.lignes = lignes.map(([desc, prix]) => ({ desc, qty: '1', unite: '', prix: String(prix), remise: '' })); return d; };
  const p = (id, date, montant) => ({ id, date, montant, mode: 'virement' });
  e.documents.push(
    { id: 'd1', clientId: 'c1', doc: doc('facture', `F-${an}-001`, `${an}-03-10`, [['Création de site vitrine', 1200]], e.clients[0]), statut: 'paye', paiements: [p('p1', `${an}-03-28`, 120000)], envoyeLe: `${an}-03-10` },
    { id: 'd2', clientId: 'c2', doc: doc('facture', `F-${an}-002`, `${an}-05-02`, [['Maintenance mensuelle', 300], ['Hébergement', 120]], e.clients[1]), statut: 'paye', paiements: [p('p2', `${an}-05-20`, 42000)], envoyeLe: `${an}-05-02` },
    { id: 'd3', clientId: 'c1', doc: doc('facture', `F-${an}-003`, `${an}-08-01`, [['Refonte logo', 800]], e.clients[0]), statut: 'envoye', paiements: [p('p3', `${an}-08-20`, 30000)], envoyeLe: `${an}-08-01` },
    { id: 'd4', clientId: 'c2', doc: doc('devis', `D-${an}-001`, `${an}-09-15`, [['Application de commande', 4500]], e.clients[1], { validiteJours: '60' }), statut: 'envoye', paiements: [], envoyeLe: `${an}-09-15` },
    { id: 'd5', clientId: 'c3', doc: doc('facture', `F-${an}-004`, `${an}-10-20`, [['Cours particuliers', 240]], e.clients[2]), statut: 'brouillon', paiements: [], envoyeLe: '' });
  e.encaissements.push({ id: 'm1', date: `${an}-02-14`, origine: 'Café du port', nature: 'Affiche', montant: 9000, mode: 'cheque', piece: '', global: false });
  return nettoyerEtat(e, auj);
}
export const sauvegardeDemo = (auj) => exporter(etatDemo(auj));
