import test from 'node:test';
import assert from 'node:assert/strict';
import { etatVide, nettoyerDocument, clientVide } from '../../public/espace/js/donnees.js';
import { docVide } from '../../public/espace/js/lib/facture.js';
import { totalDocument, totalPaye, resteAPayer, estEnRetard, joursDeRetard, ecritures, etatLivre, indicateurs, devisExpire } from '../../public/espace/js/stats.js';
import { regles, AUJ } from './aide.mjs';

const doc = (o = {}, lignes = [{ desc: 'Site vitrine', qty: '1', unite: '', prix: '1200', remise: '' }]) => {
  const d = docVide('2026-09-01'); Object.assign(d, { numero: 'F-2026-001', datePrestation: '2026-09-01', type: 'facture' }, o); d.lignes = lignes;
  d.emetteur = { ...d.emetteur, nom: 'Gabin Lescoat', adresse: '1 rue A', cp: '35000', ville: 'Rennes', siren: '732829320', iban: 'FR7630006000011234567890189' };
  d.client = { ...d.client, nom: 'Atelier Lumière', adresse: '2 rue B', cp: '35000', ville: 'Rennes' };
  return d;
};
const enreg = (o = {}, d = doc()) => nettoyerDocument({ id: o.id ?? 'd1', clientId: 'c1', doc: d, statut: 'envoye', paiements: [], ...o }, AUJ);
const base = () => { const e = etatVide(AUJ); e.clients.push({ ...clientVide(), id: 'c1', nom: 'Atelier Lumière' }); return e; };

test('total, paiements et reste à payer', () => {
  const d = enreg({ paiements: [{ id: 'p1', date: '2026-09-20', montant: 50000, mode: 'virement' }] });
  assert.equal(totalDocument(d, regles, AUJ), 120000); assert.equal(totalPaye(d), 50000); assert.equal(resteAPayer(d, regles, AUJ), 70000);
});
test('retard : facture envoyée, impayée, échéance dépassée (30 jours après le 1er septembre = 1er octobre)', () => {
  const d = enreg(); assert.ok(estEnRetard(d, regles, AUJ)); assert.equal(joursDeRetard(d, regles, AUJ), 25);
  assert.ok(!estEnRetard(enreg({ statut: 'paye', paiements: [{ id: 'p', date: '2026-10-02', montant: 120000, mode: 'cb' }] }), regles, AUJ));
  assert.ok(!estEnRetard(enreg({ statut: 'brouillon' }), regles, AUJ));
  assert.ok(!estEnRetard(enreg({}, doc({ type: 'devis' })), regles, AUJ));
});
test('devis expiré : envoyé et validité dépassée', () => {
  const d = enreg({}, doc({ type: 'devis', numero: 'D-2026-001', dateEmission: '2026-08-01', validiteJours: '30' })); assert.ok(devisExpire(d, regles, AUJ));
});
test('écritures : paiements des factures + saisies manuelles, avoir remboursé en négatif, ordre chronologique', () => {
  const e = base();
  e.documents.push(enreg({ paiements: [{ id: 'p1', date: '2026-09-20', montant: 50000, mode: 'virement' }] }));
  e.documents.push(enreg({ id: 'd2', paiements: [{ id: 'p2', date: '2026-10-05', montant: 2000, mode: 'cb' }] }, doc({ type: 'avoir', numero: 'A-2026-001', reference: 'F-2026-001' })));
  e.encaissements.push({ id: 'm1', date: '2026-03-02', origine: 'Café du port', nature: 'Cours', montant: 9000, mode: 'cheque', piece: '', global: false });
  const l = ecritures(e, regles, AUJ);
  assert.deepEqual(l.map((x) => x.montant), [9000, 50000, -2000]); assert.equal(l[1].origine, 'Atelier Lumière'); assert.equal(l[1].nature, 'Facture F-2026-001');
  const livre = etatLivre(e, regles, AUJ); assert.equal(livre.entrees.length, 3); assert.equal(livre.entrees[0].id, 1);
});
test('indicateurs : chiffre d’affaires de l’année, en attente, plafond, alertes, mois', () => {
  const e = base();
  e.documents.push(enreg({ paiements: [{ id: 'p1', date: '2026-09-20', montant: 50000, mode: 'virement' }] }));
  e.documents.push(enreg({ id: 'd3', statut: 'envoye' }, doc({ numero: 'F-2026-002' })));
  e.encaissements.push({ id: 'm1', date: '2026-03-02', origine: 'A', nature: '', montant: 9000, mode: 'cheque', piece: '', global: false });
  e.encaissements.push({ id: 'm0', date: '2025-12-31', origine: 'B', nature: '', montant: 100000, mode: 'cheque', piece: '', global: false });
  const k = indicateurs(e, regles, AUJ);
  assert.equal(k.ca, 59000); assert.equal(k.parMois[2], 9000); assert.equal(k.parMois[8], 50000); assert.equal(k.enAttente, 70000 + 120000); assert.equal(k.retard.length, 2);
  assert.equal(k.plafond, 8360000); assert.ok(k.partPlafond > 0 && k.partPlafond < 0.01); assert.equal(k.periodes.length, 12);
});
test('alerte de plafond : proche des 90 % du plafond de services', () => {
  const e = base(); e.encaissements.push({ id: 'g', date: '2026-05-05', origine: 'Gros client', nature: '', montant: 7_700_000, mode: 'virement', piece: '', global: false });
  const k = indicateurs(e, regles, AUJ); assert.ok(k.alertes.some((a) => /approchez du plafond/i.test(a.texte)));
});
