// Stockage local : IndexedDB, dans ce navigateur uniquement. Une version en mémoire sert aux tests.
const BASE = 'glsc-pro', TABLE = 'kv', CLE = 'espace';
const ouvrir = () => new Promise((ok, ko) => { const r = indexedDB.open(BASE, 1); r.onupgradeneeded = () => r.result.createObjectStore(TABLE); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const tx = (db, mode, f) => new Promise((ok, ko) => { const t = db.transaction(TABLE, mode); const r = f(t.objectStore(TABLE)); t.oncomplete = () => ok(r.result); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); });

export function stockageNavigateur() {
  return {
    disponible: () => typeof indexedDB !== 'undefined',
    /** Ne crée pas la base si elle n'existe pas encore : avant « Créer mon espace », rien n'est ajouté dans le navigateur. */
    async lire() { if (indexedDB.databases) { const liste = await indexedDB.databases(); if (!liste.some((d) => d.name === BASE)) return null; } const db = await ouvrir(); try { return (await tx(db, 'readonly', (s) => s.get(CLE))) ?? null; } finally { db.close(); } },
    async ecrire(texte) { const db = await ouvrir(); try { await tx(db, 'readwrite', (s) => s.put(texte, CLE)); } finally { db.close(); } },
    async effacer() { const db = await ouvrir(); try { await tx(db, 'readwrite', (s) => s.delete(CLE)); } finally { db.close(); } },
    async rendrePersistant() { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } },
  };
}
export function stockageMemoire(initial = null) {
  let v = initial;
  return { disponible: () => true, async lire() { return v; }, async ecrire(t) { v = t; }, async effacer() { v = null; }, async rendrePersistant() { return false; } };
}
