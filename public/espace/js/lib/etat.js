// Sauvegarde explicite (navigateur ou fichier JSON) : tout ce qui entre est nettoyé champ par champ avant d'être utilisé.
import { docVide, ligneVide, TYPES, NATURES, MAX_LIGNES } from './facture.js';

export const CLE = 'compta:facture:v1';
export const FORMAT = 'compta-by-glsc-facture-1';
const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v) => v === true;
const choix = (v, liste, def) => (liste.includes(v) ? v : def);

export function nettoyerDoc(brut, aujourdhui) {
  const d = docVide(aujourdhui), r = brut && typeof brut === 'object' ? brut : {};
  const e = r.emetteur ?? {}, c = r.client ?? {}, g = r.reglement ?? {};
  d.type = choix(r.type, Object.keys(TYPES), d.type);
  d.numero = txt(r.numero, 40); d.dateEmission = txt(r.dateEmission, 10) || aujourdhui; d.datePrestation = txt(r.datePrestation, 10);
  d.reference = txt(r.reference, 40); d.bonCommande = txt(r.bonCommande, 40); d.nature = choix(r.nature, Object.keys(NATURES), 'services'); d.objet = txt(r.objet, 160);
  for (const k of ['nom', 'nomCommercial', 'adresse', 'cp', 'ville', 'email', 'tel', 'siren', 'siret', 'iban', 'bic', 'banque']) d.emetteur[k] = txt(e[k], k === 'adresse' ? 160 : 120);
  d.emetteur.assurance = txt(e.assurance, 300); d.emetteur.enCours = bool(e.enCours); d.emetteur.associationAgreee = bool(e.associationAgreee);
  d.client.type = choix(c.type, ['pro', 'particulier'], 'pro');
  for (const k of ['nom', 'adresse', 'cp', 'ville', 'siren', 'tvaIntra', 'adresseLivraison', 'mediateur']) d.client[k] = txt(c[k], k === 'adresse' || k === 'adresseLivraison' || k === 'mediateur' ? 300 : 120);
  d.lignes = (Array.isArray(r.lignes) ? r.lignes : []).slice(0, MAX_LIGNES).map((l) => ({ desc: txt(l?.desc, 300), qty: txt(l?.qty, 12) || '1', unite: txt(l?.unite, 20), prix: txt(l?.prix, 20), remise: txt(l?.remise, 8) }));
  if (!d.lignes.length) d.lignes = [ligneVide()];
  d.reglement = { delai: txt(g.delai, 4) || '30', penalites: choix(g.penalites, ['bce', 'legal3', 'fixe'], 'bce'), tauxFixe: txt(g.tauxFixe, 8) };
  d.validiteJours = txt(r.validiteJours, 4) || '30'; d.acomptePct = txt(r.acomptePct, 3) || '30';
  d.acomptes = (Array.isArray(r.acomptes) ? r.acomptes : []).slice(0, 10).map((a) => ({ numero: txt(a?.numero, 40), montant: txt(a?.montant, 20) }));
  if (!d.acomptes.length) d.acomptes = [{ numero: '', montant: '' }];
  d.tvaMention = choix(r.tvaMention, ['cibs', 'cgi'], 'cibs'); d.garantieConformite = bool(r.garantieConformite); d.notes = txt(r.notes, 1000);
  return d;
}

/** État complet : émetteur à conserver, modèles de lignes et documents enregistrés. */
export function nettoyerEtat(brut, aujourdhui) {
  const r = brut && typeof brut === 'object' ? brut : {};
  const docs = (Array.isArray(r.documents) ? r.documents : []).slice(0, 200).map((x) => nettoyerDoc(x, aujourdhui));
  const modeles = (Array.isArray(r.modeles) ? r.modeles : []).slice(0, 50).map((m) => ({ desc: txt(m?.desc, 300), unite: txt(m?.unite, 20), prix: txt(m?.prix, 20) })).filter((m) => m.desc);
  return { format: FORMAT, emetteur: nettoyerDoc({ emetteur: r.emetteur }, aujourdhui).emetteur, modeles, documents: docs };
}
export const exporterEtat = (etat) => JSON.stringify({ ...etat, format: FORMAT }, null, 2);
export function importerEtat(texte, aujourdhui) {
  if (typeof texte !== 'string' || texte.length > 2_000_000) throw new Error('Fichier trop volumineux.');
  let brut; try { brut = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas un JSON valide.'); }
  if (!brut || brut.format !== FORMAT) throw new Error('Ce fichier ne vient pas de Compta by glsc (outil devis et factures).');
  return nettoyerEtat(brut, aujourdhui);
}
