// Éditeur de devis, factures, acomptes, soldes et avoirs : formulaire, aperçu en direct, statuts, paiements, conversion, impression.
import { h, eur, dateFr, dialogue, champ, coche, confirmer, marquerErreur, debounce, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { bouton, statutPastille } from '../composants.js';
import { feuille } from '../feuille.js';
import { analyser, docVide, ligneVide, proposerNumero, TYPES, NATURES, MAX_LIGNES } from '../lib/facture.js';
import { parseMontant } from '../lib/money.js';
import { MODES } from '../lib/livre.js';
import { nettoyerDocument, nouvelId } from '../donnees.js';
import { numerosExistants, totalDocument, totalPaye, resteAPayer, FACTURANTS, estEnRetard, joursDeRetard } from '../stats.js';
import { editerClient } from './clients.js';

const lireChemin = (o, chemin) => chemin.split('.').reduce((a, k) => a?.[k], o);
const ecrireChemin = (o, chemin, v) => { const p = chemin.split('.'); const dernier = p.pop(); p.reduce((a, k) => a[k], o)[dernier] = v; };
const ORDRE_TYPES = ['facture', 'devis', 'acompte', 'solde', 'avoir'];

export function document({ store, regles, auj, params, requete, naviguer, nettoyer, toast }) {
  const etat = store.etat;
  const page = h('div', { class: 'page page-doc' });
  let doc, enregistre = false;
  if (params[0] === 'nouveau') {
    const p = etat.profil, d = docVide(auj), type = ORDRE_TYPES.includes(requete.get('type')) ? requete.get('type') : 'facture';
    Object.assign(d, { type, emetteur: { ...p.emetteur }, tvaMention: p.tvaMention, reglement: { delai: p.delai, penalites: p.penalites, tauxFixe: p.tauxFixe } });
    doc = { id: nouvelId(), clientId: '', doc: d, statut: 'brouillon', paiements: [], envoyeLe: '', cree: auj, modifie: auj, origine: '' };
    const cl = etat.clients.find((c) => c.id === requete.get('client')); if (cl) appliquerClient(cl);
    d.numero = proposerNumero(type, d.dateEmission, numerosExistants(etat));
  } else {
    doc = etat.documents.find((x) => x.id === params[0]); enregistre = true;
    if (!doc) { page.append(h('div', { class: 'vide' }, h('h1', {}, 'Document introuvable'), h('p', {}, 'Il a peut-être été supprimé.'), bouton('Retour aux documents', { href: '#/documents' }))); return page; }
  }
  function appliquerClient(c) { doc.clientId = c?.id ?? ''; Object.assign(doc.doc.client, { type: c?.type ?? 'pro', nom: c?.nom ?? '', adresse: c?.adresse ?? '', cp: c?.cp ?? '', ville: c?.ville ?? '', siren: c?.siren ?? '', tvaIntra: c?.tvaIntra ?? '' }); }
  const verrouille = () => doc.statut !== 'brouillon';
  let numeroAuto = params[0] === 'nouveau', touches = new Set(), apercuZone, erreursZone, totalZone, formZone, actionsZone;

  // ---- enregistrement
  const sauver = debounce(() => {
    doc.modifie = auj;
    store.modifier((e) => { const i = e.documents.findIndex((x) => x.id === doc.id); if (i >= 0) e.documents[i] = doc; else e.documents.push(doc); });
    if (!enregistre) { enregistre = true; history.replaceState(null, '', `#/documents/${doc.id}`); }
  }, 400);
  nettoyer(() => sauver.vider());
  nettoyer(() => { if (enregistre) sauver.maintenant(); });
  nettoyer(store.abonner(() => { if (!formZone?.isConnected) return; /* le formulaire garde l'état local */ }));

  // ---- aperçu et validation
  function maj() {
    const a = analyser(doc.doc, regles, auj);
    remplacer(apercuZone, feuille(a, doc.doc));
    const groupes = new Map(); for (const er of a.erreurs) if (!groupes.has(er.champ)) groupes.set(er.champ, er.message);
    remplacer(erreursZone, 
      a.erreurs.length ? h('div', { class: 'bilan erreur' }, h('p', { class: 'bilan-titre' }, icone('alert'), `${groupes.size} point${groupes.size > 1 ? 's' : ''} à compléter`),
        h('ul', {}, [...groupes].map(([champ, message]) => h('li', {}, champ.startsWith('emetteur') ? h('a', { href: '#/reglages' }, message) : message)))) : h('div', { class: 'bilan ok' }, h('p', { class: 'bilan-titre' }, icone('check'), 'Prêt à être envoyé')),
      a.avertissements.length ? h('ul', { class: 'avertissements' }, a.avertissements.map((t) => h('li', {}, t))) : null);
    for (const el of formZone.querySelectorAll('[name]')) marquerErreur(el, touches.has(el.name) || verrouille() ? groupes.get(el.name) ?? '' : '');
    totalZone.textContent = eur(a.total); return a;
  }
  const modifier = (chemin, valeur, structurel = false) => {
    ecrireChemin(doc.doc, chemin, valeur);
    if (numeroAuto && (chemin === 'dateEmission' || chemin === 'type')) doc.doc.numero = proposerNumero(doc.doc.type, doc.doc.dateEmission, numerosExistants(store.etat, doc.id));
    sauver(); if (structurel) { dessinerFormulaire(); } maj();
  };
  const input = (label, chemin, o = {}) => champ({ label, nom: chemin, valeur: lireChemin(doc.doc, chemin), ...o, oninput: (e) => { if (chemin === 'numero') numeroAuto = false; modifier(chemin, e.target.value, false); }, attrs: { ...(o.attrs ?? {}), disabled: verrouille() || undefined } });

  // ---- formulaire
  function dessinerFormulaire() {
    const d = doc.doc, t = d.type, bloc = (titre, icon, ...contenu) => h('section', { class: 'carte formu' }, h('h2', {}, icone(icon), titre), ...contenu);
    const clientSel = h('select', { id: 'sel-client', name: 'clientId', disabled: verrouille() || undefined, onchange: async (e) => {
      if (e.target.value === '__nouveau') { const c = await editerClient(store); if (c) { appliquerClient(c); sauver(); dessinerFormulaire(); maj(); } else e.target.value = doc.clientId; return; }
      appliquerClient(store.etat.clients.find((c) => c.id === e.target.value)); sauver(); dessinerFormulaire(); maj(); } },
      h('option', { value: '' }, 'Choisir un client…'), ...store.etat.clients.map((c) => h('option', { value: c.id, selected: c.id === doc.clientId }, c.nom)), verrouille() ? null : h('option', { value: '__nouveau' }, '+ Nouveau client…'));
    const lignes = h('div', { class: 'lignes' }, d.lignes.map((l, i) => h('fieldset', { class: 'ligne' }, h('legend', {}, `Ligne ${i + 1}`),
      champ({ label: 'Désignation', nom: `lignes.${i}.desc`, valeur: l.desc, attrs: { maxlength: 300, disabled: verrouille() || undefined }, large: true, oninput: (e) => modifier(`lignes.${i}.desc`, e.target.value) }),
      champ({ label: 'Quantité', nom: `lignes.${i}.qty`, valeur: l.qty, attrs: { inputmode: 'decimal', maxlength: 12, disabled: verrouille() || undefined }, oninput: (e) => modifier(`lignes.${i}.qty`, e.target.value) }),
      champ({ label: 'Unité', nom: `lignes.${i}.unite`, valeur: l.unite, attrs: { maxlength: 20, placeholder: 'jour, h…', disabled: verrouille() || undefined }, oninput: (e) => modifier(`lignes.${i}.unite`, e.target.value) }),
      champ({ label: 'Prix unitaire (€)', nom: `lignes.${i}.prix`, valeur: l.prix, attrs: { inputmode: 'decimal', maxlength: 20, disabled: verrouille() || undefined }, oninput: (e) => modifier(`lignes.${i}.prix`, e.target.value) }),
      champ({ label: 'Remise (%)', nom: `lignes.${i}.remise`, valeur: l.remise, attrs: { inputmode: 'decimal', maxlength: 8, disabled: verrouille() || undefined }, oninput: (e) => modifier(`lignes.${i}.remise`, e.target.value) }),
      !verrouille() && d.lignes.length > 1 ? bouton('Retirer', { icon: 'trash', style: 'ghost danger petit', onclick: () => { d.lignes.splice(i, 1); sauver(); dessinerFormulaire(); maj(); } }) : null)));
    remplacer(formZone, 
      bloc('Document', 'file',
        h('div', { class: 'grille-champs' },
          champ({ label: 'Type', nom: 'type', valeur: t, options: ORDRE_TYPES.map((k) => [k, TYPES[k].titre]), attrs: { disabled: verrouille() || undefined }, oninput: (e) => modifier('type', e.target.value, true) }),
          h('div', { class: 'champ' }, h('label', { for: 'sel-client' }, 'Client', h('span', { class: 'requis', 'aria-hidden': 'true' }, ' *')), clientSel),
          input('Numéro', 'numero', { requis: true, attrs: { maxlength: 30 }, aide: 'Suite chronologique et continue, sans trou.' }),
          input('Date d’émission', 'dateEmission', { type: 'date', requis: true }),
          ['facture', 'solde', 'acompte'].includes(t) ? input(t === 'acompte' ? 'Date de versement de l’acompte' : 'Date de la prestation ou de la livraison', 'datePrestation', { type: 'date', requis: true }) : null,
          input('Objet', 'objet', { attrs: { maxlength: 160 }, large: true }),
          t === 'avoir' || t === 'acompte' ? input(t === 'avoir' ? 'N° de la facture annulée ou corrigée' : 'N° du devis accepté', 'reference', { attrs: { maxlength: 40 }, requis: t === 'avoir' }) : null,
          input('Bon de commande du client', 'bonCommande', { attrs: { maxlength: 40 } }),
          champ({ label: 'Nature de l’opération', nom: 'nature', valeur: d.nature, options: Object.entries(NATURES).map(([k, v]) => [k, v[0].toUpperCase() + v.slice(1)]), attrs: { disabled: verrouille() || undefined }, oninput: (e) => modifier('nature', e.target.value) }))),
      bloc('Lignes', 'receipt', lignes, verrouille() ? null : bouton('Ajouter une ligne', { icon: 'plus', style: 'ghost petit', onclick: () => { if (d.lignes.length >= MAX_LIGNES) return; d.lignes.push(ligneVide()); sauver(); dessinerFormulaire(); maj(); setTimeout(() => formZone.querySelector(`[name="lignes.${d.lignes.length - 1}.desc"]`)?.focus(), 0); } }),
        t === 'acompte' ? input('Acompte (% du total)', 'acomptePct', { attrs: { inputmode: 'numeric', maxlength: 3 }, aide: 'Le montant est calculé sur le total des lignes ci-dessus.' }) : null,
        t === 'devis' ? input('Validité du devis (jours)', 'validiteJours', { attrs: { inputmode: 'numeric', maxlength: 3 } }) : null,
        t === 'solde' ? h('div', {}, h('h3', {}, 'Acomptes déjà facturés'), d.acomptes.map((a, i) => h('div', { class: 'grille-champs' }, input('N° de la facture d’acompte', `acomptes.${i}.numero`, { attrs: { maxlength: 40 } }), input('Montant (€)', `acomptes.${i}.montant`, { attrs: { inputmode: 'decimal', maxlength: 20 } }))), verrouille() ? null : bouton('Ajouter un acompte', { icon: 'plus', style: 'ghost petit', onclick: () => { d.acomptes.push({ numero: '', montant: '' }); sauver(); dessinerFormulaire(); maj(); } })) : null),
      FACTURANTS.includes(t) || t === 'devis' || t === 'avoir' ? bloc('Règlement et mentions', 'shield', h('div', { class: 'grille-champs' },
        FACTURANTS.includes(t) ? input('Délai de paiement (jours)', 'reglement.delai', { attrs: { inputmode: 'numeric', maxlength: 4 }, aide: 'Entre professionnels : 60 jours à compter de l’émission au maximum.' }) : null,
        FACTURANTS.includes(t) ? champ({ label: 'Pénalités de retard', nom: 'reglement.penalites', valeur: d.reglement.penalites, options: [['bce', 'Taux BCE majoré (par défaut)'], ['legal3', '3 fois le taux d’intérêt légal'], ['fixe', 'Taux fixe annuel']], attrs: { disabled: verrouille() || undefined }, oninput: (e) => modifier('reglement.penalites', e.target.value, true) }) : null,
        FACTURANTS.includes(t) && d.reglement.penalites === 'fixe' ? input('Taux annuel (%)', 'reglement.tauxFixe', { attrs: { inputmode: 'decimal', maxlength: 8 } }) : null,
        champ({ label: 'Mention de TVA', nom: 'tvaMention', valeur: d.tvaMention, options: [['cibs', 'Code des impositions sur les biens et services (CIBS)'], ['cgi', 'Code général des impôts, art. 293 B']], attrs: { disabled: verrouille() || undefined }, oninput: (e) => modifier('tvaMention', e.target.value) }),
        input('Notes imprimées en bas de page', 'notes', { type: 'textarea', attrs: { maxlength: 1000 }, large: true }))) : null,
      h('p', { class: 'aide emetteur-note' }, icone('user'), `Émetteur : ${d.emetteur.nom || 'à compléter'}. `, h('a', { href: '#/reglages' }, 'Modifier mon profil'), verrouille() ? null : [' · ', h('button', { class: 'lien', type: 'button', onclick: () => { Object.assign(doc.doc.emetteur, store.etat.profil.emetteur); sauver(); maj(); toast('Profil actualisé sur ce document.'); } }, 'Actualiser depuis mon profil')]));
    for (const el of formZone.querySelectorAll('[name]')) el.addEventListener('blur', () => { touches.add(el.name); maj(); });
  }

  // ---- actions selon le statut
  const ouvrirPaiement = async () => {
    const reste = resteAPayer(doc, regles, auj);
    const f = { date: champ({ label: 'Date d’encaissement', nom: 'date', type: 'date', valeur: auj, requis: true }), montant: champ({ label: 'Montant encaissé (€)', nom: 'montant', valeur: String(reste / 100).replace('.', ','), requis: true, attrs: { inputmode: 'decimal' } }), mode: champ({ label: 'Mode de règlement', nom: 'mode', valeur: 'virement', options: Object.entries(MODES) }) };
    const form = h('form', { class: 'formulaire', onsubmit: (e) => e.preventDefault() }, h('div', { class: 'grille-champs' }, Object.values(f)));
    const v = (k) => f[k].querySelector('input, select');
    const r = await dialogue({ titre: 'Enregistrer un paiement', contenu: form, boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Enregistrer', icone: 'check', action: () => {
      const m = parseMontant(v('montant').value); marquerErreur(v('montant'), m === null || m <= 0 ? 'Indiquez un montant supérieur à zéro.' : ''); marquerErreur(v('date'), v('date').value ? '' : 'Indiquez la date.');
      if (m === null || m <= 0 || !v('date').value) return false; return { date: v('date').value, montant: m, mode: v('mode').value }; } }] });
    if (!r) return;
    doc.paiements.push({ id: nouvelId(), ...r }); if (totalPaye(doc) >= totalDocument(doc, regles, auj)) doc.statut = 'paye'; sauver.maintenant(); dessiner(); toast('Paiement enregistré.');
  };
  const envoyer = async () => {
    const a = analyser(doc.doc, regles, auj);
    if (a.bloque) { for (const er of a.erreurs) touches.add(er.champ); maj(); toast('Complétez les points signalés avant de marquer le document comme envoyé.', 'erreur'); return; }
    if (!(await confirmer('Marquer comme envoyé ?', 'Le document ne sera plus modifiable (vous pourrez le rouvrir tant qu’aucun paiement n’est enregistré).', { libelle: 'Marquer comme envoyé' }))) return;
    doc.statut = 'envoye'; doc.envoyeLe = auj; sauver.maintenant(); dessiner(); toast('Document marqué comme envoyé.');
  };
  const nouveauDepuis = (type, extra = {}) => {
    const d = structuredClone(doc.doc); d.type = type; d.dateEmission = auj; d.datePrestation = ''; d.numero = proposerNumero(type, auj, numerosExistants(store.etat)); Object.assign(d, extra);
    const n = { id: nouvelId(), clientId: doc.clientId, doc: d, statut: 'brouillon', paiements: [], envoyeLe: '', cree: auj, modifie: auj, origine: doc.id };
    store.modifier((e) => e.documents.push(nettoyerDocument(n, auj))); naviguer(`/documents/${n.id}`);
  };
  const imprimer = () => {
    const a = analyser(doc.doc, regles, auj); if (a.bloque) { toast('Complétez le document avant de l’imprimer.', 'erreur'); for (const er of a.erreurs) touches.add(er.champ); maj(); return; }
    const t = document_.title; document_.title = `${TYPES[doc.doc.type].titre} ${doc.doc.numero}`; window.print(); setTimeout(() => { document_.title = t; }, 600);
  };
  const document_ = globalThis.document;
  const courriel = () => {
    const c = store.etat.clients.find((x) => x.id === doc.clientId), titre = TYPES[doc.doc.type].titre.toLowerCase();
    const sujet = `${TYPES[doc.doc.type].titre} ${doc.doc.numero}`, corps = `Bonjour,\n\nVeuillez trouver ci-joint ${doc.doc.type === 'avoir' ? 'l’avoir' : doc.doc.type === 'devis' ? 'le devis' : 'la facture'} ${doc.doc.numero} (${eur(totalDocument(doc, regles, auj))}).\n\nCordialement,\n${doc.doc.emetteur.nom}`;
    window.location.href = `mailto:${encodeURIComponent(c?.email ?? '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`; void titre;
  };
  function dessinerActions() {
    const t = doc.doc.type, total = totalDocument(doc, regles, auj), paye = totalPaye(doc), reste = resteAPayer(doc, regles, auj);
    const liste = [];
    if (!verrouille()) liste.push(bouton('Marquer comme envoyé', { icon: 'send', onclick: envoyer }));
    else {
      if (FACTURANTS.includes(t) && doc.statut === 'envoye') liste.push(bouton('Enregistrer un paiement', { icon: 'euro', onclick: ouvrirPaiement }));
      if (t === 'devis' && doc.statut === 'envoye') liste.push(bouton('Devis accepté', { icon: 'check', onclick: () => { doc.statut = 'accepte'; sauver.maintenant(); dessiner(); } }), bouton('Refusé', { style: 'ghost', icon: 'x', onclick: () => { doc.statut = 'refuse'; sauver.maintenant(); dessiner(); } }));
      if (t === 'devis' && ['envoye', 'accepte'].includes(doc.statut)) liste.push(bouton('Créer la facture', { icon: 'receipt', style: doc.statut === 'accepte' ? '' : 'ghost', onclick: async () => {
        const r = await dialogue({ titre: 'Créer à partir du devis', contenu: h('p', {}, `Devis ${doc.doc.numero} : quelle facture souhaitez-vous créer ?`), boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Facture d’acompte', style: 'ghost', valeur: 'acompte' }, { libelle: 'Facture complète', valeur: 'facture' }] });
        if (r) { if (doc.statut === 'envoye') { doc.statut = 'accepte'; sauver.maintenant(); } nouveauDepuis(r, { reference: doc.doc.numero }); }
      } }));
      if (['facture', 'solde', 'acompte'].includes(t) && doc.statut !== 'annule') liste.push(bouton('Créer un avoir', { icon: 'repeat', style: 'ghost', onclick: () => nouveauDepuis('avoir', { reference: doc.doc.numero }) }));
      liste.push(bouton('Dupliquer', { icon: 'copy', style: 'ghost', onclick: () => nouveauDepuis(t === 'avoir' ? 'avoir' : t, { reference: '' }) }));
      if (doc.statut === 'envoye' && !doc.paiements.length) liste.push(bouton('Rouvrir en brouillon', { icon: 'edit', style: 'ghost', onclick: async () => { if (await confirmer('Rouvrir en brouillon ?', 'À faire seulement si le document n’a pas encore été remis à votre client : une facture émise ne se modifie plus, on la corrige par un avoir.', { libelle: 'Rouvrir' })) { doc.statut = 'brouillon'; doc.envoyeLe = ''; sauver.maintenant(); dessiner(); } } }));
    }
    liste.push(bouton('Imprimer / PDF', { icon: 'printer', style: 'ghost', onclick: imprimer }), bouton('Envoyer par e-mail', { icon: 'mail', style: 'ghost', onclick: courriel }));
    if (!verrouille() || (t === 'devis' && !['accepte'].includes(doc.statut))) liste.push(bouton('Supprimer', { icon: 'trash', style: 'ghost danger', onclick: async () => {
      if (!(await confirmer('Supprimer ce document ?', 'Cette action est définitive.', { libelle: 'Supprimer', danger: true }))) return; store.modifier((e) => { e.documents = e.documents.filter((x) => x.id !== doc.id); }); enregistre = false; naviguer('/documents'); toast('Document supprimé.'); } }));
    remplacer(actionsZone, 
      h('div', { class: 'statut-ligne' }, statutPastille(doc, regles, auj), doc.envoyeLe ? h('small', {}, `Envoyé le ${dateFr(doc.envoyeLe)}`) : null, estEnRetard(doc, regles, auj) ? h('small', { class: 'a-payer' }, `${joursDeRetard(doc, regles, auj)} jours de retard`) : null),
      FACTURANTS.includes(t) && verrouille() ? h('div', { class: 'paiements' }, h('p', {}, h('span', {}, 'Payé'), h('b', {}, `${eur(paye)} / ${eur(total)}`)), reste ? h('p', {}, h('span', {}, 'Reste'), h('b', { class: 'a-payer' }, eur(reste))) : null,
        doc.paiements.length ? h('ul', { class: 'liste-lignes' }, doc.paiements.map((p) => h('li', {}, h('span', { class: 'l-titre' }, `${eur(p.montant)} · ${MODES[p.mode]}`, h('small', {}, dateFr(p.date))), h('button', { class: 'icone-btn', type: 'button', 'aria-label': `Supprimer le paiement du ${dateFr(p.date)}`, onclick: async () => { if (await confirmer('Supprimer ce paiement ?', 'Il disparaîtra aussi de vos recettes.', { libelle: 'Supprimer', danger: true })) { doc.paiements = doc.paiements.filter((x) => x.id !== p.id); if (doc.statut === 'paye' && totalPaye(doc) < total) doc.statut = 'envoye'; sauver.maintenant(); dessiner(); } } }, icone('trash'))))) : null) : null,
      h('div', { class: 'actions-doc' }, liste));
  }
  function dessiner() {
    const t = doc.doc.type;
    remplacer(page, 
      h('a', { class: 'retour', href: '#/documents' }, icone('arrow', 'ico ico-retour'), 'Documents'),
      h('header', { class: 'entete' }, h('div', {}, h('h1', {}, `${TYPES[t].titre} ${params[0] === 'nouveau' && !enregistre ? '' : doc.doc.numero}`.trim()), h('p', { class: 'sous' }, 'Total : ', totalZone = h('b', {}, eur(0))))),
      h('div', { class: 'doc-grille' }, h('div', { class: 'doc-gauche' }, actionsZone = h('section', { class: 'carte actions-carte' }), formZone = h('div', { class: 'formulaires' })), h('div', { class: 'doc-droite', tabindex: '0', role: 'region', 'aria-label': 'Aperçu du document' }, erreursZone = h('div', { class: 'erreurs-zone', role: 'status' }), apercuZone = h('div', { class: 'apercu' }))));
    dessinerFormulaire(); dessinerActions(); maj();
  }
  dessiner();
  return page;
}
