// Petits outils d'interface. Règle de sécurité : tout texte affiché passe par textContent ; jamais d'innerHTML.
import { icone } from './icones.js';
import { formaterEuros } from './lib/money.js';
import { dateLongue, MOIS_FR } from './lib/dates.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of enfants.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const espaces = (t) => t.replace(/\u202f/g, '\u00a0');
export const eur = (c) => espaces(formaterEuros(c, { decimales: 2 }));
export const eurCourt = (c) => espaces(formaterEuros(c, { decimales: 'auto' }));
/** Remplace le contenu d'un élément en ignorant null, false et les tableaux imbriqués (replaceChildren écrirait « null » dans la page). */
export const remplacer = (el, ...enfants) => { el.replaceChildren(...enfants.flat(Infinity).filter((x) => x != null && x !== false)); };
export const dateFr = (iso) => (iso ? dateLongue(iso) : '');
export const dateCourte = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MOIS_FR[Number(iso.slice(5, 7)) - 1].slice(0, 4)}${MOIS_FR[Number(iso.slice(5, 7)) - 1].length > 4 ? '.' : ''} ${iso.slice(0, 4)}` : '');
export const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ---- annonces et notifications
let zone;
export function toast(message, type = 'ok') {
  zone ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${type}` }, icone(type === 'erreur' ? 'alert' : 'check'), h('span', {}, message));
  zone.append(t); setTimeout(() => { t.classList.add('sort'); setTimeout(() => t.remove(), 300); }, type === 'erreur' ? 6000 : 3200);
}

// ---- fenêtres de dialogue (élément <dialog> natif : focus piégé, Échap, aria)
export function dialogue({ titre, contenu, boutons = [], large = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `dialogue${large ? ' large' : ''}`, 'aria-labelledby': 'dlg-titre' });
    const fermer = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const corps = typeof contenu === 'function' ? contenu(fermer, dlg) : contenu;
    dlg.append(h('header', {}, h('h2', { id: 'dlg-titre' }, titre), h('button', { type: 'button', class: 'icone-btn', 'aria-label': 'Fermer', onclick: () => fermer(null) }, icone('x'))), h('div', { class: 'dialogue-corps' }, corps),
      boutons.length ? h('footer', {}, boutons.map((b) => h('button', { type: 'button', class: `btn ${b.style ?? ''}`, onclick: async () => { if (b.action) { const r = await b.action(); if (r === false) return; fermer(r ?? b.valeur ?? true); } else fermer(b.valeur ?? true); } }, b.icone ? icone(b.icone) : null, b.libelle))) : null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); fermer(null); });
    document.body.append(dlg); dlg.showModal();
    (dlg.querySelector('[autofocus], input, select, textarea') ?? dlg.querySelector('button'))?.focus();
  });
}
export const confirmer = (titre, message, { libelle = 'Confirmer', danger = false } = {}) =>
  dialogue({ titre, contenu: h('p', {}, message), boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: false }, { libelle, style: danger ? 'danger' : '', valeur: true }] }).then((v) => v === true);

// ---- champs de formulaire (étiquette liée, aide, message d'erreur)
let compteur = 0;
export function champ({ label, nom, type = 'text', valeur = '', options = null, aide = '', requis = false, attrs = {}, large = false, oninput }) {
  const id = `c${++compteur}`;
  let el;
  if (options) el = h('select', { id, name: nom, ...attrs }, options.map(([v, l]) => h('option', { value: v, selected: v === valeur }, l)));
  else if (type === 'textarea') { el = h('textarea', { id, name: nom, rows: 3, ...attrs }); el.value = valeur ?? ''; }
  else { el = h('input', { id, name: nom, type, ...attrs }); el.value = valeur ?? ''; }
  if (requis) el.setAttribute('required', '');
  if (oninput) el.addEventListener('input', oninput);
  const aideId = aide ? `${id}-aide` : null; if (aideId) el.setAttribute('aria-describedby', aideId);
  return h('div', { class: `champ${large ? ' large' : ''}` }, h('label', { for: id }, label, requis ? h('span', { class: 'requis', 'aria-hidden': 'true' }, ' *') : null), el, aide ? h('p', { class: 'aide', id: aideId }, aide) : null);
}
export function coche({ label, nom, valeur = false, aide = '', oninput }) {
  const id = `c${++compteur}`; const el = h('input', { id, name: nom, type: 'checkbox' }); el.checked = !!valeur; if (oninput) el.addEventListener('input', oninput);
  return h('div', { class: 'champ coche' }, h('label', { for: id }, el, h('span', {}, label)), aide ? h('p', { class: 'aide' }, aide) : null);
}
export function marquerErreur(el, message) {
  const parent = el.closest('.champ'); parent?.querySelector('.champ-erreur')?.remove(); el.removeAttribute('aria-invalid');
  if (!message) return;
  const id = `${el.id}-err`; el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id); parent?.append(h('p', { class: 'champ-erreur', id }, message));
}

// ---- fichiers
export function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = h('a', { href: url, download: nom }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function choisirFichier(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, class: 'sr-only', tabindex: '-1' });
    input.addEventListener('change', async () => { const f = input.files[0]; input.remove(); resolve(f ? { nom: f.name, texte: await f.text() } : null); });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input); input.click();
  });
}
export const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.vider = () => { clearTimeout(t); }; f.maintenant = (...a) => { clearTimeout(t); fn(...a); }; return f; };

export function svgEl(tag, attrs = {}, ...enfants) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of enfants.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
