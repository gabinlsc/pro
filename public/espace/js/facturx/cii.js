// Facture électronique : XML « Cross Industry Invoice » (UN/CEFACT, D16B) du profil Factur-X EN 16931, à partir d'un document analysé.
// Fonctions pures, sans DOM : testables sous Node. Les mentions légales viennent de l'analyse (donc de data/regles.json), jamais d'ici.
import { chiffres } from '../lib/valid.js';

export const PROFIL = { id: 'urn:cen.eu:en16931:2017', nom: 'EN 16931', facturX: 'EN 16931', version: '1.0' };
const TYPE_CODE = { facture: '380', solde: '380', acompte: '386', avoir: '381' };
export const peutEtreElectronique = (type) => type in TYPE_CODE;

export const echapper = (t) => String(t ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const montant = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
const date102 = (iso) => iso.replaceAll('-', '');
const el = (nom, contenu, attrs = {}) => { const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${echapper(v)}"`).join(''); return contenu === '' || contenu == null ? '' : `<${nom}${a}>${contenu}</${nom}>`; };
const dateEl = (nom, iso) => `<${nom}><udt:DateTimeString format="102">${date102(iso)}</udt:DateTimeString></${nom}>`;

/** Code d'unité UN/ECE Recommendation 20 à partir du texte saisi (« jour », « h »…). C62 = « unité ». */
export function codeUnite(texte) {
  const t = String(texte ?? '').trim().toLowerCase().replace(/\./g, '');
  if (/^(j|jr|jrs|jour|jours)$/.test(t)) return 'DAY';
  if (/^(h|hr|heure|heures)$/.test(t)) return 'HUR';
  if (/^(mois)$/.test(t)) return 'MON';
  if (/^(sem|semaine|semaines)$/.test(t)) return 'WEE';
  if (/^(an|ans|année|années)$/.test(t)) return 'ANN';
  if (/^(kg)$/.test(t)) return 'KGM';
  if (/^(m|ml)$/.test(t)) return 'MTR';
  if (/^(m2|m²)$/.test(t)) return 'MTK';
  if (/^(l|litre|litres)$/.test(t)) return 'LTR';
  return 'C62';
}
/** Code du sujet d'une note (UNTDID 4451) : pénalités PMD, indemnité de recouvrement PMT, escompte AAB, mentions réglementaires REG, autres AAI. */
export function sujetNote(texte) {
  if (/^Pénalités de retard/i.test(texte)) return 'PMD';
  if (/^Indemnité forfaitaire/i.test(texte)) return 'PMT';
  if (/^Escompte/i.test(texte)) return 'AAB';
  if (/TVA non applicable|Entrepreneur individuel|association agréée|Assurance professionnelle|Nature de l’opération|Garantie légale/i.test(texte)) return 'REG';
  return 'AAI';
}
/** Adresse de facturation électronique : le SIREN, identifiant d'annuaire (schéma 0225). */
const adresseElectronique = (siren) => (siren ? el('ram:URIUniversalCommunication', el('ram:URIID', siren, { schemeID: '0225' })) : '');
const partie = (p, { vendeur }) => [
  el('ram:Name', echapper(p.nom)),
  p.siren || p.nomCommercial ? el('ram:SpecifiedLegalOrganization', el('ram:ID', p.siren ?? '', { schemeID: '0002' }) + el('ram:TradingBusinessName', echapper(p.nomCommercial ?? ''))) : '',
  vendeur && (p.email || p.tel) ? el('ram:DefinedTradeContact', el('ram:PersonName', echapper(p.nom)) + (p.tel ? el('ram:TelephoneUniversalCommunication', el('ram:CompleteNumber', echapper(p.tel))) : '') + (p.email ? el('ram:EmailURIUniversalCommunication', el('ram:URIID', echapper(p.email))) : '')) : '',
  el('ram:PostalTradeAddress', el('ram:PostcodeCode', echapper(p.cp)) + el('ram:LineOne', echapper(p.adresse)) + el('ram:CityName', echapper(p.ville)) + el('ram:CountryID', 'FR')),
  adresseElectronique(p.siren),
  // Sans numéro de TVA (franchise en base), le vendeur répète son SIREN en BT-32 (norme AFNOR XP Z12-012), ce qui satisfait la règle BR-E-02.
  vendeur ? el('ram:SpecifiedTaxRegistration', el('ram:ID', p.siren, { schemeID: 'FC' })) : '',
].join('');

/**
 * @param doc document (modèle de lib/facture.js) ; a : résultat de analyser(doc, regles, aujourdhui), sans erreur ;
 * @returns { xml, erreurs } : si le document ne peut pas être converti, `erreurs` explique pourquoi et `xml` est null.
 */
export function construireXml(doc, a, { motifExoneration } = {}) {
  const erreurs = [];
  if (!peutEtreElectronique(doc.type)) return { xml: null, erreurs: ['Un devis n’est pas une facture : il n’existe pas de version Factur-X d’un devis.'] };
  if (a.bloque) return { xml: null, erreurs: ['Complétez d’abord le document (voir la liste des points à compléter).'] };
  const e = doc.emetteur, c = doc.client, avoir = doc.type === 'avoir', siren = chiffres(e.siren);
  if (e.enCours || !/^\d{9}$/.test(siren)) erreurs.push('Le SIREN de votre entreprise est nécessaire pour une facture électronique.');
  if (!e.email.trim()) erreurs.push('Indiquez votre adresse e-mail dans vos réglages : elle identifie l’émetteur dans la facture électronique.');
  const sirenClient = chiffres(c.siren);
  if (c.type === 'pro' && !/^\d{9}$/.test(sirenClient)) erreurs.push('Le SIREN du client est nécessaire pour une facture électronique entre entreprises.');
  if (!c.adresse.trim() || !c.cp.trim() || !c.ville.trim()) erreurs.push('L’adresse complète du client (rue, code postal, ville) est nécessaire.');
  if (!a.lignes.length) erreurs.push('Le document ne contient aucune ligne.');
  if (!doc.datePrestation && doc.type !== 'avoir') erreurs.push('La date de la prestation est nécessaire.');
  if (erreurs.length) return { xml: null, erreurs };

  const signe = avoir ? -1 : 1, total = Math.abs(a.total);
  const exoneration = motifExoneration ?? a.mentions.find((m) => /^TVA non applicable/i.test(m)) ?? 'TVA non applicable';
  const lignes = a.lignes.map((l, i) => {
    const brut = Number((BigInt(l.qty100) * BigInt(l.unit) * 2n + 100n * (BigInt(l.qty100) * BigInt(l.unit) < 0n ? -1n : 1n)) / 200n); // arrondi demi vers l'extérieur de qté × prix
    const remise = brut - l.total, net = l.total;
    return `<ram:IncludedSupplyChainTradeLineItem>${el('ram:AssociatedDocumentLineDocument', el('ram:LineID', String(i + 1)))}${el('ram:SpecifiedTradeProduct', el('ram:Name', echapper(l.desc)))}`
      + el('ram:SpecifiedLineTradeAgreement', el('ram:NetPriceProductTradePrice', el('ram:ChargeAmount', montant(l.unit))))
      + el('ram:SpecifiedLineTradeDelivery', el('ram:BilledQuantity', (l.qty100 / 100).toFixed(2), { unitCode: codeUnite(l.unite) }))
      + el('ram:SpecifiedLineTradeSettlement', el('ram:ApplicableTradeTax', el('ram:TypeCode', 'VAT') + el('ram:CategoryCode', 'E') + el('ram:RateApplicablePercent', '0.00'))
        + (remise ? el('ram:SpecifiedTradeAllowanceCharge', el('ram:ChargeIndicator', '<udt:Indicator>false</udt:Indicator>') + el('ram:ActualAmount', montant(remise)) + el('ram:Reason', 'Remise')) : '')
        + el('ram:SpecifiedTradeSettlementLineMonetarySummation', el('ram:LineTotalAmount', montant(net)))) + '</ram:IncludedSupplyChainTradeLineItem>';
  });
  const sommeLignes = a.lignes.reduce((s, l) => s + l.total, 0), acomptes = a.deductions.reduce((s, d) => s + d.montant, 0);
  const notes = a.mentions.map((m) => el('ram:IncludedNote', el('ram:Content', echapper(m)) + el('ram:SubjectCode', sujetNote(m)))).join('');
  const vendeur = { nom: e.nom.trim(), nomCommercial: e.nomCommercial.trim(), siren, cp: e.cp.trim(), adresse: e.adresse.trim(), ville: e.ville.trim(), email: e.email.trim(), tel: e.tel.trim() };
  const acheteur = { nom: c.nom.trim(), siren: /^\d{9}$/.test(sirenClient) ? sirenClient : '', cp: c.cp.trim(), adresse: c.adresse.trim(), ville: c.ville.trim() };
  const livraison = doc.datePrestation ? el('ram:ApplicableHeaderTradeDelivery', el('ram:ActualDeliverySupplyChainEvent', dateEl('ram:OccurrenceDateTime', doc.datePrestation))) : el('ram:ApplicableHeaderTradeDelivery', '');
  const iban = chiffres(e.iban).toUpperCase(), bic = chiffres(e.bic).toUpperCase();
  const paiement = iban && !avoir ? el('ram:SpecifiedTradeSettlementPaymentMeans', el('ram:TypeCode', '58') + el('ram:PayeePartyCreditorFinancialAccount', el('ram:IBANID', iban)) + (bic ? el('ram:PayeeSpecifiedCreditorFinancialInstitution', el('ram:BICID', bic)) : '')) : '';
  const conditions = a.echeance && !avoir ? el('ram:SpecifiedTradePaymentTerms', el('ram:Description', echapper(a.echeance === doc.dateEmission ? 'Paiement à réception' : `Paiement avant le ${a.echeance.split('-').reverse().join('/')}`)) + dateEl('ram:DueDateDateTime', a.echeance)) : '';
  const references = [];
  if (avoir && doc.reference.trim()) references.push(doc.reference.trim());
  for (const d of a.deductions) references.push(d.numero);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`
    + el('rsm:ExchangedDocumentContext', el('ram:GuidelineSpecifiedDocumentContextParameter', el('ram:ID', PROFIL.id)))
    + el('rsm:ExchangedDocument', el('ram:ID', echapper(doc.numero.trim())) + el('ram:TypeCode', TYPE_CODE[doc.type]) + dateEl('ram:IssueDateTime', doc.dateEmission) + notes)
    + el('rsm:SupplyChainTradeTransaction', lignes.join('')
      + el('ram:ApplicableHeaderTradeAgreement', el('ram:SellerTradeParty', partie(vendeur, { vendeur: true })) + el('ram:BuyerTradeParty', partie(acheteur, { vendeur: false }))
        + (doc.bonCommande.trim() ? el('ram:BuyerOrderReferencedDocument', el('ram:IssuerAssignedID', echapper(doc.bonCommande.trim()))) : ''))
      + livraison
      + el('ram:ApplicableHeaderTradeSettlement', el('ram:PaymentReference', echapper(doc.numero.trim())) + el('ram:InvoiceCurrencyCode', 'EUR') + paiement
        + el('ram:ApplicableTradeTax', el('ram:CalculatedAmount', '0.00') + el('ram:TypeCode', 'VAT') + el('ram:ExemptionReason', echapper(exoneration)) + el('ram:BasisAmount', montant(sommeLignes)) + el('ram:CategoryCode', 'E') + el('ram:ExemptionReasonCode', 'VATEX-FR-FRANCHISE') + el('ram:RateApplicablePercent', '0.00'))
        + conditions
        + el('ram:SpecifiedTradeSettlementHeaderMonetarySummation', el('ram:LineTotalAmount', montant(sommeLignes)) + el('ram:TaxBasisTotalAmount', montant(sommeLignes)) + el('ram:TaxTotalAmount', '0.00', { currencyID: 'EUR' }) + el('ram:GrandTotalAmount', montant(sommeLignes)) + (acomptes ? el('ram:TotalPrepaidAmount', montant(acomptes)) : '') + el('ram:DuePayableAmount', montant(total)))
        + references.map((r) => el('ram:InvoiceReferencedDocument', el('ram:IssuerAssignedID', echapper(r)))).join(''))) + '</rsm:CrossIndustryInvoice>\n';
  void signe;
  return { xml, erreurs: [] };
}
