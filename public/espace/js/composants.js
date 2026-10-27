// Composants partagés : en-tête de page, pastilles de statut, jauge, histogramme, état vide.
import { h, svgEl, eurCourt, eur, majuscule } from './ui.js';
import { icone } from './icones.js';
import { MOIS_FR } from './lib/dates.js';
import { STATUTS } from './donnees.js';
import { estEnRetard, devisExpire } from './stats.js';

export const entete = (titre, sous = '', actions = []) => h('header', { class: 'entete' }, h('div', {}, h('h1', {}, titre), sous ? h('p', { class: 'sous' }, sous) : null), actions.length ? h('div', { class: 'entete-actions' }, actions) : null);
export const bouton = (libelle, { icon, style = '', onclick, href, type = 'button', attrs = {} } = {}) => {
  const contenu = [icon ? icone(icon) : null, h('span', {}, libelle)];
  return href ? h('a', { class: `btn ${style}`, href, ...attrs }, contenu) : h('button', { class: `btn ${style}`, type, onclick, ...attrs }, contenu);
};
export function statutPastille(d, regles, auj) {
  let cle = d.statut, libelle = STATUTS[d.statut];
  if (estEnRetard(d, regles, auj)) { cle = 'retard'; libelle = 'En retard'; } else if (devisExpire(d, regles, auj)) { cle = 'expire'; libelle = 'Expiré'; }
  return h('span', { class: `pastille st-${cle}` }, libelle);
}
export const vide = (iconeNom, titre, texte, actions = []) => h('div', { class: 'vide' }, h('span', { class: 'vide-ico' }, icone(iconeNom)), h('h2', {}, titre), h('p', {}, texte), actions.length ? h('div', { class: 'vide-actions' }, actions) : null);

export function jauge(part, libelle, detail = '') {
  const p = Math.max(0, Math.min(1, part ?? 0)), niveau = p >= 1 ? 'danger' : p >= 0.9 ? 'attention' : 'ok';
  return h('div', { class: `jauge ${niveau}` }, h('div', { class: 'jauge-piste', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100), 'aria-label': libelle }, h('span', { class: 'jauge-barre', 'data-largeur': Math.round(p * 100) })), detail ? h('p', { class: 'aide' }, detail) : null);
}
/** La largeur est posée après insertion pour que la barre se remplisse en douceur (la CSP interdit les attributs style en ligne : on passe par l'API CSSOM). */
export function animerJauges(racine) { for (const b of racine.querySelectorAll('.jauge-barre')) requestAnimationFrame(() => { b.style.width = `${b.dataset.largeur}%`; }); }

export function histogramme(valeurs, { libelle = 'Chiffre d’affaires par mois', moisCourant = -1 } = {}) {
  const L = 560, H = 190, bas = 28, haut = 14, max = Math.max(1, ...valeurs), pas = L / 12, l = pas * 0.58;
  const svg = svgEl('svg', { viewBox: `0 0 ${L} ${H}`, class: 'histo', role: 'img', 'aria-label': libelle });
  [0.5, 1].forEach((f) => svg.append(svgEl('line', { x1: 0, x2: L, y1: haut + (H - bas - haut) * (1 - f), y2: haut + (H - bas - haut) * (1 - f), class: 'histo-grille' })));
  valeurs.forEach((v, i) => {
    const hauteur = Math.max(v > 0 ? 3 : 0, (v / max) * (H - bas - haut)), x = i * pas + (pas - l) / 2;
    const g = svgEl('g', { class: `histo-col${i === moisCourant ? ' courant' : ''}` });
    g.append(svgEl('rect', { x, y: H - bas - hauteur, width: l, height: hauteur, rx: 5, class: 'histo-barre', style: undefined }), svgEl('title', {}, `${majuscule(MOIS_FR[i])} : ${eur(v)}`));
    g.append(svgEl('text', { x: x + l / 2, y: H - 8, class: 'histo-mois', 'text-anchor': 'middle' }, MOIS_FR[i].slice(0, 3)));
    svg.append(g);
  });
  return svg;
}
export const montantCourt = (c) => eurCourt(c);
