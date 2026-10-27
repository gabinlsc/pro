// Point d'entrée : charge les données réglementaires et l'espace, affiche l'accueil, la navigation et la vue demandée par l'adresse (#/…).
import { creerRegles } from './lib/facture.js';
import { aujourdhui } from './lib/dates.js';
import { creerStore } from './store.js';
import { stockageNavigateur } from './stockage.js';
import { h, $, toast, remplacer } from './ui.js';
import { icone } from './icones.js';
import { bienvenue } from './vues/bienvenue.js';
import { accueil } from './vues/accueil.js';
import { clients } from './vues/clients.js';
import { documents } from './vues/documents.js';
import { document as documentVue } from './vues/document.js';
import { encaissements } from './vues/encaissements.js';
import { echeances } from './vues/echeances.js';
import { reglages } from './vues/reglages.js';

const racine = document.getElementById('racine');
const store = creerStore({ stockage: stockageNavigateur(), aujourdhui });
const NAV = [['/', 'Accueil', 'home'], ['/documents', 'Documents', 'file'], ['/clients', 'Clients', 'users'], ['/encaissements', 'Recettes', 'euro'], ['/echeances', 'Échéances', 'calendar'], ['/reglages', 'Réglages', 'settings']];
const ROUTES = [
  [/^\/$/, accueil, 'Accueil'], [/^\/clients$/, clients, 'Clients'], [/^\/clients\/([\w-]+)$/, clients, 'Fiche client'], [/^\/documents$/, documents, 'Documents'],
  [/^\/documents\/(nouveau|[\w-]+)$/, documentVue, 'Document'], [/^\/encaissements$/, encaissements, 'Recettes'], [/^\/echeances$/, echeances, 'Échéances'], [/^\/reglages$/, reglages, 'Réglages'],
];
let regles = null, nettoyage = [], chemin = '/';

async function chargerRegles() {
  const r = await fetch('/espace/data/regles.json'); if (!r.ok) throw new Error('Données réglementaires introuvables.');
  const d = await r.json(); return { regles: creerRegles(d.entrees), meta: d };
}
const cheminCourant = () => { const m = /^#(\/[^?]*)/.exec(location.hash); return m ? m[1].replace(/\/+$/, '') || '/' : '/'; };
const requeteCourante = () => new URLSearchParams((location.hash.split('?')[1] ?? ''));
export const naviguer = (c) => { location.hash = `#${c}`; };

function coque() {
  const lien = ([c, l, i]) => h('a', { href: `#${c}`, class: 'nav-lien', 'data-chemin': c }, icone(i), h('span', {}, l));
  return h('div', { class: 'coque' },
    h('aside', { class: 'barre' }, h('a', { class: 'marque', href: '#/' }, h('img', { src: '/assets/favicon.svg', alt: '', width: 36, height: 36 }), h('span', {}, 'GLSC ', h('small', {}, 'Pro'))),
      h('nav', { 'aria-label': 'Navigation principale' }, NAV.map(lien)), h('p', { class: 'barre-pied' }, icone('lock'), 'Vos données restent dans ce navigateur.')),
    h('main', { id: 'contenu', tabindex: '-1' }));
}

async function afficher() {
  if (!store.etat) return; // espace effacé : la page se recharge
  nettoyage.forEach((f) => f()); nettoyage = [];
  const c = cheminCourant(); chemin = c;
  const zone = $('#contenu'); if (!zone) return;
  const route = ROUTES.find(([re]) => re.test(c));
  for (const a of document.querySelectorAll('.nav-lien')) { const cible = a.dataset.chemin; a.toggleAttribute('aria-current', cible === '/' ? c === '/' : c === cible || c.startsWith(cible + '/')); if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const [, vue, titre] = route ?? [null, accueil, 'Accueil'];
  const params = route ? route[0].exec(c).slice(1) : [];
  document.title = `${titre} · GLSC Pro`;
  remplacer(zone);
  const ctx = { store, regles: regles.regles, meta: regles.meta, auj: aujourdhui(), params, requete: requeteCourante(), naviguer, nettoyer: (f) => nettoyage.push(f), toast, chemin: c };
  try { zone.append(await vue(ctx)); } catch (e) { console.error(e); zone.append(h('div', { class: 'vide' }, h('h1', {}, 'Oups'), h('p', {}, 'Cette page n’a pas pu s’afficher. Rechargez la page ; vos données sont intactes.'))); }
  zone.classList.remove('entre'); void zone.offsetWidth; zone.classList.add('entre');
  window.scrollTo(0, 0);
}

async function demarrer() {
  try { regles = await chargerRegles(); } catch { remplacer(racine, h('p', { class: 'chargement' }, 'Impossible de charger les données réglementaires. Rechargez la page.')); return; }
  const statut = await store.charger();
  if (statut !== 'ok') {
    remplacer(racine, bienvenue({ store, statut, ouvrir: demarrerEspace }));
    return;
  }
  demarrerEspace();
}
function demarrerEspace() {
  remplacer(racine, coque());
  window.addEventListener('hashchange', afficher);
  window.addEventListener('pagehide', () => store.vider());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.vider(); });
  if (!location.hash) history.replaceState(null, '', '#/');
  afficher();
}
demarrer();
