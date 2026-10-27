# Facture électronique (Factur-X) dans GLSC Pro

## Ce que produit l'application

Pour une facture, une facture d'acompte, une facture de solde ou un avoir, l'espace de travail peut générer, dans le navigateur :

- un **PDF Factur-X** : un PDF/A-3b lisible (même mise en page que l'aperçu) qui embarque `factur-x.xml` ;
- ou le **XML seul** (`factur-x.xml`).

Profil : **EN 16931** (`urn:cen.eu:en16931:2017`), syntaxe UN/CEFACT *Cross Industry Invoice* D16B. Un devis n'a pas de version électronique.

GLSC Pro **produit le fichier ; il n'est pas une plateforme agréée** et ne transmet rien à l'administration. Le fichier se dépose sur la plateforme de votre choix ou s'envoie au client.

## Ce qui est vérifié

`tests/facturx.mjs` convertit 9 documents d'exemple (facture simple, remises et unités, acompte, solde avec acomptes, avoir, client particulier, caractères spéciaux, nom commercial, facture de deux pages) et les fait valider par [Mustang](https://www.mustangproject.org) (`Mustang-CLI` 2.26.0) :

- PDF/A-3b selon veraPDF (ISO 19005-3) ;
- XML du profil EN 16931 selon les schématrons européens ;
- règles françaises du flux 2 (`BR-FR`, AFNOR XP Z12-012).

Les « notices » de validation propres à l'Allemagne (XRechnung, `BR-DE`) ne sont pas des erreurs et sont ignorées. Le même contrôle tourne en CI (Java et le jar, vérifié par empreinte SHA-256) ; en local : `MUSTANG_JAR=/chemin/Mustang-CLI-2.26.0.jar node tests/facturx.mjs`. Le test de parcours (`tests/espace.mjs`) valide aussi le fichier téléchargé depuis le navigateur.

## Choix de codage à connaître

| Sujet | Choix | Pourquoi |
|---|---|---|
| TVA | catégorie `E`, taux 0, motif `VATEX-FR-FRANCHISE`, texte de la mention (art. 293 B du CGI ou CIBS, selon vos réglages) | franchise en base de TVA des micro-entrepreneurs |
| Vendeur sans numéro de TVA | SIREN répété en BT-32 (`SpecifiedTaxRegistration`, schéma `FC`) | exigé par la règle européenne BR-E-02 ; la norme AFNOR XP Z12-012 demande de répéter le SIREN quand il n'y a pas de numéro de TVA |
| Identifiants | SIREN, schéma `0002` (organisation) ; adresse de facturation électronique : SIREN, schéma `0225` | règles françaises du flux 2 |
| Remise de ligne | prix unitaire brut + remise de ligne en montant (`SpecifiedTradeAllowanceCharge`) | le total de ligne reste celui de l'aperçu, au centime |
| Mentions légales | notes `IncludedNote` : `PMD` pénalités, `PMT` indemnité de recouvrement, `AAB` escompte, `REG` mentions réglementaires | usage français du format |
| Particulier | pas d'identifiant d'acheteur | l'e-facturation ne vise que les échanges entre entreprises |

## Ce qui n'est pas vérifié

- Le codage « franchise en base » (catégorie `E` + SIREN en BT-32) valide aux schématrons, mais je n'ai pas pu le confronter à une plateforme agréée réelle. À contrôler auprès de la plateforme que vous choisirez.
- Les échéances légales de la réforme ne sont pas écrites dans l'application : elles doivent venir de `data/regles.json` (Compta by glsc) après vérification sur une source officielle.
- Aucun envoi, aucun annuaire : GLSC Pro ne parle à aucune plateforme.

## Reconstruire

- `npm run vendor` régénère `public/espace/js/vendor/pdf-lib.js` (pdf-lib et fontkit, licence MIT).
- Polices : Inter (SIL OFL), sous-ensemble latin converti en TrueType avec `python3 tools/otf2ttf.py` (nécessite `fonttools`). Le profil de couleur `srgb.icc` est un profil sRGB minimal généré avec Pillow (`ImageCms.createProfile('sRGB')`).
