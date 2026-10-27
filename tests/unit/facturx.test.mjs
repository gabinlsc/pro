import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { construireXml, codeUnite, sujetNote, peutEtreElectronique, echapper } from '../../public/espace/js/facturx/cii.js';
import { EXEMPLES, base, analyse } from './exemples-facturx.mjs';

const xml = (d) => { const a = analyse(d); assert.deepEqual(a.erreurs, [], 'le document d’exemple doit être valide'); const r = construireXml(d, a); assert.deepEqual(r.erreurs, []); return r.xml; };
const un = (x, motif) => { const m = x.match(motif); assert.ok(m, `introuvable : ${motif}`); return m[1]; };

test('toutes les factures d’exemple produisent un XML bien formé', () => {
  for (const [nom, d] of Object.entries(EXEMPLES)) {
    const x = xml(d); writeFileSync(`/tmp/fx-${nom}.xml`, x);
    try { execFileSync('xmllint', ['--noout', `/tmp/fx-${nom}.xml`], { stdio: 'pipe' }); } catch (e) { if (e.code !== 'ENOENT') assert.fail(`${nom} : ${e.stderr}`); }
    assert.ok(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  }
});
test('facture simple : profil, type, montants, vendeur et acheteur identifiés par SIREN', () => {
  const x = xml(EXEMPLES.simple);
  assert.equal(un(x, /<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>([^<]+)</), 'urn:cen.eu:en16931:2017');
  assert.equal(un(x, /<\/ram:ID><ram:TypeCode>(\d+)</), '380'); assert.equal(un(x, /<ram:IssueDateTime><udt:DateTimeString format="102">(\d+)</), '20261027');
  assert.equal(un(x, /<ram:LineTotalAmount>([\d.]+)<\/ram:LineTotalAmount><\/ram:SpecifiedTradeSettlementLineMonetarySummation>/), '1200.00');
  assert.equal(un(x, /<ram:DuePayableAmount>([\d.-]+)</), '1200.00'); assert.equal(un(x, /<ram:GrandTotalAmount>([\d.-]+)</), '1200.00');
  assert.match(x, /<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">732829320<\/ram:ID>/); assert.match(x, /<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">552120222<\/ram:ID>/);
  assert.match(x, /<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">732829320<\/ram:ID>/); assert.match(x, /<ram:CategoryCode>E<\/ram:CategoryCode><ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</);
  assert.match(x, /<ram:ExemptionReason>TVA non applicable, art\./); assert.match(x, /<ram:IBANID>FR7630006000011234567890189<\/ram:IBANID>/); assert.match(x, /<ram:BICID>BNPAFRPPXXX<\/ram:BICID>/);
  assert.match(x, /<ram:DueDateDateTime><udt:DateTimeString format="102">20261126</);
});
test('remises et unités : remise de ligne en montant, quantités à deux décimales, codes d’unité', () => {
  const x = xml(EXEMPLES['remise-et-unites']);
  assert.match(x, /<ram:BilledQuantity unitCode="DAY">3.50</); assert.match(x, /<ram:BilledQuantity unitCode="HUR">2.00</); assert.match(x, /<ram:BilledQuantity unitCode="ANN">1.00</);
  assert.match(x, /<ram:ChargeIndicator><udt:Indicator>false<\/udt:Indicator><\/ram:ChargeIndicator><ram:ActualAmount>196.87</); // 3,5 × 450 = 1 575 ; total remisé arrondi par lib/money.js à 1 378,13 : la remise exportée en est le complément exact
  assert.match(x, /<ram:LineTotalAmount>1378.13<\/ram:LineTotalAmount>/); assert.equal(un(x, /<ram:DuePayableAmount>([\d.-]+)</), '1638.12');
});
test('acompte (386), solde avec acomptes déduits et références, avoir (381) en montants positifs avec la facture annulée', () => {
  assert.equal(un(xml(EXEMPLES.acompte), /<\/ram:ID><ram:TypeCode>(\d+)</), '386'); assert.equal(un(xml(EXEMPLES.acompte), /<ram:DuePayableAmount>([\d.-]+)</), '1350.00');
  const s = xml(EXEMPLES.solde); assert.equal(un(s, /<ram:TotalPrepaidAmount>([\d.-]+)</), '1350.00'); assert.equal(un(s, /<ram:DuePayableAmount>([\d.-]+)</), '3150.00'); assert.match(s, /<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>F-2026-003</);
  const a = xml(EXEMPLES.avoir); assert.equal(un(a, /<\/ram:ID><ram:TypeCode>(\d+)</), '381'); assert.equal(un(a, /<ram:DuePayableAmount>([\d.-]+)</), '200.00'); assert.match(a, /<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>F-2026-001</); assert.doesNotMatch(a, /<ram:SpecifiedTradeSettlementPaymentMeans>/);
});
test('particulier : pas d’identifiant d’acheteur ; entreprise : adresse électronique SIREN (0225)', () => {
  const p = xml(EXEMPLES.particulier); assert.doesNotMatch(p.split('<ram:BuyerTradeParty>')[1], /SpecifiedLegalOrganization|0225/); assert.match(xml(EXEMPLES.simple).split('<ram:BuyerTradeParty>')[1], /schemeID="0225">552120222</);
});
test('caractères spéciaux : tout est échappé, rien d’injectable', () => {
  const x = xml(EXEMPLES.caracteres); assert.match(x, /Dupont &amp; Fils &lt;SARL&gt;/); assert.match(x, /5 € &amp; plus &lt;test&gt;/); assert.doesNotMatch(x, /<test>|<SARL>/);
  assert.equal(echapper('a\u0001b<&>"'), 'ab&lt;&amp;&gt;&quot;');
});
test('nom commercial : repris comme nom d’usage du vendeur', () => { assert.match(xml(EXEMPLES['nom-commercial']), /<ram:TradingBusinessName>GLSC Studio<\/ram:TradingBusinessName>/); });
test('notes : pénalités PMD, indemnité PMT, escompte AAB, mentions réglementaires REG', () => {
  const x = xml(EXEMPLES.simple); assert.match(x, /Pénalités de retard[^<]*<\/ram:Content><ram:SubjectCode>PMD</); assert.match(x, /Indemnité forfaitaire[^<]*<\/ram:Content><ram:SubjectCode>PMT</); assert.match(x, /Escompte[^<]*<\/ram:Content><ram:SubjectCode>AAB</); assert.match(x, /TVA non applicable[^<]*<\/ram:Content><ram:SubjectCode>REG</);
  assert.equal(sujetNote('Texte libre'), 'AAI');
});
test('refus explicites : devis, document incomplet, SIREN manquant, e-mail manquant', () => {
  assert.equal(peutEtreElectronique('devis'), false); assert.match(construireXml(base({ type: 'devis' }), analyse(base({ type: 'devis' }))).erreurs[0], /devis/);
  assert.match(construireXml(base({ numero: '' }), analyse(base({ numero: '' }))).erreurs[0], /Complétez/);
  const sansSiren = base({ client: { siren: '' } }); assert.ok(construireXml(sansSiren, analyse(sansSiren)).erreurs.some((e) => /SIREN du client/.test(e)) || analyse(sansSiren).bloque);
  const sansMail = base(); sansMail.emetteur.email = ''; assert.ok(construireXml(sansMail, analyse(sansMail)).erreurs.some((e) => /e-mail/.test(e)));
  const enCours = base(); enCours.emetteur.enCours = true; enCours.emetteur.siren = ''; assert.ok(construireXml(enCours, analyse(enCours)).erreurs.some((e) => /SIREN de votre entreprise/.test(e)));
});
test('codes d’unité', () => { for (const [t, c] of [['jour', 'DAY'], ['J', 'DAY'], ['h', 'HUR'], ['heures', 'HUR'], ['mois', 'MON'], ['', 'C62'], ['pièce', 'C62'], ['kg', 'KGM']]) assert.equal(codeUnite(t), c, t); });
