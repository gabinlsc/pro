// Devis et factures : modèle, validations, calculs et mentions légales. Aucun accès au DOM : testable sous Node.
// Les chiffres et textes réglementaires viennent tous de data/regles.json (via creerRegles) ; si l'un d'eux n'est pas vérifié, le document est bloqué.
import { parseMontant, parseQuantite, parsePourcent, totalLigne, partEnPourcent, formaterEuros } from './money.js';
import { sirenValide, siretValide, ibanValide, bicValide, emailValide, chiffres, formaterIban, formaterSiren, formaterSiret } from './valid.js';
import { dateIsoValide, ajouterJours, dateLongue } from './dates.js';

export const TYPES = {
  devis: { prefixe: 'D', titre: 'Devis' },
  facture: { prefixe: 'F', titre: 'Facture' },
  acompte: { prefixe: 'F', titre: 'Facture d’acompte' },
  solde: { prefixe: 'F', titre: 'Facture de solde' },
  avoir: { prefixe: 'A', titre: 'Avoir' },
};
export const NATURES = { services: 'prestation de services', biens: 'livraison de biens', mixte: 'livraison de biens et prestation de services' };
export const MAX_LIGNES = 40;

/** Accès aux données réglementaires : une entrée non vérifiée n'existe pas (null), elle ne peut donc jamais être utilisée. */
export function creerRegles(entrees) {
  const par = new Map(entrees.map((e) => [e.id, e]));
  return { entree: (id) => { const e = par.get(id); return e && e.statut === 'verifie' ? e : null; }, valeur(id) { return this.entree(id)?.valeur ?? null; } };
}

export function proposerNumero(type, dateIso, existants = []) {
  const prefixe = TYPES[type].prefixe, annee = dateIso.slice(0, 4);
  const re = new RegExp(`^${prefixe}-${annee}-(\\d+)$`);
  const max = existants.reduce((m, n) => { const r = re.exec(String(n)); return r ? Math.max(m, Number(r[1])) : m; }, 0);
  return `${prefixe}-${annee}-${String(max + 1).padStart(3, '0')}`;
}

export const ligneVide = () => ({ desc: '', qty: '1', unite: '', prix: '', remise: '' });
export function docVide(aujourdhui) {
  return {
    type: 'facture', numero: '', dateEmission: aujourdhui, datePrestation: '', reference: '', bonCommande: '', nature: 'services', objet: '',
    emetteur: { nom: '', nomCommercial: '', adresse: '', cp: '', ville: '', email: '', tel: '', siren: '', siret: '', enCours: false, iban: '', bic: '', banque: '', assurance: '', associationAgreee: false },
    client: { type: 'pro', nom: '', adresse: '', cp: '', ville: '', siren: '', tvaIntra: '', adresseLivraison: '', mediateur: '' },
    lignes: [ligneVide()],
    reglement: { delai: '30', penalites: 'bce', tauxFixe: '' }, validiteJours: '30', acomptePct: '30', acomptes: [{ numero: '', montant: '' }],
    tvaMention: 'cibs', garantieConformite: false, notes: '',
  };
}

const err = (champ, message) => ({ champ, message });

/** Analyse complète d'un document : erreurs bloquantes, avertissements, lignes calculées, totaux, échéance et mentions imprimables. */
export function analyser(doc, regles, aujourdhui) {
  const erreurs = [], avertissements = [];
  const e = doc.emetteur, c = doc.client, type = doc.type, estDevis = type === 'devis', pro = c.type === 'pro';
  const T = TYPES[type];
  if (!T) return { erreurs: [err('type', 'Type de document inconnu.')], avertissements, lignes: [], total: 0 };

  // ---- identité de l'émetteur
  if (!e.nom.trim()) erreurs.push(err('emetteur.nom', 'Indiquez votre nom et prénom.'));
  if (!e.adresse.trim() || !e.cp.trim() || !e.ville.trim()) erreurs.push(err('emetteur.adresse', 'Indiquez votre adresse (rue, code postal, ville).'));
  if (e.email && !emailValide(e.email)) erreurs.push(err('emetteur.email', 'Votre adresse e-mail n’est pas valide.'));
  const siren = chiffres(e.siren), siret = chiffres(e.siret);
  if (!e.enCours) {
    if (!siren) erreurs.push(err('emetteur.siren', 'Indiquez votre SIREN, ou cochez « en cours d’immatriculation ».'));
    else if (!sirenValide(siren)) erreurs.push(err('emetteur.siren', 'Votre SIREN n’est pas valide (9 chiffres, clé de contrôle incorrecte).'));
    if (siret && !siretValide(siret)) erreurs.push(err('emetteur.siret', 'Votre SIRET n’est pas valide (14 chiffres, clé de contrôle incorrecte).'));
    if (siret && siren && siret.slice(0, 9) !== siren) erreurs.push(err('emetteur.siret', 'Le SIRET doit commencer par le SIREN.'));
  }
  const iban = chiffres(e.iban), bic = chiffres(e.bic);
  if (iban && !ibanValide(iban)) erreurs.push(err('emetteur.iban', 'Votre IBAN n’est pas valide.'));
  if (bic && !bicValide(bic)) erreurs.push(err('emetteur.bic', 'Votre BIC n’est pas valide.'));
  if (!estDevis && type !== 'avoir' && !iban) avertissements.push('Aucun IBAN : le client ne saura pas où payer par virement.');

  // ---- client
  if (!c.nom.trim()) erreurs.push(err('client.nom', pro ? 'Indiquez le nom de l’entreprise cliente.' : 'Indiquez le nom complet du client.'));
  if (!c.adresse.trim() || !c.cp.trim() || !c.ville.trim()) {
    if (pro) avertissements.push('Adresse du client incomplète : à renseigner pour une facture complète.');
    else erreurs.push(err('client.adresse', 'Indiquez l’adresse du client (rue, code postal, ville).'));
  }
  const sirenClient = chiffres(c.siren);
  if (sirenClient && !sirenValide(sirenClient)) erreurs.push(err('client.siren', 'Le SIREN du client n’est pas valide (9 chiffres, clé de contrôle incorrecte).'));
  if (pro && !estDevis && !sirenClient) {
    const date = regles.valeur('siren_client_obligatoire_micro');
    if (date && aujourdhui >= date) erreurs.push(err('client.siren', 'Le SIREN du client est obligatoire sur les factures destinées à une entreprise.'));
    else avertissements.push(date ? `SIREN du client absent : il sera obligatoire sur vos factures à partir du ${dateLongue(date)}.` : 'SIREN du client absent : il devient obligatoire sur les factures entre entreprises.');
  }

  // ---- dates et numéro
  if (!doc.numero.trim()) erreurs.push(err('numero', 'Indiquez un numéro (suite chronologique et continue, sans trou).'));
  else if (doc.numero.length > 30) erreurs.push(err('numero', 'Numéro trop long (30 caractères au maximum).'));
  if (!dateIsoValide(doc.dateEmission)) erreurs.push(err('dateEmission', 'Date d’émission invalide.'));
  const besoinPrestation = ['facture', 'solde', 'acompte'].includes(type);
  if (doc.datePrestation && !dateIsoValide(doc.datePrestation)) erreurs.push(err('datePrestation', 'Date invalide.'));
  if (besoinPrestation && !doc.datePrestation) erreurs.push(err('datePrestation', type === 'acompte' ? 'Indiquez la date à laquelle l’acompte est versé.' : 'Indiquez la date de la vente ou de la prestation.'));

  // ---- lignes
  const lignes = [];
  doc.lignes.slice(0, MAX_LIGNES).forEach((l, i) => {
    const vide = !l.desc.trim() && !String(l.prix).trim();
    if (vide) return;
    const n = i + 1;
    if (!l.desc.trim()) { erreurs.push(err(`lignes.${i}.desc`, `Ligne ${n} : ajoutez une désignation.`)); return; }
    const qty100 = parseQuantite(l.qty), unit = parseMontant(l.prix), remise100 = parsePourcent(l.remise);
    if (qty100 === null) erreurs.push(err(`lignes.${i}.qty`, `Ligne ${n} : quantité invalide (nombre positif, deux décimales au plus).`));
    if (unit === null) erreurs.push(err(`lignes.${i}.prix`, `Ligne ${n} : prix unitaire invalide (par exemple 45 ou 45,50).`));
    if (remise100 === null) erreurs.push(err(`lignes.${i}.remise`, `Ligne ${n} : remise invalide (entre 0 et 100 %).`));
    if (qty100 !== null && unit !== null && remise100 !== null) lignes.push({ i, desc: l.desc.trim(), unite: l.unite.trim(), qty100, unit, remise100, total: totalLigne({ qty100, unit, remise100 }) });
  });
  if (!lignes.length && !erreurs.some((x) => x.champ.startsWith('lignes'))) erreurs.push(err('lignes', 'Ajoutez au moins une ligne (désignation et prix).'));
  const sousTotal = lignes.reduce((a, l) => a + l.total, 0);
  if (Math.abs(sousTotal) > 100_000_000_00) erreurs.push(err('lignes', 'Montant total trop élevé.'));

  // ---- spécificités par type
  let lignesImprimees = lignes, total = sousTotal, acompteInfo = null, deductions = [];
  const signe = type === 'avoir' ? -1 : 1;
  if (type === 'acompte') {
    const pct = /^\d{1,2}$/.test(String(doc.acomptePct).trim()) ? Number(doc.acomptePct) : NaN;
    if (!(pct >= 1 && pct <= 99)) erreurs.push(err('acomptePct', 'Pourcentage d’acompte invalide (entre 1 et 99).'));
    else if (lignes.length) {
      const montant = partEnPourcent(sousTotal, pct);
      acompteInfo = { pct, base: sousTotal, montant };
      lignesImprimees = [{ desc: `Acompte de ${pct} % à la commande${doc.reference ? ` — devis ${doc.reference}` : ''}`, unite: '', qty100: 100, unit: montant, remise100: 0, total: montant }];
      total = montant;
      if (!doc.reference.trim()) avertissements.push('Indiquez le numéro du devis pour que la facture d’acompte s’y rattache.');
    }
  } else if (type === 'solde') {
    doc.acomptes.forEach((a, i) => {
      if (!a.numero.trim() && !String(a.montant).trim()) return;
      const m = parseMontant(a.montant);
      if (!a.numero.trim() || m === null || m <= 0) erreurs.push(err(`acomptes.${i}`, `Acompte ${i + 1} : indiquez le numéro de la facture d’acompte et son montant.`));
      else deductions.push({ numero: a.numero.trim(), montant: m });
    });
    if (!deductions.length) erreurs.push(err('acomptes', 'Indiquez au moins une facture d’acompte déjà émise (sinon, faites une facture simple).'));
    total = sousTotal - deductions.reduce((s, d) => s + d.montant, 0);
    if (total < 0) erreurs.push(err('acomptes', 'Les acomptes dépassent le total : utilisez un avoir pour la différence.'));
  } else if (type === 'avoir') {
    if (!doc.reference.trim()) erreurs.push(err('reference', 'Indiquez le numéro de la facture annulée ou corrigée.'));
    total = -sousTotal;
  } else if (estDevis) {
    const v = /^\d{1,3}$/.test(String(doc.validiteJours).trim()) ? Number(doc.validiteJours) : NaN;
    if (!(v >= 1 && v <= 365)) erreurs.push(err('validiteJours', 'Durée de validité invalide (1 à 365 jours).'));
  }
  if (estDevis && total <= 0 && lignes.length) erreurs.push(err('lignes', 'Le total d’un devis doit être positif.'));
  if ((type === 'facture') && total < 0 && lignes.length) erreurs.push(err('lignes', 'Le total d’une facture doit être positif : pour annuler, faites un avoir.'));

  // ---- règlement et échéance
  let echeance = null, validJusqua = null;
  if (estDevis && dateIsoValide(doc.dateEmission) && /^\d+$/.test(String(doc.validiteJours))) validJusqua = ajouterJours(doc.dateEmission, Number(doc.validiteJours));
  const facturier = !estDevis && type !== 'avoir';
  if (facturier) {
    const max = pro ? regles.valeur('delai_paiement_max_jours') : 365;
    const d = /^\d{1,3}$/.test(String(doc.reglement.delai).trim()) ? Number(doc.reglement.delai) : NaN;
    if (!(d >= 0)) erreurs.push(err('reglement.delai', 'Délai de paiement invalide (nombre de jours).'));
    else if (max !== null && d > max) erreurs.push(err('reglement.delai', pro ? `Entre professionnels, le délai de paiement ne peut pas dépasser ${max} jours à compter de l’émission de la facture.` : 'Délai trop long.'));
    else if (dateIsoValide(doc.dateEmission)) echeance = ajouterJours(doc.dateEmission, d);
    if (pro && max === null) erreurs.push(err('reglement.delai', 'Le délai maximal légal est en cours de vérification : la facture est bloquée.'));
  }

  // ---- mentions légales (aucune mention n'est écrite en dur : chacune vient de data/regles.json)
  const mentions = [], identite = [];
  const texte = (id) => { const x = regles.entree(id); if (!x) erreurs.push(err('mentions', `Mention indisponible : la donnée « ${id} » est en cours de vérification.`)); return x?.valeur ?? ''; };
  identite.push(`${e.nom.trim()}, ${texte('mention_entrepreneur_individuel')}`);
  if (e.nomCommercial.trim()) identite.push(e.nomCommercial.trim());
  identite.push(`${e.adresse.trim()}, ${e.cp.trim()} ${e.ville.trim()}`);
  if (e.enCours) identite.push(texte('mention_siret_en_cours'));
  else { identite.push(`SIREN ${formaterSiren(siren)}`); if (siret && siretValide(siret)) identite.push(`SIRET ${formaterSiret(siret)}`); }
  if (e.associationAgreee) mentions.push(texte('mention_association_agreee'));
  mentions.push(texte(doc.tvaMention === 'cgi' ? 'mention_franchise_tva_cgi' : 'mention_franchise_tva_cibs'));
  if (e.assurance.trim()) mentions.push(`Assurance professionnelle : ${e.assurance.trim()}`);
  if (facturier || type === 'avoir') mentions.push(`Nature de l’opération : ${NATURES[doc.nature] ?? NATURES.services}.`);
  if (facturier) {
    mentions.push(texte('mention_escompte_neant'));
    const p = doc.reglement.penalites;
    if (p === 'fixe') {
      const taux = parsePourcent(doc.reglement.tauxFixe), min = regles.valeur('penalite_taux_minimum');
      if (taux === null || taux === 0) erreurs.push(err('reglement.tauxFixe', 'Indiquez le taux annuel des pénalités (en %).'));
      else if (min === null) erreurs.push(err('reglement.tauxFixe', 'Le taux minimal légal est en cours de vérification.'));
      else if (taux / 100 < min) erreurs.push(err('reglement.tauxFixe', `Le taux ne peut pas être inférieur à ${String(min).replace('.', ',')} % (trois fois le taux de l’intérêt légal).`));
      else mentions.push(`Pénalités de retard : ${String(taux / 100).replace('.', ',')} % par an, exigibles sans rappel dès le lendemain de la date d’échéance.`);
    } else if (p === 'legal3') {
      mentions.push('Pénalités de retard : trois fois le taux de l’intérêt légal, exigibles sans rappel dès le lendemain de la date d’échéance.');
    } else {
      const pts = regles.valeur('penalite_majoration_bce');
      if (pts === null) texte('penalite_majoration_bce');
      else mentions.push(`Pénalités de retard : taux de refinancement de la Banque centrale européenne en vigueur au 1er janvier ou au 1er juillet de l’année, majoré de ${pts} points, exigibles sans rappel dès le lendemain de la date d’échéance.`);
    }
    if (pro) {
      const ind = regles.entree('indemnite_recouvrement');
      if (!ind) texte('indemnite_recouvrement'); else mentions.push(`Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : ${formaterEuros(Math.round(ind.valeur * 100))}.`);
    } else {
      if (doc.garantieConformite) { const a = regles.entree('garantie_conformite_ans'); if (!a) texte('garantie_conformite_ans'); else mentions.push(`Garantie légale de conformité : ${a.valeur} ans au minimum.`); }
      if (c.mediateur.trim()) mentions.push(`Médiateur de la consommation : ${c.mediateur.trim()}`);
    }
  }
  if (estDevis && !pro && c.mediateur.trim()) mentions.push(`Médiateur de la consommation : ${c.mediateur.trim()}`);
  if (doc.notes.trim()) mentions.push(doc.notes.trim());

  return {
    erreurs, avertissements, lignes: lignesImprimees, lignesSaisies: lignes, sousTotal, total, signe, acompteInfo, deductions,
    echeance, validJusqua, identite, mentions, titre: T.titre, bloque: erreurs.length > 0, iban: iban && ibanValide(iban) ? formaterIban(iban) : '', bic: bic && bicValide(bic) ? bic.toUpperCase() : '',
  };
}
