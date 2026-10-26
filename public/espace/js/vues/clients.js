// Clients : liste, fiche, création et modification.
import { h, eur, dialogue, champ, confirmer, dateFr, marquerErreur, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton, vide, statutPastille } from '../composants.js';
import { clientVide, nettoyerClient } from '../donnees.js';
import { sirenValide, emailValide } from '../lib/valid.js';
import { totalDocument, totalPaye, resteAPayer, FACTURANTS } from '../stats.js';

export function chiffresClient(etat, client, regles, auj) {
  const docs = etat.documents.filter((d) => d.clientId === client.id);
  const facture = docs.filter((d) => FACTURANTS.includes(d.doc.type) && !['brouillon', 'annule'].includes(d.statut));
  return { docs, facture: facture.reduce((a, d) => a + totalDocument(d, regles, auj), 0), paye: facture.reduce((a, d) => a + totalPaye(d), 0), reste: facture.reduce((a, d) => a + resteAPayer(d, regles, auj), 0) };
}
export async function editerClient(store, existant = null) {
  const c = existant ? { ...existant } : clientVide(); let champs = {};
  const f = h('form', { class: 'formulaire', novalidate: '', onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'grille-champs' },
      champs.type = champ({ label: 'Type de client', nom: 'type', valeur: c.type, options: [['pro', 'Professionnel (entreprise, association…)'], ['particulier', 'Particulier']], large: true }),
      champs.nom = champ({ label: 'Nom de l’entreprise ou nom complet', nom: 'nom', valeur: c.nom, requis: true, attrs: { maxlength: 120, autofocus: '' }, large: true }),
      champs.adresse = champ({ label: 'Adresse', nom: 'adresse', valeur: c.adresse, attrs: { maxlength: 160 }, large: true }),
      champs.cp = champ({ label: 'Code postal', nom: 'cp', valeur: c.cp, attrs: { maxlength: 12, inputmode: 'numeric' } }), champs.ville = champ({ label: 'Ville', nom: 'ville', valeur: c.ville, attrs: { maxlength: 80 } }),
      champs.siren = champ({ label: 'SIREN (9 chiffres)', nom: 'siren', valeur: c.siren, attrs: { maxlength: 14, inputmode: 'numeric' }, aide: 'Obligatoire sur les factures entre entreprises.' }), champs.tvaIntra = champ({ label: 'N° de TVA intracommunautaire', nom: 'tvaIntra', valeur: c.tvaIntra, attrs: { maxlength: 20 } }),
      champs.email = champ({ label: 'E-mail', nom: 'email', type: 'email', valeur: c.email, attrs: { maxlength: 120 } }), champs.tel = champ({ label: 'Téléphone', nom: 'tel', type: 'tel', valeur: c.tel, attrs: { maxlength: 30 } }),
      champs.notes = champ({ label: 'Notes (privées)', nom: 'notes', type: 'textarea', valeur: c.notes, attrs: { maxlength: 1000 }, large: true })));
  const val = (k) => champs[k].querySelector('input, select, textarea').value.trim();
  const sauver = () => {
    const nom = val('nom'), siren = val('siren'), email = val('email'); let ok = true;
    const verifier = (k, message) => { const el = champs[k].querySelector('input, select, textarea'); marquerErreur(el, message); if (message) { ok = false; } };
    verifier('nom', nom ? '' : 'Indiquez le nom du client.'); verifier('siren', !siren || sirenValide(siren) ? '' : 'Ce SIREN n’est pas valide (9 chiffres, clé de contrôle).'); verifier('email', !email || emailValide(email) ? '' : 'Cette adresse e-mail n’est pas valide.');
    if (!ok) { f.querySelector('[aria-invalid="true"]')?.focus(); return false; }
    const nouveau = nettoyerClient({ id: c.id, type: val('type'), nom, adresse: val('adresse'), cp: val('cp'), ville: val('ville'), siren, tvaIntra: val('tvaIntra'), email, tel: val('tel'), notes: val('notes') });
    store.modifier((e) => { const i = e.clients.findIndex((x) => x.id === c.id); if (i >= 0) e.clients[i] = nouveau; else e.clients.push(nouveau); });
    return nouveau;
  };
  const r = await dialogue({ titre: existant ? 'Modifier le client' : 'Nouveau client', contenu: f, boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Enregistrer', icone: 'check', action: sauver }] });
  return r && typeof r === 'object' ? r : null;
}

export function clients({ store, regles, auj, params, naviguer, nettoyer, toast }) {
  return params[0] ? fiche({ store, regles, auj, id: params[0], naviguer, nettoyer, toast }) : liste({ store, regles, auj, naviguer, nettoyer });
}
function liste({ store, regles, auj, naviguer, nettoyer }) {
  const page = h('div', { class: 'page' }); let q = '';
  const recherche = h('input', { type: 'search', placeholder: 'Rechercher un client…', 'aria-label': 'Rechercher un client', class: 'recherche', oninput: (e) => { q = e.target.value.toLowerCase(); dessinerListe(); } });
  const zone = h('div', {});
  const nouveau = async () => { const c = await editerClient(store); if (c) naviguer(`/clients/${c.id}`); };
  function dessinerListe() {
    const etat = store.etat;
    const items = etat.clients.filter((c) => !q || `${c.nom} ${c.ville} ${c.email}`.toLowerCase().includes(q)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    remplacer(zone, !etat.clients.length ? vide('users', 'Aucun client pour l’instant', 'Ajoutez vos clients pour les retrouver en un clic sur chaque devis et chaque facture.', [bouton('Ajouter un client', { icon: 'plus', onclick: nouveau })])
      : !items.length ? vide('search', 'Aucun résultat', 'Essayez avec un autre mot.')
      : h('ul', { class: 'cartes-liste' }, items.map((c) => { const k = chiffresClient(etat, c, regles, auj); return h('li', {}, h('a', { class: 'carte-client', href: `#/clients/${c.id}` }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, (c.nom[0] ?? '?').toUpperCase()), h('span', { class: 'cc-texte' }, h('strong', {}, c.nom), h('small', {}, [c.type === 'pro' ? 'Professionnel' : 'Particulier', c.ville].filter(Boolean).join(' · '))), h('span', { class: 'cc-chiffres' }, h('b', {}, eur(k.facture)), k.reste ? h('small', { class: 'a-payer' }, `${eur(k.reste)} à encaisser`) : h('small', {}, `${k.docs.length} document${k.docs.length > 1 ? 's' : ''}`)))); })));
  }
  page.append(entete('Clients', `${store.etat.clients.length} client${store.etat.clients.length > 1 ? 's' : ''}`, [bouton('Nouveau client', { icon: 'plus', onclick: nouveau })]), recherche, zone);
  dessinerListe(); nettoyer(store.abonner(dessinerListe));
  return page;
}
function fiche({ store, regles, auj, id, naviguer, nettoyer, toast }) {
  const page = h('div', { class: 'page' });
  const dessiner = () => {
    const etat = store.etat, c = etat.clients.find((x) => x.id === id);
    if (!c) { remplacer(page, vide('users', 'Client introuvable', 'Il a peut-être été supprimé.', [bouton('Retour aux clients', { href: '#/clients' })])); return; }
    const k = chiffresClient(etat, c, regles, auj);
    const info = (i, t) => (t ? h('li', {}, icone(i), h('span', {}, t)) : null);
    remplacer(page, 
      h('a', { class: 'retour', href: '#/clients' }, icone('arrow', 'ico ico-retour'), 'Clients'),
      entete(c.nom, c.type === 'pro' ? 'Client professionnel' : 'Client particulier', [bouton('Facture', { icon: 'plus', href: `#/documents/nouveau?type=facture&client=${c.id}` }), bouton('Devis', { icon: 'file', style: 'ghost', href: `#/documents/nouveau?type=devis&client=${c.id}` }),
        bouton('Modifier', { icon: 'edit', style: 'ghost', onclick: () => editerClient(store, c) }),
        bouton('Supprimer', { icon: 'trash', style: 'ghost danger', onclick: async () => {
          if (k.docs.length) { toast('Ce client a des documents : supprimez-les d’abord, ou conservez la fiche.', 'erreur'); return; }
          if (await confirmer('Supprimer ce client ?', `La fiche de ${c.nom} sera effacée.`, { libelle: 'Supprimer', danger: true })) { store.modifier((e) => { e.clients = e.clients.filter((x) => x.id !== id); }); naviguer('/clients'); toast('Client supprimé.'); }
        } })]),
      h('div', { class: 'kpis trois' }, [['Facturé', k.facture], ['Encaissé', k.paye], ['Reste à encaisser', k.reste]].map(([t, v]) => h('article', { class: 'kpi' }, h('p', { class: 'kpi-titre' }, t), h('p', { class: 'kpi-valeur' }, eur(v))))),
      h('div', { class: 'grille-2' },
        h('section', { class: 'carte' }, h('h2', {}, 'Coordonnées'), h('ul', { class: 'infos' }, info('pin', [c.adresse, `${c.cp} ${c.ville}`.trim()].filter(Boolean).join(', ')), info('mail', c.email), info('user', c.tel), info('building', c.siren && `SIREN ${c.siren}`), info('file', c.tvaIntra && `TVA ${c.tvaIntra}`), c.notes ? h('li', { class: 'notes' }, icone('edit'), h('span', {}, c.notes)) : null)),
        h('section', { class: 'carte' }, h('h2', {}, 'Documents'), k.docs.length ? h('ul', { class: 'liste-lignes' }, [...k.docs].sort((a, b) => b.doc.dateEmission.localeCompare(a.doc.dateEmission)).map((d) => h('li', {}, h('a', { href: `#/documents/${d.id}` }, h('span', { class: 'l-titre' }, `${d.doc.numero || 'Sans numéro'}`, h('small', {}, dateFr(d.doc.dateEmission))), statutPastille(d, regles, auj), h('span', { class: 'l-montant' }, eur(totalDocument(d, regles, auj))))))) : vide('file', 'Aucun document', 'Créez un devis ou une facture pour ce client.'))));
  };
  dessiner(); nettoyer(store.abonner(dessiner));
  return page;
}
