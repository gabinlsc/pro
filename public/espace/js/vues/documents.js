// Liste des documents : devis, factures, acomptes, avoirs, avec filtres et recherche.
import { h, eur, dateFr, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton, vide, statutPastille } from '../composants.js';
import { TYPES } from '../lib/facture.js';
import { totalDocument, clientDe, estEnRetard } from '../stats.js';

const FILTRES = [['tous', 'Tous'], ['devis', 'Devis'], ['factures', 'Factures'], ['avoir', 'Avoirs'], ['retard', 'En retard']];
export function documents({ store, regles, auj, nettoyer }) {
  const page = h('div', { class: 'page' }); let filtre = 'tous', q = '';
  const zone = h('div', {});
  const onglets = h('div', { class: 'onglets', role: 'tablist', 'aria-label': 'Type de document' }, FILTRES.map(([cle, lib]) => h('button', { type: 'button', role: 'tab', class: 'onglet', 'aria-selected': cle === filtre ? 'true' : 'false', dataset: { f: cle }, onclick: () => { filtre = cle; maj(); } }, lib)));
  const recherche = h('input', { type: 'search', class: 'recherche', placeholder: 'Rechercher par numéro, client, objet…', 'aria-label': 'Rechercher un document', oninput: (e) => { q = e.target.value.toLowerCase(); maj(); } });
  function maj() {
    const etat = store.etat;
    for (const b of onglets.children) b.setAttribute('aria-selected', b.dataset.f === filtre ? 'true' : 'false');
    const items = etat.documents.filter((d) => {
      const t = d.doc.type;
      if (filtre === 'devis' && t !== 'devis') return false; if (filtre === 'factures' && !['facture', 'acompte', 'solde'].includes(t)) return false; if (filtre === 'avoir' && t !== 'avoir') return false; if (filtre === 'retard' && !estEnRetard(d, regles, auj)) return false;
      return !q || `${d.doc.numero} ${clientDe(etat, d)?.nom ?? d.doc.client.nom} ${d.doc.objet}`.toLowerCase().includes(q);
    }).sort((a, b) => b.doc.dateEmission.localeCompare(a.doc.dateEmission) || b.doc.numero.localeCompare(a.doc.numero));
    remplacer(zone, !etat.documents.length ? vide('file', 'Aucun document', 'Créez votre premier devis ou votre première facture : les mentions obligatoires sont ajoutées pour vous.', [bouton('Nouvelle facture', { icon: 'plus', href: '#/documents/nouveau?type=facture' }), bouton('Nouveau devis', { icon: 'file', style: 'ghost', href: '#/documents/nouveau?type=devis' })])
      : !items.length ? vide('search', 'Aucun document', 'Aucun document ne correspond à ce filtre.')
      : h('div', { class: 'tableau-doc', role: 'list' }, items.map((d) => h('a', { class: 'ligne-doc', role: 'listitem', href: `#/documents/${d.id}` },
        h('span', { class: 'ld-ico' }, icone(d.doc.type === 'devis' ? 'file' : d.doc.type === 'avoir' ? 'repeat' : 'receipt')),
        h('span', { class: 'ld-texte' }, h('strong', {}, d.doc.numero || 'Sans numéro'), h('small', {}, `${TYPES[d.doc.type].titre} · ${clientDe(etat, d)?.nom || d.doc.client.nom || 'Sans client'}`)),
        h('span', { class: 'ld-date' }, dateFr(d.doc.dateEmission)), statutPastille(d, regles, auj), h('span', { class: 'ld-montant' }, eur(totalDocument(d, regles, auj)))))));
  }
  page.append(entete('Documents', 'Devis, factures et avoirs', [bouton('Nouvelle facture', { icon: 'plus', href: '#/documents/nouveau?type=facture' }), bouton('Nouveau devis', { icon: 'file', style: 'ghost', href: '#/documents/nouveau?type=devis' })]), onglets, recherche, zone);
  maj(); nettoyer(store.abonner(maj));
  return page;
}
