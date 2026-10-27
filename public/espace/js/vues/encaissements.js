// Recettes : livre des recettes alimenté par les paiements des factures et par des saisies manuelles ; totaux par mois et par période de déclaration ; plafond ; export CSV.
import { h, eur, eurCourt, dateFr, dialogue, champ, confirmer, marquerErreur, telecharger, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton, vide, jauge, animerJauges, histogramme } from '../composants.js';
import { validerSaisie, MODES, exporterCsv, chronologie, totauxMensuels, total, totauxPeriodes, prochainePeriode, alertes } from '../lib/livre.js';
import { ACTIVITES } from '../lib/simulateur.js';
import { ecritures, etatLivre } from '../stats.js';
import { nettoyerEncaissement, nouvelId } from '../donnees.js';

export function encaissements({ store, regles, auj, nettoyer, toast }) {
  const page = h('div', { class: 'page' }); let annee = Number(auj.slice(0, 4));
  const ajouter = async () => {
    const f = {}; const form = h('form', { class: 'formulaire', onsubmit: (e) => e.preventDefault() }, h('div', { class: 'grille-champs' },
      f.date = champ({ label: 'Date d’encaissement', nom: 'date', type: 'date', valeur: auj, requis: true }), f.montant = champ({ label: 'Montant (€)', nom: 'montant', requis: true, attrs: { inputmode: 'decimal', autofocus: '' } }),
      f.origine = champ({ label: 'Origine (client ou société)', nom: 'origine', requis: true, attrs: { maxlength: 120 }, large: true }), f.nature = champ({ label: 'Nature', nom: 'nature', attrs: { maxlength: 160 }, large: true }),
      f.mode = champ({ label: 'Mode de règlement', nom: 'mode', valeur: 'virement', options: Object.entries(MODES) }), f.piece = champ({ label: 'Pièce justificative', nom: 'piece', attrs: { maxlength: 60 } })));
    const v = (k) => f[k].querySelector('input, select');
    const r = await dialogue({ titre: 'Ajouter une recette', contenu: form, large: true, boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Ajouter', icone: 'check', action: () => {
      const s = validerSaisie({ date: v('date').value, origine: v('origine').value, montant: v('montant').value, mode: v('mode').value, nature: v('nature').value, piece: v('piece').value });
      for (const k of ['date', 'origine', 'montant', 'mode']) marquerErreur(v(k), s.erreurs.find((e) => e.champ === k)?.message ?? '');
      if (s.erreurs.length) { form.querySelector('[aria-invalid="true"]')?.focus(); return false; } return s.entree; } }] });
    if (!r) return; const e = nettoyerEncaissement({ id: nouvelId(), ...r }); store.modifier((x) => x.encaissements.push(e)); toast('Recette ajoutée.');
  };
  function dessiner() {
    const etat = store.etat, livre = etatLivre(etat, regles, auj), liste = ecritures(etat, regles, auj), delAnnee = liste.filter((e) => e.date.startsWith(String(annee)));
    const annees = [...new Set([Number(auj.slice(0, 4)), ...liste.map((e) => Number(e.date.slice(0, 4)))])].sort((a, b) => b - a);
    const periodes = totauxPeriodes(livre, annee, regles), prochaine = periodes.length ? prochainePeriode(periodes, auj) : null;
    const act = ACTIVITES[etat.profil.activite], plafond = act ? regles.valeur(act.plafond) : null, ca = total(chronologie(livre, annee));
    const al = alertes(livre, annee, regles).filter((a) => a.niveau !== 'info');
    remplacer(page, 
      entete('Recettes', 'Votre livre des recettes, tenu pour vous', [bouton('Ajouter une recette', { icon: 'plus', onclick: ajouter }), bouton('Exporter en CSV', { icon: 'download', style: 'ghost', onclick: () => { telecharger(`livre-des-recettes-${annee}.csv`, exporterCsv(livre, annee), 'text/csv;charset=utf-8'); toast('Export téléchargé.'); } })]),
      h('div', { class: 'onglets', role: 'group', 'aria-label': 'Année' }, annees.map((a) => h('button', { type: 'button', class: 'onglet', 'aria-pressed': a === annee ? 'true' : 'false', onclick: () => { annee = a; dessiner(); } }, String(a)))),
      al.map((a) => h('p', { class: `alerte ${a.niveau}`, role: 'note' }, icone('alert'), a.texte)),
      h('div', { class: 'kpis trois' }, h('article', { class: 'kpi' }, h('p', { class: 'kpi-titre' }, `Encaissé en ${annee}`), h('p', { class: 'kpi-valeur' }, eur(ca))),
        h('article', { class: 'kpi' }, h('p', { class: 'kpi-titre' }, prochaine ? `À déclarer · ${prochaine.libelle}` : 'À déclarer'), h('p', { class: 'kpi-valeur' }, prochaine ? eur(prochaine.total) : '—'), prochaine ? h('p', { class: 'kpi-detail' }, `Avant le ${dateFr(prochaine.echeance)}`) : null),
        h('article', { class: 'kpi' }, h('p', { class: 'kpi-titre' }, 'Plafond annuel'), h('p', { class: 'kpi-valeur' }, plafond ? eurCourt(plafond * 100) : '—'), plafond ? jauge(ca / (plafond * 100), 'Part du plafond utilisée', `${Math.round(ca / (plafond * 100) * 100)} % utilisé`) : null)),
      h('div', { class: 'grille-2' }, h('section', { class: 'carte' }, h('h2', {}, 'Par mois'), histogramme(totauxMensuels(livre, annee), { moisCourant: annee === Number(auj.slice(0, 4)) ? Number(auj.slice(5, 7)) - 1 : -1 })),
        h('section', { class: 'carte' }, h('h2', {}, 'Par période de déclaration'), periodes.length ? h('ul', { class: 'liste-lignes' }, periodes.filter((p) => p.total || p.du <= auj).map((p) => h('li', {}, h('span', { class: 'l-titre' }, p.libelle, h('small', {}, `À déclarer avant le ${dateFr(p.echeance)}`)), h('span', { class: 'l-montant' }, eur(p.total))))) : vide('calendar', 'Périodes indisponibles', 'Une donnée réglementaire est en cours de vérification.'))),
      h('section', { class: 'carte' }, h('h2', {}, `Écritures ${annee}`), delAnnee.length ? h('div', { class: 'table-defilante' }, h('table', { class: 'tableau' }, h('thead', {}, h('tr', {}, ['Date', 'Origine', 'Nature', 'Mode', 'Montant', ''].map((t, i) => h('th', { scope: 'col', class: i === 4 ? 'num' : '' }, t)))),
        h('tbody', {}, delAnnee.map((e) => h('tr', {}, h('td', {}, dateFr(e.date)), h('td', {}, e.docId ? h('a', { href: `#/documents/${e.docId}` }, e.origine) : e.origine), h('td', {}, e.nature), h('td', {}, MODES[e.mode]), h('td', { class: `num${e.montant < 0 ? ' negatif' : ''}` }, eur(e.montant)),
          h('td', {}, e.docId ? h('span', { class: 'pastille st-auto' }, 'Facture') : h('button', { class: 'icone-btn', type: 'button', 'aria-label': `Supprimer la recette de ${e.origine} du ${dateFr(e.date)}`, onclick: async () => { if (await confirmer('Supprimer cette recette ?', 'Elle disparaîtra de votre livre.', { libelle: 'Supprimer', danger: true })) store.modifier((x) => { x.encaissements = x.encaissements.filter((y) => y.id !== e.id); }); } }, icone('trash'))))))))
        : vide('euro', 'Aucune recette cette année', 'Les paiements enregistrés sur vos factures arrivent ici tout seuls. Vous pouvez aussi ajouter une recette à la main.', [bouton('Ajouter une recette', { icon: 'plus', onclick: ajouter })])));
    animerJauges(page);
  }
  dessiner(); nettoyer(store.abonner(dessiner));
  return page;
}
