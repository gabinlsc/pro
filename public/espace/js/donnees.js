// Modèle de données de l'espace de travail : création, nettoyage champ par champ (tout ce qui entre par import ou par stockage passe ici) et sauvegarde.
import { docVide, TYPES } from './lib/facture.js';
import { nettoyerDoc } from './lib/etat.js';
import { ACTIVITES } from './lib/simulateur.js';
import { MODES } from './lib/livre.js';
import { dateIsoValide } from './lib/dates.js';

export const FORMAT = 'glsc-pro-espace-1';
export const STATUTS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', paye: 'Payé', annule: 'Annulé' };
export const LIMITES = { clients: 2000, documents: 5000, encaissements: 20000, paiements: 50 };
const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const choix = (v, liste, def) => (liste.includes(v) ? v : def);
const entier = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export const nouvelId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const profilVide = () => ({
  emetteur: docVide('2000-01-01').emetteur, activite: 'bic_services', periodicite: 'mois', debutActivite: '', delai: '30', penalites: 'bce', tauxFixe: '', tvaMention: 'cibs',
  options: { cfe: true, fe: true, options: false, ir: false }, rappels: [7, 1],
});
export const etatVide = (aujourdhui) => ({ format: FORMAT, cree: aujourdhui, profil: profilVide(), clients: [], documents: [], encaissements: [] });
export const clientVide = () => ({ id: nouvelId(), type: 'pro', nom: '', adresse: '', cp: '', ville: '', siren: '', tvaIntra: '', email: '', tel: '', notes: '' });

export function nettoyerClient(x) {
  if (!x || typeof x !== 'object') return null;
  const c = x;
  const r = { id: txt(c.id, 80) || nouvelId(), type: choix(c.type, ['pro', 'particulier'], 'pro') };
  for (const [k, m] of [['nom', 120], ['adresse', 160], ['cp', 12], ['ville', 80], ['siren', 20], ['tvaIntra', 20], ['email', 120], ['tel', 30], ['notes', 1000]]) r[k] = txt(c[k], m);
  return r;
}
export function nettoyerProfil(brut, aujourdhui) {
  const p = brut && typeof brut === 'object' ? brut : {}, base = profilVide(), o = p.options ?? {};
  return {
    emetteur: nettoyerDoc({ emetteur: p.emetteur }, aujourdhui).emetteur, activite: choix(p.activite, Object.keys(ACTIVITES), base.activite), periodicite: choix(p.periodicite, ['mois', 'trimestre'], 'mois'),
    debutActivite: dateIsoValide(p.debutActivite) ? p.debutActivite : '', delai: /^\d{1,3}$/.test(p.delai) ? p.delai : '30', penalites: choix(p.penalites, ['bce', 'legal3', 'fixe'], 'bce'), tauxFixe: txt(p.tauxFixe, 8),
    tvaMention: choix(p.tvaMention, ['cibs', 'cgi'], 'cibs'),
    options: { cfe: o.cfe !== false, fe: o.fe !== false, options: o.options === true, ir: o.ir === true },
    rappels: [...new Set((Array.isArray(p.rappels) ? p.rappels : base.rappels).filter((n) => [0, 1, 7].includes(n)))].sort((a, b) => b - a),
  };
}
const nettoyerPaiement = (x) => {
  const p = x && typeof x === 'object' ? x : {};
  if (!dateIsoValide(p.date) || !entier(p.montant, 1, 100_000_000_00)) return null;
  return { id: txt(p.id, 80) || nouvelId(), date: p.date, montant: p.montant, mode: choix(p.mode, Object.keys(MODES), 'virement') };
};
export function nettoyerDocument(x, aujourdhui) {
  if (!x || typeof x !== 'object') return null;
  const d = x;
  const doc = nettoyerDoc(d.doc, aujourdhui);
  return {
    id: txt(d.id, 80) || nouvelId(), clientId: txt(d.clientId, 80), doc, statut: choix(d.statut, Object.keys(STATUTS), 'brouillon'),
    paiements: (Array.isArray(d.paiements) ? d.paiements : []).slice(0, LIMITES.paiements).map(nettoyerPaiement).filter(Boolean),
    envoyeLe: dateIsoValide(d.envoyeLe) ? d.envoyeLe : '', cree: dateIsoValide(d.cree) ? d.cree : aujourdhui, modifie: dateIsoValide(d.modifie) ? d.modifie : aujourdhui,
    origine: txt(d.origine, 80), // identifiant du document dont celui-ci est issu (devis converti, avoir)
  };
}
export function nettoyerEncaissement(x) {
  if (!x || typeof x !== 'object') return null;
  const e = x;
  if (!dateIsoValide(e.date) || !entier(Math.abs(e.montant ?? 0), 1, 100_000_000_00) || !e.montant) return null;
  return { id: txt(e.id, 80) || nouvelId(), date: e.date, origine: txt(e.origine, 120), nature: txt(e.nature, 160), montant: e.montant, mode: choix(e.mode, Object.keys(MODES), 'virement'), piece: txt(e.piece, 60), global: e.global === true };
}
export function nettoyerEtat(brut, aujourdhui) {
  const r = brut && typeof brut === 'object' ? brut : {};
  const vus = new Set();
  const unique = (liste, f) => liste.map(f).filter((x) => x && !vus.has(x.id) && vus.add(x.id));
  const clients = unique((Array.isArray(r.clients) ? r.clients : []).slice(0, LIMITES.clients), nettoyerClient);
  const documents = unique((Array.isArray(r.documents) ? r.documents : []).slice(0, LIMITES.documents), (x) => nettoyerDocument(x, aujourdhui));
  const encaissements = unique((Array.isArray(r.encaissements) ? r.encaissements : []).slice(0, LIMITES.encaissements), nettoyerEncaissement);
  return { format: FORMAT, cree: dateIsoValide(r.cree) ? r.cree : aujourdhui, profil: nettoyerProfil(r.profil, aujourdhui), clients, documents, encaissements };
}
export const exporter = (etat) => JSON.stringify({ ...etat, format: FORMAT }, null, 2);
export function importer(texte, aujourdhui) {
  if (typeof texte !== 'string' || texte.length > 50_000_000) throw new Error('Fichier trop volumineux.');
  let brut; try { brut = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas un JSON valide.'); }
  if (!brut || brut.format !== FORMAT) throw new Error('Ce fichier ne vient pas de GLSC Pro.');
  return nettoyerEtat(brut, aujourdhui);
}
export { TYPES };
