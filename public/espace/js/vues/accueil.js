// Tableau de bord : chiffre d'affaires, reste à encaisser, plafond, prochaine déclaration, relances.
import { h, eur, eurCourt, dateFr, majuscule, remplacer } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton, jauge, animerJauges, histogramme, vide, statutPastille } from '../composants.js';
import { indicateurs, clientDe, joursDeRetard, resteAPayer, totalDocument } from '../stats.js';
import { dateLongue, MOIS_FR } from '../lib/dates.js';

const salut = () => { const h24 = new Date().getHours(); return h24 < 5 ? 'Bonsoir' : h24 < 18 ? 'Bonjour' : 'Bonsoir'; };

export function accueil({ store, regles, auj, nettoyer }) {
  const conteneur = h('div', { class: 'page' });
  const dessiner = () => {
    const etat = store.etat, k = indicateurs(etat, regles, auj), nom = etat.profil.emetteur.nom.trim().split(/\s+/)[0];
    const profilOk = !!(etat.profil.emetteur.nom.trim() && etat.profil.emetteur.adresse.trim() && (etat.profil.emetteur.siren || etat.profil.emetteur.enCours));
    const etapes = [
      ['Compléter votre profil', 'Nom, adresse, SIREN : repris sur chaque document.', profilOk, '#/reglages', 'user'],
      ['Ajouter un premier client', 'Une fiche suffit pour gagner du temps ensuite.', etat.clients.length > 0, '#/clients', 'users'],
      ['Créer un premier document', 'Devis ou facture, avec toutes les mentions obligatoires.', etat.documents.length > 0, '#/documents/nouveau', 'file'],
    ];
    const debut = etapes.some((e) => !e[2]) && etat.documents.length < 2;
    const kpi = (icon, titre, valeur, detail, classe = '') => h('article', { class: `kpi ${classe}` }, h('span', { class: 'kpi-ico' }, icone(icon)), h('p', { class: 'kpi-titre' }, titre), h('p', { class: 'kpi-valeur' }, valeur), detail ? h('p', { class: 'kpi-detail' }, detail) : null);
    const per = k.periodeADeclarer;
    const bloc = (titre, ...contenu) => h('section', { class: 'carte' }, h('h2', {}, titre), ...contenu);
    remplacer(conteneur, 
      entete(`${salut()}${nom ? ` ${nom}` : ''}`, majuscule(dateLongue(auj)), [bouton('Nouvelle facture', { icon: 'plus', href: '#/documents/nouveau?type=facture' }), bouton('Nouveau devis', { style: 'ghost', icon: 'file', href: '#/documents/nouveau?type=devis' })]),
      k.alertes.filter((a) => a.niveau !== 'info').map((a) => h('p', { class: `alerte ${a.niveau}`, role: 'note' }, icone('alert'), a.texte)),
      debut ? h('section', { class: 'carte demarrage' }, h('h2', {}, 'Pour bien démarrer'), h('ol', { class: 'etapes' }, etapes.map(([t, d, fait, lien, i]) => h('li', { class: fait ? 'fait' : '' }, h('a', { href: lien }, h('span', { class: 'etape-ico' }, icone(fait ? 'check' : i)), h('span', {}, h('strong', {}, t), h('small', {}, d))))))) : null,
      h('div', { class: 'kpis' },
        kpi('euro', `Encaissé en ${k.annee}`, eurCourt(k.ca), k.plafond ? `${Math.round((k.partPlafond ?? 0) * 100)} % du plafond de ${eurCourt(k.plafond)}` : ''),
        kpi('clock', 'À encaisser', eurCourt(k.enAttente), k.retard.length ? `${k.retard.length} facture${k.retard.length > 1 ? 's' : ''} en retard` : 'Aucun retard', k.retard.length ? 'kpi-retard' : ''),
        kpi('calendar', per ? `À déclarer · ${per.libelle}` : 'À déclarer', per ? eurCourt(per.total) : '—', per ? `Avant le ${dateLongue(per.echeance)}` : 'Aucune période', ''),
        kpi('file', 'Devis en attente', String(k.devisEnAttente.length), k.devisEnAttente.length ? 'À relancer si besoin' : 'Rien en attente')),
      h('div', { class: 'grille-2' },
        bloc(`Chiffre d’affaires ${k.annee}`, histogramme(k.parMois, { moisCourant: Number(auj.slice(5, 7)) - 1 }), k.plafond ? jauge(k.partPlafond, 'Part du plafond de chiffre d’affaires utilisée', `${eurCourt(k.ca)} sur ${eurCourt(k.plafond)} de plafond annuel`) : null),
        bloc('À relancer', k.retard.length ? h('ul', { class: 'liste-lignes' }, k.retard.slice(0, 6).map((d) => h('li', {}, h('a', { href: `#/documents/${d.id}` }, h('span', { class: 'l-titre' }, clientDe(etat, d)?.nom || d.doc.client.nom || 'Client', h('small', {}, `${d.doc.numero} · ${joursDeRetard(d, regles, auj)} jours de retard`)), h('span', { class: 'l-montant' }, eur(resteAPayer(d, regles, auj))))))) : vide('check', 'Tout est à jour', 'Aucune facture n’est en retard de paiement.'))),
      etat.documents.length ? bloc('Dernières activités', h('ul', { class: 'liste-lignes' }, [...etat.documents].sort((a, b) => b.modifie.localeCompare(a.modifie) || b.cree.localeCompare(a.cree)).slice(0, 5).map((d) => h('li', {}, h('a', { href: `#/documents/${d.id}` }, h('span', { class: 'l-titre' }, `${d.doc.numero || 'Sans numéro'} · ${clientDe(etat, d)?.nom || d.doc.client.nom || 'Sans client'}`, h('small', {}, `${d.doc.type === 'devis' ? 'Devis' : d.doc.type === 'avoir' ? 'Avoir' : 'Facture'} du ${dateFr(d.doc.dateEmission)}`)), statutPastille(d, regles, auj), h('span', { class: 'l-montant' }, eur(totalDocument(d, regles, auj)))))))) : null);
    animerJauges(conteneur);
  };
  dessiner(); nettoyer(store.abonner(dessiner));
  return conteneur;
}
