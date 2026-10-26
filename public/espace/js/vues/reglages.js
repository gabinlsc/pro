// Réglages : profil de l'émetteur, valeurs par défaut, échéances, sauvegarde (export, import, chiffrement) et effacement.
import { h, dialogue, champ, coche, confirmer, marquerErreur, telecharger, choisirFichier, dateFr, toast as toastGlobal } from '../ui.js';
import { icone } from '../icones.js';
import { entete, bouton } from '../composants.js';
import { ACTIVITES } from '../lib/simulateur.js';
import { sirenValide, siretValide, ibanValide, bicValide, emailValide, chiffres } from '../lib/valid.js';
import { exporter } from '../donnees.js';
import { chiffrer } from '../crypto.js';
import { lireSauvegarde, demanderMdp } from './bienvenue.js';

const VERIF = { 'emetteur.siren': (v, e) => e.enCours || !v || sirenValide(v) ? '' : 'Ce SIREN n’est pas valide (9 chiffres, clé de contrôle).', 'emetteur.siret': (v) => !v || siretValide(v) ? '' : 'Ce SIRET n’est pas valide (14 chiffres).', 'emetteur.iban': (v) => !v || ibanValide(v) ? '' : 'Cet IBAN n’est pas valide.', 'emetteur.bic': (v) => !v || bicValide(v) ? '' : 'Ce BIC n’est pas valide.', 'emetteur.email': (v) => !v || emailValide(v) ? '' : 'Cette adresse e-mail n’est pas valide.' };

export function reglages({ store, regles, auj, meta, naviguer, toast }) {
  const page = h('div', { class: 'page' }), p = store.etat.profil;
  const enregistrer = (fn) => store.modifier((e) => fn(e.profil));
  const t = (label, chemin, o = {}) => {
    const [a, b] = chemin.split('.'); const valeur = b ? p[a][b] : p[a];
    return champ({ label, nom: chemin, valeur, ...o, oninput: (ev) => { const v = ev.target.value; enregistrer((pr) => { if (b) pr[a][b] = v; else pr[a] = v; }); const verif = VERIF[chemin]; marquerErreur(ev.target, verif ? verif(chiffres(v) && ['emetteur.iban', 'emetteur.bic'].includes(chemin) ? chiffres(v) : v.trim(), p.emetteur) : ''); } });
  };
  const o = (label, chemin, cle) => coche({ label, nom: chemin, valeur: chemin.includes('.') ? p[chemin.split('.')[0]][chemin.split('.')[1]] : p[chemin], oninput: (ev) => enregistrer((pr) => { if (cle) pr[chemin.split('.')[0]][chemin.split('.')[1]] = ev.target.checked; else pr[chemin] = ev.target.checked; }) });
  const carte = (titre, icon, ...contenu) => h('section', { class: 'carte formu' }, h('h2', {}, icone(icon), titre), ...contenu);
  const sel = (label, chemin, options, aide) => champ({ label, nom: chemin, valeur: p[chemin], options, aide, oninput: (ev) => enregistrer((pr) => { pr[chemin] = ev.target.value; }) });
  const rappel = (jours, libelle) => coche({ label: libelle, nom: `rappel${jours}`, valeur: p.rappels.includes(jours), oninput: (ev) => enregistrer((pr) => { pr.rappels = ev.target.checked ? [...new Set([...pr.rappels, jours])].sort((a, b) => b - a) : pr.rappels.filter((x) => x !== jours); }) });
  const ancien = meta.derniereVerification && Date.parse(auj) - Date.parse(meta.derniereVerification) > 183 * 86_400_000;

  const exportClair = () => { telecharger(`glsc-pro-sauvegarde-${auj}.json`, exporter(store.etat), 'application/json'); toast('Sauvegarde téléchargée. Elle contient vos données en clair : gardez-la en lieu sûr.'); };
  const exportChiffre = async () => {
    let a, b; const f = h('form', { class: 'formulaire', onsubmit: (e) => e.preventDefault() }, a = champ({ label: 'Mot de passe (8 caractères au moins)', nom: 'mdp', type: 'password', attrs: { autocomplete: 'new-password', autofocus: '' } }), b = champ({ label: 'Confirmer le mot de passe', nom: 'mdp2', type: 'password', attrs: { autocomplete: 'new-password' } }), h('p', { class: 'aide' }, 'Ce mot de passe n’est enregistré nulle part : si vous l’oubliez, la sauvegarde est perdue.'));
    const r = await dialogue({ titre: 'Sauvegarde chiffrée', contenu: f, boutons: [{ libelle: 'Annuler', style: 'ghost', valeur: null }, { libelle: 'Chiffrer et télécharger', icone: 'lock', action: () => { const x = a.querySelector('input'), y = b.querySelector('input'); marquerErreur(x, x.value.length >= 8 ? '' : 'Au moins 8 caractères.'); marquerErreur(y, y.value === x.value ? '' : 'Les deux mots de passe sont différents.'); return x.value.length >= 8 && y.value === x.value ? x.value : false; } }] });
    if (!r) return;
    try { telecharger(`glsc-pro-sauvegarde-${auj}.chiffree.json`, await chiffrer(exporter(store.etat), r), 'application/json'); toast('Sauvegarde chiffrée téléchargée.'); } catch (e) { toast(e.message, 'erreur'); }
  };
  const importerFichier = async () => {
    const f = await choisirFichier('.json,application/json'); if (!f) return;
    try {
      const etat = await lireSauvegarde(f.texte, () => demanderMdp()); if (!etat) return;
      if (!(await confirmer('Remplacer vos données ?', `La sauvegarde contient ${etat.clients.length} client(s), ${etat.documents.length} document(s) et ${etat.encaissements.length} recette(s). Vos données actuelles seront remplacées.`, { libelle: 'Remplacer', danger: true }))) return;
      await store.remplacer(etat); toast('Sauvegarde importée.'); naviguer('/');
    } catch (e) { toast(e.message, 'erreur'); }
  };
  const effacer = async () => {
    if (!(await confirmer('Tout effacer ?', 'Clients, documents, recettes et réglages seront supprimés de ce navigateur. Exportez d’abord une sauvegarde si vous voulez les garder.', { libelle: 'Tout effacer', danger: true }))) return;
    await store.effacer(); location.replace(location.pathname);
  };
  page.append(entete('Réglages', 'Votre profil, vos échéances et vos données'),
    h('p', { class: 'aide enregistre', role: 'status' }, icone('check'), 'Chaque modification est enregistrée automatiquement dans ce navigateur.'),
    carte('Votre activité', 'user', h('p', { class: 'aide' }, 'Ces informations sont reprises sur chaque document que vous créez.'), h('div', { class: 'grille-champs' },
      t('Nom et prénom', 'emetteur.nom', { attrs: { maxlength: 120 } }), t('Nom commercial', 'emetteur.nomCommercial', { attrs: { maxlength: 120 } }),
      t('Adresse', 'emetteur.adresse', { attrs: { maxlength: 160 }, large: true }), t('Code postal', 'emetteur.cp', { attrs: { maxlength: 12 } }), t('Ville', 'emetteur.ville', { attrs: { maxlength: 120 } }),
      t('E-mail', 'emetteur.email', { type: 'email', attrs: { maxlength: 120 } }), t('Téléphone', 'emetteur.tel', { type: 'tel', attrs: { maxlength: 30 } }),
      t('SIREN', 'emetteur.siren', { attrs: { maxlength: 14, inputmode: 'numeric' } }), t('SIRET (facultatif)', 'emetteur.siret', { attrs: { maxlength: 17, inputmode: 'numeric' } }),
      o('Mon entreprise est en cours d’immatriculation', 'emetteur.enCours', true), o('Je suis membre d’une association agréée', 'emetteur.associationAgreee', true),
      t('IBAN (pour le virement)', 'emetteur.iban', { attrs: { maxlength: 42 }, large: true }), t('BIC', 'emetteur.bic', { attrs: { maxlength: 12 } }), t('Banque', 'emetteur.banque', { attrs: { maxlength: 120 } }),
      t('Assurance professionnelle', 'emetteur.assurance', { type: 'textarea', attrs: { maxlength: 300 }, large: true }))),
    carte('Régime et valeurs par défaut', 'sliders', h('div', { class: 'grille-champs' },
      sel('Votre activité', 'activite', Object.entries(ACTIVITES).map(([k, v]) => [k, v.libelle]), 'Elle détermine le plafond de chiffre d’affaires et les taux de cotisations.'),
      sel('Déclaration du chiffre d’affaires', 'periodicite', [['mois', 'Chaque mois'], ['trimestre', 'Chaque trimestre']]),
      t('Début d’activité (facultatif)', 'debutActivite', { type: 'date', aide: 'Pour calculer votre première déclaration.' }),
      t('Délai de paiement par défaut (jours)', 'delai', { attrs: { inputmode: 'numeric', maxlength: 3 } }),
      sel('Pénalités de retard par défaut', 'penalites', [['bce', 'Taux BCE majoré'], ['legal3', '3 fois le taux d’intérêt légal'], ['fixe', 'Taux fixe annuel']]), t('Taux fixe annuel (%)', 'tauxFixe', { attrs: { maxlength: 8 } }),
      sel('Mention de TVA par défaut', 'tvaMention', [['cibs', 'Code des impositions sur les biens et services (CIBS)'], ['cgi', 'Code général des impôts, art. 293 B']]))),
    carte('Échéances à suivre', 'calendar', h('div', { class: 'grille-champs' }, o('CFE (déclaration la première année, puis paiement)', 'options.cfe', true), o('Facturation électronique', 'options.fe', true), o('Dates limites d’option (versement libératoire)', 'options.options', true), o('Rappel pour la déclaration annuelle de revenus', 'options.ir', true)),
      h('p', { class: 'aide' }, 'Rappels dans votre agenda (à 9 h) :'), h('div', { class: 'grille-champs' }, rappel(7, '7 jours avant'), rappel(1, 'La veille'), rappel(0, 'Le jour même'))),
    carte('Vos données', 'shield', h('p', {}, `${store.etat.clients.length} client(s) · ${store.etat.documents.length} document(s) · ${store.etat.encaissements.length} recette(s) saisie(s), enregistrés dans ce navigateur uniquement.`),
      h('div', { class: 'actions' }, bouton('Exporter (JSON)', { icon: 'download', style: 'ghost', onclick: exportClair }), bouton('Exporter chiffré', { icon: 'lock', style: 'ghost', onclick: exportChiffre }), bouton('Importer une sauvegarde', { icon: 'upload', style: 'ghost', onclick: importerFichier }), bouton('Tout effacer', { icon: 'trash', style: 'ghost danger', onclick: effacer })),
      h('p', { class: 'aide' }, 'Vider les données du site dans votre navigateur efface aussi votre espace : faites une sauvegarde de temps en temps, et gardez-la hors de cet appareil.')),
    carte('Données réglementaires', 'check', h('p', {}, `Taux, plafonds et dates viennent de sources officielles (service-public.gouv.fr et autres sites de l’administration), vérifiées le ${dateFr(meta.derniereVerification)}.`),
      ancien ? h('p', { class: 'alerte attention', role: 'alert' }, icone('alert'), 'Ces données ont plus de six mois : vérifiez les taux sur le site officiel avant de les utiliser.') : null, h('p', { class: 'aide' }, `Version : ${meta.source}. Estimation indicative : seul l’avis de l’administration ou d’un expert-comptable fait foi.`)));
  void toastGlobal; void bouton;
  return page;
}
