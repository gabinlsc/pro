// État de l'espace de travail : chargé depuis le stockage local, modifié par `modifier`, enregistré automatiquement, observable.
// Rien n'est écrit tant que l'utilisateur n'a pas cliqué sur « Créer mon espace » (ou importé une sauvegarde).
import { etatVide, nettoyerEtat, exporter } from './donnees.js';

export function creerStore({ stockage, aujourdhui }) {
  let etat = null, abonnes = new Set(), minuteur = null, enAttente = false, erreurEcriture = null;
  const notifier = () => abonnes.forEach((f) => f(etat));
  async function ecrire() {
    clearTimeout(minuteur); minuteur = null; enAttente = false;
    try { await stockage.ecrire(exporter(etat)); erreurEcriture = null; } catch (e) { erreurEcriture = e; }
    notifier();
  }
  return {
    get etat() { return etat; }, get erreurEcriture() { return erreurEcriture; }, get enAttente() { return enAttente; },
    abonner(f) { abonnes.add(f); return () => abonnes.delete(f); },
    /** Charge l'espace existant. Renvoie 'vide' s'il n'y en a pas encore, 'ok' sinon ; 'indisponible' si le navigateur refuse le stockage. */
    async charger() {
      if (!stockage.disponible()) return 'indisponible';
      let brut; try { brut = await stockage.lire(); } catch { return 'indisponible'; }
      if (!brut) return 'vide';
      try { etat = nettoyerEtat(JSON.parse(brut), aujourdhui()); } catch { return 'abime'; }
      return 'ok';
    },
    async creer(depart = null) { etat = depart ? nettoyerEtat(depart, aujourdhui()) : etatVide(aujourdhui()); await stockage.rendrePersistant(); await ecrire(); },
    /** Applique un changement sur l'état, puis l'enregistre (regroupé : au plus un enregistrement toutes les 250 ms). */
    modifier(fn) { fn(etat); enAttente = true; clearTimeout(minuteur); minuteur = setTimeout(ecrire, 250); notifier(); },
    async vider() { await ecrire(); },
    async remplacer(nouvel) { etat = nettoyerEtat(nouvel, aujourdhui()); await ecrire(); },
    async effacer() { clearTimeout(minuteur); enAttente = false; abonnes = new Set(); await stockage.effacer(); etat = null; },
  };
}
