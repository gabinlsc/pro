// Documents d'exemple pour les tests de la facture électronique (partagés par les tests unitaires et par la validation externe).
import { docVide, creerRegles, analyser } from '../../public/espace/js/lib/facture.js';
import { readFileSync } from 'node:fs';

export const racine = new URL('../../public/espace/', import.meta.url).pathname;
export const regles = creerRegles(JSON.parse(readFileSync(racine + 'data/regles.json', 'utf8')).entrees);
export const AUJ = '2026-10-27';
export const base = (o = {}) => {
  const { client: _c, emetteur: _e, lignes: _l, ...reste } = o;
  const d = docVide(AUJ); Object.assign(d, { numero: 'F-2026-001', dateEmission: AUJ, datePrestation: '2026-10-20', objet: 'Site vitrine', ...reste });
  d.emetteur = { ...d.emetteur, nom: 'Gabin Lescoat', adresse: '1 rue du Test', cp: '35000', ville: 'Rennes', siren: '732829320', email: 'pro@glsc.fr', tel: '+33 7 00 00 00 00', iban: 'FR7630006000011234567890189', bic: 'BNPAFRPPXXX' };
  d.client = { ...d.client, nom: 'Atelier Lumière', adresse: '2 rue B', cp: '35000', ville: 'Rennes', siren: '552120222', ...(o.client ?? {}) };
  d.lignes = o.lignes ?? [{ desc: 'Création de site vitrine', qty: '1', unite: '', prix: '1200', remise: '' }];
  return d;
};
export const EXEMPLES = {
  simple: base(),
  'remise-et-unites': base({ numero: 'F-2026-002', lignes: [{ desc: 'Développement', qty: '3,5', unite: 'jour', prix: '450', remise: '12,5' }, { desc: 'Conseil', qty: '2', unite: 'h', prix: '80', remise: '' }, { desc: 'Licence annuelle', qty: '1', unite: 'an', prix: '99,99', remise: '' }] }),
  acompte: base({ type: 'acompte', numero: 'F-2026-003', reference: 'D-2026-001', acomptePct: '30', datePrestation: '2026-10-25', lignes: [{ desc: 'Application de commande', qty: '1', unite: '', prix: '4500', remise: '' }] }),
  solde: base({ type: 'solde', numero: 'F-2026-004', acomptes: [{ numero: 'F-2026-003', montant: '1350' }], lignes: [{ desc: 'Application de commande', qty: '1', unite: '', prix: '4500', remise: '' }] }),
  avoir: base({ type: 'avoir', numero: 'A-2026-001', reference: 'F-2026-001', lignes: [{ desc: 'Création de site vitrine', qty: '1', unite: '', prix: '200', remise: '' }] }),
  particulier: base({ numero: 'F-2026-005', client: { type: 'particulier', nom: 'Marie Dupont', siren: '', adresse: '3 rue C', cp: '35200', ville: 'Rennes' }, lignes: [{ desc: 'Cours particuliers', qty: '4', unite: 'h', prix: '35', remise: '' }] }),
  caracteres: base({ numero: 'F-2026-006', objet: 'Étude <A&B> "spéciale" — œuvres', client: { nom: 'Dupont & Fils <SARL>', adresse: '4 rue D', cp: '35000', ville: 'Rennes', siren: '552120222' }, lignes: [{ desc: 'Prestation « sur mesure » à 100 % — 5 € & plus <test>', qty: '1', unite: '', prix: '10', remise: '' }] }),
  'nom-commercial': base({ numero: 'F-2026-007' }),
  longue: base({ numero: 'F-2026-008', lignes: Array.from({ length: 55 }, (_, i) => ({ desc: `Ligne ${i + 1} : prestation de développement spécifique avec un libellé volontairement long pour vérifier le retour à la ligne et le saut de page`, qty: '1', unite: 'jour', prix: String(100 + i), remise: i % 5 === 0 ? '10' : '' })) }),
};
EXEMPLES['nom-commercial'].emetteur.nomCommercial = 'GLSC Studio';
export const analyse = (d) => analyser(d, regles, AUJ);
