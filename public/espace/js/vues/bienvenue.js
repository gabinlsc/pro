// Premier écran : l'espace n'existe pas encore. Rien n'est enregistré avant un clic.
import { h, $, toast, dialogue, champ, choisirFichier } from '../ui.js';
import { icone } from '../icones.js';
import { dechiffrer, estChiffre } from '../crypto.js';
import { importer } from '../donnees.js';
import { aujourdhui } from '../lib/dates.js';

export async function lireSauvegarde(texte, demanderMotDePasse) {
  let clair = texte;
  if (estChiffre(texte)) {
    const mdp = await demanderMotDePasse(); if (mdp === null) return null;
    clair = await dechiffrer(texte, mdp);
  }
  return importer(clair, aujourdhui());
}
export async function demanderMdp(titre = 'Mot de passe de la sauvegarde') {
  let champMdp;
  const r = await dialogue({ titre, contenu: (fermer) => { champMdp = champ({ label: 'Mot de passe', nom: 'mdp', type: 'password', attrs: { autocomplete: 'off', autofocus: '' } }); return h('form', { onsubmit: (e) => { e.preventDefault(); fermer(champMdp.querySelector('input').value); } }, champMdp); }, boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Ouvrir', action: () => champMdp.querySelector('input').value }] });
  return r;
}

export function bienvenue({ store, statut, ouvrir }) {
  const points = [['lock', 'Rien ne quitte votre navigateur', 'Pas de compte, pas de serveur, pas de cookie.'], ['file', 'Devis, factures, encaissements', 'Les règles officielles sont appliquées pour vous.'], ['calendar', 'Vos échéances au bon moment', 'Déclarations, CFE : rien ne vous échappe.']];
  const messages = {
    indisponible: 'Votre navigateur bloque le stockage local (navigation privée ou réglage strict). Autorisez-le pour utiliser l’espace.',
    abime: 'Les données enregistrées dans ce navigateur sont illisibles. Importez une sauvegarde pour repartir de là.',
  };
  const creer = async (btn) => { btn.disabled = true; await store.creer(); toast('Votre espace est prêt.'); ouvrir(); };
  const importerFichier = async () => {
    const f = await choisirFichier('.json,application/json'); if (!f) return;
    try { const etat = await lireSauvegarde(f.texte, () => demanderMdp()); if (!etat) return; await store.creer(etat); toast('Sauvegarde importée.'); ouvrir(); } catch (e) { toast(e.message, 'erreur'); }
  };
  const btnCreer = h('button', { class: 'btn grand', type: 'button', disabled: statut === 'indisponible', onclick: (e) => creer(e.currentTarget) }, icone('sparkles'), h('span', {}, 'Créer mon espace'));
  return h('main', { class: 'bienvenue' },
    h('div', { class: 'bienvenue-in' },
      h('p', { class: 'marque-grande' }, h('img', { src: '/assets/favicon.svg', alt: '', width: 48, height: 48 }), h('span', {}, 'GLSC ', h('small', {}, 'Pro'))),
      h('h1', {}, 'Votre espace de travail d’indépendant'),
      h('p', { class: 'lead' }, 'Clients, devis, factures, encaissements, échéances. Simple, gratuit, et chez vous.'),
      messages[statut] ? h('p', { class: 'alerte attention', role: 'alert' }, icone('alert'), messages[statut]) : null,
      h('div', { class: 'actions' }, btnCreer, h('button', { class: 'btn ghost grand', type: 'button', onclick: importerFichier }, icone('upload'), h('span', {}, 'Importer une sauvegarde'))),
      h('p', { class: 'aide' }, 'En cliquant sur « Créer mon espace », vos données sont enregistrées dans ce navigateur (IndexedDB), sur cet appareil uniquement. Exportez-les régulièrement : vider les données du site les efface.'),
      h('ul', { class: 'points' }, points.map(([i, t, d]) => h('li', {}, h('span', { class: 'bulle' }, icone(i)), h('div', {}, h('strong', {}, t), h('p', {}, d)))))));
}
