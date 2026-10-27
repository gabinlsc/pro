// Export Factur-X d'un document : charge pdf-lib, les polices et le profil de couleur à la demande, puis construit le PDF/A-3.
import { construireXml } from './cii.js';
import { construirePdf } from './pdf.js';

let cache = null;
async function ressources() {
  if (cache) return cache;
  const binaire = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('Une ressource nécessaire à la facture électronique est introuvable.'); return new Uint8Array(await r.arrayBuffer()); };
  const [lib, regulier, semi, gras, icc] = await Promise.all([import('../vendor/pdf-lib.js'), binaire('/espace/polices/Inter-Regular.ttf'), binaire('/espace/polices/Inter-SemiBold.ttf'), binaire('/espace/polices/Inter-Bold.ttf'), binaire('/espace/js/facturx/srgb.icc')]);
  cache = { lib, polices: { regulier, semi, gras }, icc };
  return cache;
}
export const nomFichier = (doc, extension) => `${doc.type === 'avoir' ? 'avoir' : 'facture'}-${doc.numero.trim()}`.replace(/[^A-Za-z0-9._-]+/g, '-') + `.${extension}`;

/** @returns { octets, nom } : le PDF/A-3 Factur-X, ou lève une erreur lisible. */
export async function exporterFacturX({ doc, a, ressourcesFournies = null, maintenant = new Date() }) {
  const r = construireXml(doc, a);
  if (r.erreurs.length) throw new Error(r.erreurs[0]);
  const res = ressourcesFournies ?? await ressources();
  const octets = await construirePdf({ doc, a, xml: r.xml, lib: res.lib, polices: res.polices, icc: res.icc, maintenant });
  return { octets, nom: nomFichier(doc, 'pdf'), xml: r.xml };
}
