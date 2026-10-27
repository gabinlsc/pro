// Dates au format ISO (AAAA-MM-JJ), calculées en UTC pour éviter tout décalage d'heure d'été.
export const dateIsoValide = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
export function ajouterJours(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const dernierJourDuMois = (annee, mois) => new Date(Date.UTC(annee, mois, 0, 12)).toISOString().slice(0, 10); // mois de 1 à 12
export const dateLongue = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Ajoute des mois (le jour est ramené au dernier jour du mois d'arrivée si besoin : 31 janvier + 1 mois = 28 février). */
export function ajouterMois(iso, n) {
  const [a, m, j] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + n, an = Math.floor(total / 12), mois = (total % 12) + 1;
  const dernier = Number(dernierJourDuMois(an, mois).slice(8));
  return `${String(an).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`;
}
export const jourSemaine = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
/** Un samedi ou un dimanche est reporté au lundi suivant (règle de prorogation des délais de la CFE). */
export const prochainJourOuvre = (iso) => { const w = jourSemaine(iso); return w === 6 ? ajouterJours(iso, 2) : w === 0 ? ajouterJours(iso, 1) : iso; };
export const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
