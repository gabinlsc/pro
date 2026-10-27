// Échéances : déclarations du chiffre d'affaires, CFE, facturation électronique… avec rappels dans l'agenda (.ics).
import { h, dateFr, majuscule, telecharger, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton, vide } from '../composants.js';
import { genererEcheances, FIN_VALIDITE } from '../lib/echeances.js';
import { ajouterJours, ajouterMois, MOIS_FR } from '../lib/dates.js';
import { construireIcs } from '../lib/ics.js';
import { indicateurs } from '../stats.js';

export function echeances({ store, regles, auj, nettoyer, toast }) {
  const page = h('div', { class: 'page' });
  function dessiner() {
    const p = store.etat.profil, finBrute = ajouterJours(ajouterMois(auj, 12), -1), fin = finBrute > FIN_VALIDITE ? FIN_VALIDITE : finBrute;
    const r = genererEcheances({ periodicite: p.periodicite, debutActivite: p.debutActivite, depuis: auj, fin, options: p.options }, regles);
    const k = indicateurs(store.etat, regles, auj), per = k.periodeADeclarer;
    const telechargerIcs = () => {
      const n = new Date(), pad = (x) => String(x).padStart(2, '0'); const dtstamp = `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`;
      telecharger(`echeances-${auj}.ics`, construireIcs({ nom: 'Échéances micro-entrepreneur', description: 'Calendrier créé avec GLSC Pro. Dates lues sur service-public.gouv.fr.', evenements: r.evenements, dtstamp, domaine: location.hostname || 'pro.invalid', rappels: p.rappels }), 'text/calendar;charset=utf-8'); toast('Calendrier téléchargé : ouvrez-le pour l’ajouter à votre agenda.');
    };
    const groupes = new Map(); for (const ev of r.evenements) { const c = ev.date.slice(0, 7); (groupes.get(c) ?? groupes.set(c, []).get(c)).push(ev); }
    remplacer(page, 
      entete('Échéances', `${p.periodicite === 'mois' ? 'Déclaration mensuelle' : 'Déclaration trimestrielle'} · 12 prochains mois`, [bouton('Ajouter à mon agenda', { icon: 'download', onclick: telechargerIcs, attrs: r.erreurs.length || !r.evenements.length ? { disabled: '' } : {} }), bouton('Régler mes échéances', { icon: 'settings', style: 'ghost', href: '#/reglages' })]),
      per ? h('p', { class: 'alerte info', role: 'note' }, icone('info'), `Prochaine déclaration : ${per.libelle}, ${(per.total / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} encaissés, avant le ${dateFr(per.echeance)}.`) : null,
      r.erreurs.length ? vide('alert', 'Calendrier indisponible', r.erreurs.map((e) => e.message).join(' ')) : !r.evenements.length ? vide('calendar', 'Aucune échéance', 'Rien à signaler sur cette période.')
        : [...groupes].map(([c, evs]) => h('section', { class: 'mois-bloc' }, h('h2', {}, majuscule(MOIS_FR[Number(c.slice(5)) - 1]), ' ', c.slice(0, 4)), h('ul', { class: 'echeances' }, evs.map((ev) => h('li', { class: `echeance cat-${ev.categorie}` }, h('details', {}, h('summary', {}, h('time', { datetime: ev.date }, dateFr(ev.date)), h('span', { class: 'titre-ev' }, ev.titre)), h('p', {}, ev.description))))))),
      h('p', { class: 'aide' }, `Les règles sont vérifiées jusqu’au ${dateFr(FIN_VALIDITE)}.`));
  }
  dessiner(); nettoyer(store.abonner(dessiner));
  return page;
}
