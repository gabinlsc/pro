// Échéances d'un micro-entrepreneur : déclaration du chiffre d'affaires, CFE, facturation électronique, options.
// Toutes les dates réglementaires viennent de data/regles.json (jour et mois « MM-JJ » ou date complète) ; les règles de calcul (fin du mois suivant, première déclaration) sont celles de service-public.gouv.fr (F23257).
import { ajouterJours, ajouterMois, dateIsoValide, dateLongue, dernierJourDuMois, prochainJourOuvre, MOIS_FR } from './dates.js';
import { formaterEuros } from './money.js';

/** Dernier jour couvert par les données réglementaires de data/regles.json (un test vérifie que chaque donnée utilisée est valable jusque-là). */
export const FIN_VALIDITE = '2027-12-31';
const nomMois = (m) => MOIS_FR[m - 1];
const deMois = (m) => (/^[aeiouhéèêàâîôû]/i.test(nomMois(m)) ? `d’${nomMois(m)}` : `de ${nomMois(m)}`); // « d’août », « de juin »
const dansFenetre = (d, depuis, fin) => d >= depuis && d <= fin;
const lastDayOfNextMonth = (a, m) => (m === 12 ? dernierJourDuMois(a + 1, 1) : dernierJourDuMois(a, m + 1));

/** Première échéance de déclaration (service-public.gouv.fr F23257). Mensuel : fin du mois suivant les 3 premiers mois d'activité. Trimestriel : fin du mois suivant le trimestre qui suit celui du démarrage. */
export function premiereEcheance(debutIso, periodicite, trimestres) {
  if (periodicite === 'mois') {
    const finTroisMois = ajouterJours(ajouterMois(debutIso, 3), -1);
    const [a, m] = finTroisMois.split('-').map(Number);
    return lastDayOfNextMonth(a, m);
  }
  const [a, m] = debutIso.split('-').map(Number);
  const q = Math.floor((m - 1) / 3); // 0..3
  const cible = (q + 1) % 4, annee = a + Math.floor((q + 1) / 4);
  return trimestres[cible](cible === 3 ? annee + 1 : annee);
}

/** `regles` : creerRegles(...). e : { periodicite: 'mois'|'trimestre', debutActivite, depuis, fin, options: { cfe, fe, options, ir } } */
export function genererEcheances(e, regles) {
  const erreurs = [], evenements = [];
  if (!dateIsoValide(e.depuis) || !dateIsoValide(e.fin) || e.fin < e.depuis) return { erreurs: [{ champ: 'depuis', message: 'Choisissez une période valide.' }], evenements };
  if (e.debutActivite && !dateIsoValide(e.debutActivite)) return { erreurs: [{ champ: 'debutActivite', message: 'Date de début d’activité invalide.' }], evenements };
  const donnee = (id) => { const v = regles.valeur(id); if (v === null) erreurs.push({ champ: 'donnees', message: `Donnée en cours de vérification (${id}) : le calendrier est bloqué.` }); return v; };
  const ajouter = (cle, date, titre, description, categorie) => { if (dansFenetre(date, e.depuis, e.fin)) evenements.push({ cle, date, titre, description, categorie }); };
  const penalite = donnee('decl_penalite_euros');
  const [anneeDepuis, anneeFin] = [Number(e.depuis.slice(0, 4)), Number(e.fin.slice(0, 4))];
  const fmt = (v) => (v === null ? '' : formaterEuros(Math.round(v * 100)).replace(/\u00a0/g, ' '));
  const noteRetard = penalite === null ? '' : ` En cas d’oubli, une pénalité de ${fmt(penalite)} s’applique à chaque déclaration manquante.`;
  const aide = 'Déclaration en ligne sur autoentrepreneur.urssaf.fr, obligatoire même si le chiffre d’affaires est nul (indiquer « Néant »). Chiffre d’affaires encaissé, hors taxes, sans déduire de charges.';

  // ---- déclaration du chiffre d'affaires
  const trim = [donnee('decl_trimestre_1'), donnee('decl_trimestre_2'), donnee('decl_trimestre_3'), donnee('decl_trimestre_4')];
  if (erreurs.length) return { erreurs, evenements: [] };
  const echeanceTrimestre = (q, annee) => `${annee}-${trim[q]}`; // q = 0..3 ; pour le 4e trimestre, annee = année de l'échéance
  const echeancesT = [(a) => echeanceTrimestre(0, a), (a) => echeanceTrimestre(1, a), (a) => echeanceTrimestre(2, a), (a) => echeanceTrimestre(3, a)];
  const premiere = e.debutActivite ? premiereEcheance(e.debutActivite, e.periodicite, echeancesT) : null;
  if (e.periodicite === 'mois') {
    for (let a = anneeDepuis - 1; a <= anneeFin; a++) for (let m = 1; m <= 12; m++) {
      const date = lastDayOfNextMonth(a, m);
      if (premiere && date < premiere) continue;
      const estPremiere = premiere === date;
      ajouter(`ca-m-${a}-${m}`, date, estPremiere ? 'Première déclaration de chiffre d’affaires' : `Déclarer le chiffre d’affaires ${deMois(m)} ${a}`,
        `${estPremiere ? 'Votre première déclaration couvre tout le chiffre d’affaires depuis le début de votre activité. ' : `Chiffre d’affaires encaissé en ${nomMois(m)} ${a}. `}À faire au plus tard le ${dateLongue(date)}. ${aide}${noteRetard}`, 'declaration');
    }
  } else {
    const noms = ['janvier à mars', 'avril à juin', 'juillet à septembre', 'octobre à décembre'];
    for (let a = anneeDepuis - 1; a <= anneeFin; a++) for (let q = 0; q < 4; q++) {
      const date = echeanceTrimestre(q, q === 3 ? a + 1 : a);
      if (premiere && date < premiere) continue;
      const estPremiere = premiere === date;
      ajouter(`ca-t-${a}-${q + 1}`, date, estPremiere ? 'Première déclaration de chiffre d’affaires' : `Déclarer le chiffre d’affaires du ${q + 1 === 1 ? '1er' : `${q + 1}e`} trimestre ${a}`,
        `${estPremiere ? 'Votre première déclaration couvre tout le chiffre d’affaires depuis le début de votre activité. ' : `Chiffre d’affaires encaissé de ${noms[q]} ${a}. `}À faire au plus tard le ${dateLongue(date)}. ${aide}${noteRetard}`, 'declaration');
    }
  }

  // ---- CFE
  if (e.options.cfe) {
    const paiement = donnee('cfe_paiement'), declaration = donnee('cfe_declaration_creation'), ca = donnee('cfe_exoneration_ca_max'), reduc = donnee('cfe_reduction_deuxieme_annee');
    if (paiement !== null && declaration !== null) for (let a = anneeDepuis; a <= anneeFin; a++) {
      const anneeCreation = e.debutActivite ? Number(e.debutActivite.slice(0, 4)) : null;
      if (anneeCreation !== null && a < anneeCreation) continue;
      if (anneeCreation === a) {
        ajouter(`cfe-decl-${a}`, `${a}-${declaration}`, 'Déclaration initiale de CFE (exonération de la première année)',
          `Vous êtes exonéré de CFE l’année de création de votre activité, mais vous devez déposer la déclaration initiale 1447-C-SD (cerfa n° 14187*16) au plus tard le ${dateLongue(`${a}-${declaration}`)}, par voie postale, au service des impôts des entreprises dont vous dépendez.`, 'cfe');
        continue;
      }
      const date = prochainJourOuvre(`${a}-${paiement}`);
      ajouter(`cfe-${a}`, date, `Payer la CFE ${a}`,
        `Date limite de paiement de la cotisation foncière des entreprises en général, repoussée au premier jour ouvrable si elle tombe un week-end ou un jour férié : la date exacte figure sur votre avis d’imposition (compte fiscal en ligne sur impots.gouv.fr).${anneeCreation === a - 1 && reduc !== null ? ` Pour votre première année d’imposition, la base est réduite de ${reduc} %.` : ''}${ca !== null ? ` Vous êtes exonéré si votre chiffre d’affaires de l’année ${a - 2} n’a pas dépassé ${fmt(ca)}.` : ''}`, 'cfe');
    }
  }

  // ---- facturation électronique
  if (e.options.fe) {
    const rec = donnee('fe_reception_obligatoire'), emi = donnee('fe_emission_micro');
    if (rec !== null) ajouter('fe-reception', rec, 'Facturation électronique : vous devez pouvoir recevoir des factures électroniques', `À partir du ${dateLongue(rec)}, toutes les entreprises doivent pouvoir recevoir des factures électroniques, par une plateforme agréée par l’État. Choisissez la vôtre à l’avance.`, 'facturation');
    if (emi !== null) ajouter('fe-emission', emi, 'Facturation électronique : obligation d’émettre pour les micro-entreprises', `À partir du ${dateLongue(emi)}, les micro-entreprises et les PME doivent émettre leurs factures par une plateforme agréée. De nouvelles mentions s’ajoutent aussi à vos factures (SIREN du client, adresse de livraison, nature de l’opération).`, 'facturation');
  }

  // ---- dates limites d'option
  if (e.options.options) {
    const vfl = donnee('vfl_option_limite'), retour = donnee('decl_retour_mensuel_limite');
    for (let a = anneeDepuis; a <= anneeFin; a++) {
      if (vfl !== null) ajouter(`vfl-${a}`, `${a}-${vfl}`, `Dernier jour pour opter pour le versement libératoire en ${a + 1}`, `L’option pour le versement forfaitaire libératoire de l’impôt doit être exercée avant le ${dateLongue(`${a}-${vfl}`)} de l’année précédant celle où il doit s’appliquer, sous conditions de revenu fiscal de référence.`, 'option');
      if (retour !== null && e.periodicite === 'trimestre') ajouter(`mensuel-${a}`, `${a}-${retour}`, `Dernier jour pour repasser à la déclaration mensuelle en ${a + 1}`, `Si vous déclarez tous les trimestres et souhaitez déclarer chaque mois l’année suivante, la demande doit être faite avant le ${dateLongue(`${a}-${retour}`)}.`, 'option');
    }
  }

  // ---- rappel de déclaration annuelle de revenus (rappel propre à Compta by glsc, pas une date légale)
  if (e.options.ir) for (let a = anneeDepuis; a <= anneeFin; a++) ajouter(`ir-${a}`, `${a}-04-01`, 'Rappel : préparer la déclaration annuelle de revenus', 'Rappel de Compta by glsc, pas une échéance légale. Les dates de la déclaration annuelle de revenus sont publiées chaque printemps sur impots.gouv.fr. Vous devez y reporter votre chiffre d’affaires de micro-entrepreneur, même s’il a déjà été déclaré à l’Urssaf.', 'impot');

  evenements.sort((x, y) => x.date.localeCompare(y.date) || x.cle.localeCompare(y.cle));
  return { erreurs, evenements };
}
