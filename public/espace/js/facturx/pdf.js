// Facture au format Factur-X : un PDF/A-3 lisible (mise en page de la facture) qui embarque factur-x.xml (profil EN 16931).
// pdf-lib est chargé à la demande (voir tools/vendor-pdf.mjs). Rien n'est envoyé : tout se construit dans le navigateur.
import { formaterQuantite, formaterEuros } from '../lib/money.js';
import { dateLongue } from '../lib/dates.js';
import { PROFIL } from './cii.js';

const A4 = [595.28, 841.89], M = 44;
const eur = (c) => formaterEuros(c, { decimales: 2 }).replace(/[  ]/g, ' ');
const nettoyer = (t) => String(t ?? '').replace(/[  ]/g, ' ').replace(/[^ -~¡-ÿŒœŸ–—‘-‟•…€−→\n]/g, '?');
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const echapperXml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function empreinte(u8) { const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', u8)); return h.slice(0, 16); }

function xmp({ titre, auteur, description, creation }) {
  const fx = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
  const prop = (nom, desc) => `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${nom}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${desc}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`
    + `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${echapperXml(titre)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${echapperXml(auteur)}</rdf:li></rdf:Seq></dc:creator><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${echapperXml(description)}</rdf:li></rdf:Alt></dc:description></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>GLSC Pro</pdf:Producer></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>GLSC Pro</xmp:CreatorTool><xmp:CreateDate>${creation}</xmp:CreateDate><xmp:ModifyDate>${creation}</xmp:ModifyDate><xmp:MetadataDate>${creation}</xmp:MetadataDate></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>${fx}</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>`
    + prop('DocumentFileName', 'name of the embedded XML invoice file') + prop('DocumentType', 'INVOICE') + prop('Version', 'The actual version of the Factur-X XML schema') + prop('ConformanceLevel', 'The conformance level of the embedded Factur-X data')
    + `</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:fx="${fx}"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>${PROFIL.version}</fx:Version><fx:ConformanceLevel>${PROFIL.facturX}</fx:ConformanceLevel></rdf:Description>`
    + `</rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}

/**
 * @param lib : module vendor/pdf-lib.js ; polices : { regulier, semi, gras } (octets TrueType) ; icc : octets du profil sRGB ; xml : texte de factur-x.xml
 * @returns Uint8Array : le PDF/A-3 avec la facture embarquée
 */
export async function construirePdf({ doc, a, xml, lib, polices, icc, maintenant = new Date() }) {
  const { PDFDocument, PDFName, PDFString, PDFHexString, rgb, fontkit } = lib;
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const F = { n: await pdf.embedFont(polices.regulier, { subset: true }), s: await pdf.embedFont(polices.semi, { subset: true }), b: await pdf.embedFont(polices.gras, { subset: true }) };
  const encre = rgb(0.043, 0.071, 0.125), gris = rgb(0.34, 0.38, 0.45), bleu = rgb(0.106, 0.216, 0.69), blanc = rgb(1, 1, 1), fond = rgb(0.965, 0.969, 0.976), fondBleu = rgb(0.914, 0.933, 0.996), trait = rgb(0.88, 0.9, 0.93);
  const e = doc.emetteur, c = doc.client, avoir = doc.type === 'avoir', devis = false;
  let page = pdf.addPage(A4), y = A4[1] - M;
  const L = (t, police, taille, largeur) => {
    const sortie = [];
    for (const para of nettoyer(t).split('\n')) {
      let ligne = '';
      for (const mot of para.split(/\s+/).filter(Boolean)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (police.widthOfTextAtSize(essai, taille) <= largeur || !ligne) ligne = essai; else { sortie.push(ligne); ligne = mot; }
      }
      sortie.push(ligne);
    }
    return sortie;
  };
  const ecrire = (t, x, yy, { police = F.n, taille = 9, couleur = encre, droite = false } = {}) => { const s = nettoyer(t); page.drawText(s, { x: droite ? x - police.widthOfTextAtSize(s, taille) : x, y: yy, size: taille, font: police, color: couleur }); };
  const paragraphe = (t, x, largeur, { police = F.n, taille = 9, couleur = encre, interligne = 1.35 } = {}) => { for (const l of L(t, police, taille, largeur)) { ecrire(l, x, y, { police, taille, couleur }); y -= taille * interligne; } };
  const place = (h) => { if (y - h < M + 28) { page = pdf.addPage(A4); y = A4[1] - M; return true; } return false; };

  // ---- en-tête : vendeur à gauche, titre et références à droite
  const droite = A4[0] - M; let yg = y, yd = y;
  const bloc = [`${a.identite[0]}`, ...a.identite.slice(1), e.email.trim(), e.tel.trim()].filter(Boolean);
  bloc.forEach((t, i) => { for (const l of L(t, i === 0 ? F.b : F.n, 9.5, 250)) { ecrire(l, M, yg, { police: i === 0 ? F.b : F.n, taille: 9.5 }); yg -= 12.5; } });
  ecrire(a.titre.toUpperCase(), droite, yd - 4, { police: F.b, taille: 20, couleur: bleu, droite: true }); yd -= 28;
  const refs = [`N° ${doc.numero.trim()}`, `Date : ${dateLongue(doc.dateEmission)}`, doc.datePrestation ? (doc.type === 'acompte' ? `Acompte versé le ${dateLongue(doc.datePrestation)}` : `Prestation ou livraison : ${dateLongue(doc.datePrestation)}`) : '', a.echeance ? (a.echeance === doc.dateEmission ? 'Échéance : à réception' : `Échéance : ${dateLongue(a.echeance)}`) : '', doc.reference.trim() ? `${avoir ? 'Facture annulée' : 'Devis'} : ${doc.reference.trim()}` : '', doc.bonCommande.trim() ? `Bon de commande : ${doc.bonCommande.trim()}` : ''].filter(Boolean);
  refs.forEach((t, i) => { ecrire(t, droite, yd, { police: i === 0 ? F.b : F.n, taille: 9.5, droite: true }); yd -= 12.5; });
  y = Math.min(yg, yd) - 14;
  // ---- client
  const adresseClient = [c.adresse.trim(), [c.cp.trim(), c.ville.trim()].filter(Boolean).join(' '), c.siren.trim() ? `SIREN ${c.siren.trim()}` : '', c.tvaIntra.trim() ? `TVA intracommunautaire ${c.tvaIntra.trim()}` : ''].filter(Boolean);
  const hauteurClient = 22 + 13 + adresseClient.length * 12.5 + 8, largeurClient = 250;
  place(hauteurClient);
  page.drawRectangle({ x: droite - largeurClient, y: y - hauteurClient, width: largeurClient, height: hauteurClient, color: fond });
  ecrire('FACTURÉ À', droite - largeurClient + 12, y - 15, { police: F.s, taille: 7.5, couleur: gris });
  ecrire(c.nom.trim(), droite - largeurClient + 12, y - 30, { police: F.b, taille: 10 });
  adresseClient.forEach((t, i) => ecrire(t, droite - largeurClient + 12, y - 43 - i * 12.5, { taille: 9.5 }));
  y -= hauteurClient + 18;
  if (doc.objet.trim()) { place(20); ecrire('Objet : ', M, y, { police: F.b, taille: 9.5 }); const w = F.b.widthOfTextAtSize('Objet : ', 9.5); const ls = L(doc.objet.trim(), F.n, 9.5, droite - M - w); ls.forEach((l, i) => { ecrire(l, M + (i ? 0 : w), y, { taille: 9.5 }); y -= 12.5; }); y -= 6; }
  // ---- tableau des lignes
  const cols = { qte: droite - 238, pu: droite - 168, remise: droite - 94, total: droite }; const largeurDesc = cols.qte - M - 30;
  const enteteTable = () => { place(26); page.drawRectangle({ x: M, y: y - 17, width: droite - M, height: 20, color: bleu }); ecrire('Désignation', M + 6, y - 11, { police: F.b, taille: 8.5, couleur: blanc }); ecrire('Qté', cols.qte + 40, y - 11, { police: F.b, taille: 8.5, couleur: blanc, droite: true }); ecrire('Prix unitaire', cols.pu + 60, y - 11, { police: F.b, taille: 8.5, couleur: blanc, droite: true }); ecrire('Remise', cols.remise + 40, y - 11, { police: F.b, taille: 8.5, couleur: blanc, droite: true }); ecrire('Total', cols.total - 6, y - 11, { police: F.b, taille: 8.5, couleur: blanc, droite: true }); y -= 24; };
  enteteTable();
  for (const l of a.lignes) {
    const ls = L(l.desc, F.n, 9, largeurDesc), h = ls.length * 11.5 + 9;
    if (place(h)) enteteTable();
    ls.forEach((t, i) => ecrire(t, M + 6, y - 10 - i * 11.5, { taille: 9 }));
    ecrire(`${formaterQuantite(l.qty100)}${l.unite ? ' ' + l.unite : ''}`, cols.qte + 40, y - 10, { taille: 9, droite: true }); ecrire(eur(l.unit), cols.pu + 60, y - 10, { taille: 9, droite: true });
    if (l.remise100) ecrire(`${String(l.remise100 / 100).replace('.', ',')} %`, cols.remise + 40, y - 10, { taille: 9, droite: true });
    ecrire(eur(l.total * a.signe), cols.total - 6, y - 10, { taille: 9, droite: true });
    y -= h; page.drawLine({ start: { x: M, y }, end: { x: droite, y }, thickness: 0.6, color: trait });
  }
  y -= 12;
  // ---- totaux
  if (a.acompteInfo) { place(14); ecrire(`Total convenu : ${eur(a.acompteInfo.base)}. Acompte de ${a.acompteInfo.pct} %.`, M, y, { taille: 9, couleur: gris }); y -= 16; }
  if (a.deductions.length) { place(16 + a.deductions.length * 13); ecrire('Total de la commande', droite - 150, y, { taille: 9.5 }); ecrire(eur(a.sousTotal), droite, y, { taille: 9.5, droite: true }); y -= 13; for (const d of a.deductions) { ecrire(`Acompte déjà facturé (${d.numero})`, droite - 150, y, { taille: 9.5 }); ecrire(`- ${eur(d.montant)}`, droite, y, { taille: 9.5, droite: true }); y -= 13; } y -= 4; }
  const libelleTotal = avoir ? 'Total de l’avoir' : doc.type === 'solde' ? 'Solde à payer' : doc.type === 'acompte' ? 'Acompte à payer' : 'Total à payer';
  place(34); page.drawRectangle({ x: droite - 250, y: y - 24, width: 250, height: 28, color: fondBleu }); ecrire(libelleTotal, droite - 240, y - 15, { taille: 10.5 }); ecrire(eur(a.total), droite - 10, y - 15, { police: F.b, taille: 13, droite: true }); y -= 42;
  paragraphe('Total net à payer : TVA non applicable.', M, droite - M, { taille: 9, couleur: gris });
  if (!avoir && (a.iban || a.bic)) { y -= 4; paragraphe(`Règlement par virement : ${[e.banque.trim(), a.iban && `IBAN ${a.iban}`, a.bic && `BIC ${a.bic}`].filter(Boolean).join(' · ')} · Référence à rappeler : ${doc.numero.trim()}`, M, droite - M, { taille: 9, couleur: gris }); }
  // ---- mentions légales
  y -= 12; place(40); page.drawLine({ start: { x: M, y: y + 4 }, end: { x: droite, y: y + 4 }, thickness: 0.6, color: trait }); y -= 8;
  for (const m of a.mentions) { place(24); paragraphe(m, M, droite - M, { taille: 7.8, couleur: gris, interligne: 1.3 }); y -= 2; }
  // ---- pied de page
  const pages = pdf.getPages();
  pages.forEach((p, i) => { const t = nettoyer(`Facture électronique Factur-X (${PROFIL.facturX}) · ${doc.numero.trim()} · page ${i + 1}/${pages.length}`); p.drawText(t, { x: M, y: 24, size: 7.5, font: F.n, color: gris }); });

  // ---- PDF/A-3 : métadonnées, profil de couleur, pièce jointe, identifiant
  const ctx = pdf.context, cat = pdf.catalog, creation = iso(maintenant);
  const titre = `${a.titre} ${doc.numero.trim()}`, auteur = e.nom.trim() || 'GLSC Pro', description = `${a.titre} ${doc.numero.trim()} de ${auteur} (Factur-X ${PROFIL.facturX})`;
  pdf.setTitle(titre); pdf.setAuthor(auteur); pdf.setSubject(description); pdf.setProducer('GLSC Pro'); pdf.setCreator('GLSC Pro'); pdf.setCreationDate(maintenant); pdf.setModificationDate(maintenant);
  cat.set(PDFName.of('Metadata'), ctx.register(ctx.stream(new TextEncoder().encode(xmp({ titre, auteur, description, creation })), { Type: 'Metadata', Subtype: 'XML' })));
  const flux = ctx.register(ctx.flateStream(icc, { N: 3 }));
  cat.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB'), Info: PDFString.of('sRGB'), DestOutputProfile: flux }))]));
  const octets = new TextEncoder().encode(xml), date = PDFString.fromDate(maintenant);
  const pj = ctx.register(ctx.flateStream(octets, { Type: 'EmbeddedFile', Subtype: 'text/xml', Params: ctx.obj({ Size: octets.length, ModDate: date }) }));
  const spec = ctx.register(ctx.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFHexString.fromText('factur-x.xml'), Desc: PDFHexString.fromText('Facture électronique Factur-X'), AFRelationship: 'Alternative', EF: ctx.obj({ F: pj, UF: pj }) }));
  cat.set(PDFName.of('AF'), ctx.obj([spec]));
  cat.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: ctx.obj({ Names: [PDFHexString.fromText('factur-x.xml'), spec] }) }));
  cat.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true })); cat.set(PDFName.of('Lang'), PDFString.of('fr-FR'));
  const id = hex(await empreinte(octets)); ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
