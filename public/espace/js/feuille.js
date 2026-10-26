// Aperçu imprimable d'un devis, d'une facture ou d'un avoir (même mise en page que l'outil de Compta by glsc). Tout texte passe par textContent.
import { h, eur, dateFr } from './ui.js';
import { formaterQuantite } from './lib/money.js';

const ligneInfo = (t) => (t ? h('div', {}, t) : null);
export function feuille(a, d) {
  const e = d.emetteur, c = d.client, devis = d.type === 'devis';
  const rows = a.lignes.map((l) => h('tr', {}, h('td', {}, l.desc), h('td', { class: 'num' }, `${formaterQuantite(l.qty100)}${l.unite ? ' ' + l.unite : ''}`), h('td', { class: 'num' }, eur(l.unit)),
    h('td', { class: 'num' }, l.remise100 ? `${String(l.remise100 / 100).replace('.', ',')} %` : ''), h('td', { class: 'num' }, eur(l.total * a.signe))));
  const adresseClient = [c.adresse.trim(), [c.cp.trim(), c.ville.trim()].filter(Boolean).join(' ')].filter(Boolean);
  const totalLibelle = d.type === 'avoir' ? 'Total de l’avoir' : devis ? 'Total du devis' : d.type === 'solde' ? 'Solde à payer' : d.type === 'acompte' ? 'Acompte à payer' : 'Total à payer';
  return h('article', { class: 'feuille', 'aria-label': 'Aperçu du document' },
    a.bloque ? h('p', { class: 'brouillon' }, 'BROUILLON : à compléter avant envoi') : null,
    h('header', { class: 'feuille-tete' },
      h('div', { class: 'feuille-emetteur' }, a.identite.map((t, i) => (i === 0 ? h('div', {}, h('b', {}, t)) : ligneInfo(t))), ligneInfo(e.email.trim()), ligneInfo(e.tel.trim())),
      h('div', { class: 'feuille-titre' }, h('h3', {}, a.titre.toUpperCase()), h('p', {}, h('b', {}, `N° ${d.numero.trim() || '…'}`)), h('p', {}, `Date : ${dateFr(d.dateEmission)}`),
        d.datePrestation ? h('p', {}, d.type === 'acompte' ? `Acompte versé le ${dateFr(d.datePrestation)}` : `Prestation ou livraison : ${dateFr(d.datePrestation)}`) : null,
        a.validJusqua ? h('p', {}, `Valable jusqu’au ${dateFr(a.validJusqua)}`) : null,
        a.echeance ? h('p', {}, a.echeance === d.dateEmission ? 'Échéance : à réception' : `Échéance : ${dateFr(a.echeance)}`) : null,
        d.reference.trim() ? h('p', {}, `${d.type === 'avoir' ? 'Facture annulée' : 'Devis'} : ${d.reference.trim()}`) : null,
        d.bonCommande.trim() ? h('p', {}, `Bon de commande : ${d.bonCommande.trim()}`) : null)),
    h('section', { class: 'feuille-client' }, h('small', {}, devis ? 'Destinataire' : 'Facturé à'), h('b', {}, c.nom.trim() || 'Nom du client'), adresseClient.map((t) => ligneInfo(t)),
      ligneInfo(c.siren.trim() ? `SIREN ${c.siren.trim()}` : null), ligneInfo(c.tvaIntra.trim() ? `TVA intracommunautaire ${c.tvaIntra.trim()}` : null),
      c.adresseLivraison.trim() ? h('div', { class: 'livraison' }, h('small', {}, 'Adresse de livraison'), h('div', {}, c.adresseLivraison.trim())) : null),
    d.objet.trim() ? h('p', { class: 'feuille-objet' }, h('b', {}, 'Objet : '), d.objet.trim()) : null,
    h('table', { class: 'feuille-table' },
      h('thead', {}, h('tr', {}, ['Désignation', 'Qté', 'Prix unitaire', 'Remise', 'Total'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, t)))),
      h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 5, class: 'vide-ligne' }, 'Ajoutez une ligne pour la voir ici.')))),
    a.acompteInfo ? h('p', { class: 'feuille-note' }, `Total convenu : ${eur(a.acompteInfo.base)}. Acompte de ${a.acompteInfo.pct} %.`) : null,
    a.deductions.length ? h('div', { class: 'feuille-deductions' }, h('div', { class: 'ligne-total-simple' }, h('span', {}, 'Total de la commande'), h('span', {}, eur(a.sousTotal))),
      a.deductions.map((x) => h('div', { class: 'ligne-total-simple' }, h('span', {}, `Acompte déjà facturé (${x.numero})`), h('span', {}, `− ${eur(x.montant)}`)))) : null,
    h('div', { class: 'feuille-total' }, h('span', {}, totalLibelle), h('b', {}, eur(a.total))),
    h('p', { class: 'feuille-note' }, devis ? 'Prix nets : TVA non applicable.' : 'Total net à payer : TVA non applicable.'),
    !devis && d.type !== 'avoir' && (a.iban || a.bic) ? h('p', { class: 'feuille-paiement' }, h('b', {}, 'Règlement par virement : '), [e.banque.trim(), a.iban && `IBAN ${a.iban}`, a.bic && `BIC ${a.bic}`].filter(Boolean).join(' · '), d.numero.trim() ? ` · Référence à rappeler : ${d.numero.trim()}` : '') : null,
    devis ? h('div', { class: 'feuille-signature' }, h('b', {}, 'Bon pour accord'), h('p', {}, 'Date, nom et signature du client, précédés de la mention « Bon pour accord » :'), h('div', { class: 'feuille-signature-case' })) : null,
    h('footer', { class: 'feuille-mentions' }, a.mentions.map((m) => h('p', {}, m))));
}
