// Sauvegarde chiffrée : AES-GCM 256 bits, clé dérivée du mot de passe par PBKDF2-SHA-256 (600 000 itérations). Aucun envoi : tout se passe dans le navigateur.
export const FORMAT_CHIFFRE = 'glsc-pro-sauvegarde-chiffree-1';
const ITERATIONS = 600_000;
const enc = new TextEncoder(), dec = new TextDecoder();
const versB64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function cle(motDePasse, sel, iterations) {
  const base = await globalThis.crypto.subtle.importKey('raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function chiffrer(texte, motDePasse, iterations = ITERATIONS) {
  if (typeof motDePasse !== 'string' || motDePasse.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  const sel = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await cle(motDePasse, sel, iterations);
  const data = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(texte)));
  return JSON.stringify({ format: FORMAT_CHIFFRE, kdf: 'PBKDF2-SHA256', iterations, sel: versB64(sel), iv: versB64(iv), data: versB64(data) });
}
export const estChiffre = (texte) => { try { return JSON.parse(texte)?.format === FORMAT_CHIFFRE; } catch { return false; } };
export async function dechiffrer(texte, motDePasse) {
  let o; try { o = JSON.parse(texte); } catch { throw new Error('Ce fichier n’est pas une sauvegarde valide.'); }
  if (o?.format !== FORMAT_CHIFFRE || !Number.isInteger(o.iterations) || o.iterations < 100_000 || o.iterations > 5_000_000) throw new Error('Ce fichier n’est pas une sauvegarde chiffrée de GLSC Pro.');
  try {
    const k = await cle(motDePasse, deB64(o.sel), o.iterations);
    return dec.decode(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(o.iv) }, k, deB64(o.data)));
  } catch { throw new Error('Mot de passe incorrect, ou fichier abîmé.'); }
}
