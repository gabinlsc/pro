import test from 'node:test';
import assert from 'node:assert/strict';
import { etatVide, nettoyerEtat, importer, exporter, clientVide, FORMAT } from '../../public/espace/js/donnees.js';
import { chiffrer, dechiffrer, estChiffre } from '../../public/espace/js/crypto.js';
import { AUJ } from './aide.mjs';

test('un état vide survit à l’export et à l’import', () => {
  const e = etatVide(AUJ); const r = importer(exporter(e), AUJ);
  assert.equal(r.format, FORMAT); assert.deepEqual(r.clients, []); assert.equal(r.profil.activite, 'bic_services');
});
test('import : refuse un autre format et un JSON invalide', () => {
  assert.throws(() => importer('{"format":"autre"}', AUJ), /ne vient pas de GLSC Pro/); assert.throws(() => importer('pas du json', AUJ), /JSON valide/);
});
test('nettoyage : champs tronqués, types forcés, valeurs hors limites écartées, identifiants uniques', () => {
  const c = { ...clientVide(), id: 'c1', nom: 'x'.repeat(500), type: 'bizarre' };
  const brut = { format: FORMAT, cree: 'n’importe quoi', clients: [c, { ...c }, null, 42], documents: [{ id: 'd1', clientId: 'c1', statut: 'hack', doc: { type: 'facture', lignes: [{ desc: '<img src=x onerror=alert(1)>', qty: '1', prix: '10' }] }, paiements: [{ date: '2026-01-02', montant: 5000, mode: 'cb' }, { date: 'x', montant: 1 }, { date: '2026-01-03', montant: -5 }, { date: '2026-01-03', montant: 2 ** 60 }] }],
    encaissements: [{ date: '2026-02-01', montant: 1000, origine: 'A' }, { date: '2026-02-01', montant: 0 }, { date: '2026-13-01', montant: 5 }], profil: { activite: 'inconnue', periodicite: 'jamais', rappels: [1, 99, 7, 7] } };
  const r = nettoyerEtat(brut, AUJ);
  assert.equal(r.cree, AUJ); assert.equal(r.clients.length, 1); assert.equal(r.clients[0].nom.length, 120); assert.equal(r.clients[0].type, 'pro');
  assert.equal(r.documents[0].statut, 'brouillon'); assert.equal(r.documents[0].paiements.length, 1); assert.equal(r.documents[0].doc.lignes[0].desc, '<img src=x onerror=alert(1)>');
  assert.equal(r.encaissements.length, 1); assert.equal(r.profil.activite, 'bic_services'); assert.equal(r.profil.periodicite, 'mois'); assert.deepEqual(r.profil.rappels, [7, 1]);
});
test('chiffrement : aller-retour, mauvais mot de passe, fichier altéré, mot de passe trop court', async () => {
  const clair = JSON.stringify({ secret: 'données de Gabin' });
  const c = await chiffrer(clair, 'un-bon-mot-de-passe', 100_000);
  assert.ok(estChiffre(c)); assert.ok(!c.includes('Gabin')); assert.equal(await dechiffrer(c, 'un-bon-mot-de-passe'), clair);
  await assert.rejects(dechiffrer(c, 'mauvais-mot-de-passe'), /incorrect/);
  const o = JSON.parse(c); o.data = o.data.slice(0, -4) + 'AAAA'; await assert.rejects(dechiffrer(JSON.stringify(o), 'un-bon-mot-de-passe'), /incorrect|abîmé/);
  await assert.rejects(chiffrer('x', 'court'), /8 caractères/); await assert.rejects(dechiffrer('{}', 'abcdefgh'), /pas une sauvegarde chiffrée/);
  const deux = await chiffrer(clair, 'un-bon-mot-de-passe', 100_000); assert.notEqual(JSON.parse(c).sel, JSON.parse(deux).sel); assert.notEqual(JSON.parse(c).data, JSON.parse(deux).data);
});

import { creerStore } from '../../public/espace/js/store.js';
import { stockageMemoire } from '../../public/espace/js/stockage.js';
test('store : rien d’écrit avant la création, enregistrement regroupé, rechargement, effacement', async () => {
  const mem = stockageMemoire(); const s = creerStore({ stockage: mem, aujourdhui: () => AUJ });
  assert.equal(await s.charger(), 'vide'); assert.equal(await mem.lire(), null);
  await s.creer(); assert.ok(await mem.lire());
  s.modifier((e) => { e.clients.push({ id: 'c1', nom: 'Test' }); }); s.modifier((e) => { e.clients[0].nom = 'Test 2'; });
  await s.vider(); const s2 = creerStore({ stockage: mem, aujourdhui: () => AUJ });
  assert.equal(await s2.charger(), 'ok'); assert.equal(s2.etat.clients[0].nom, 'Test 2');
  await s2.effacer(); assert.equal(await mem.lire(), null); assert.equal(s2.etat, null);
  assert.equal(await creerStore({ stockage: stockageMemoire('pas du json'), aujourdhui: () => AUJ }).charger(), 'abime');
});
