# pro.glsc.fr

Deux choses dans ce dépôt : le **portail** (page d'entrée) et **GLSC Pro**, un espace de travail pour indépendants (`/espace/`).

Point d'entrée de l'espace pro : une page avec trois portes, **Admin** ([admin.glsc.fr](https://admin.glsc.fr)), **Studio** ([studio.glsc.fr](https://studio.glsc.fr)) et **Compta** ([compta.glsc.fr](https://compta.glsc.fr)), plus des raccourcis clavier (A, S, C).

Le portail n'a pas de connexion à lui : chaque espace garde la sienne (l'admin demande son identifiant et son code à usage unique). Il ne contient aucun secret, aucune donnée, aucun cookie, aucun appel à un service tiers, et la page n'est pas indexée par les moteurs de recherche.

## GLSC Pro : l'espace de travail (`/espace/`)

Clients, devis, factures, avoirs, paiements, recettes, échéances et tableau de bord. **Tout reste dans le navigateur** : pas de compte, pas de serveur, pas de cookie.

- **Tableau de bord** : encaissé de l'année, reste à encaisser, factures en retard, plafond de chiffre d'affaires, prochaine déclaration.
- **Documents** : numérotation continue, mentions légales issues des données officielles, aperçu en direct, statuts (brouillon, envoyé, accepté, payé…), paiements partiels, devis converti en facture ou en acompte, avoir, impression en PDF, courriel prérempli.
- **Recettes** : livre des recettes alimenté par les paiements des factures et par des saisies manuelles ; totaux par mois et par période de déclaration ; alerte de plafond ; export CSV.
- **Échéances** : déclarations, CFE, facturation électronique, avec rappels dans l'agenda (fichier `.ics`).
- **Données** : enregistrées dans IndexedDB seulement après le clic sur « Créer mon espace ». Export JSON, export **chiffré** (AES-GCM, clé dérivée du mot de passe par PBKDF2), import, effacement complet.
- Les calculs, les validations et les mentions viennent des modules de [Compta by glsc](https://github.com/gabinlsc/compta), copiés tels quels dans `public/espace/js/lib/` avec leurs données vérifiées (`public/espace/data/regles.json`). Pour les mettre à jour : `npm run sync` (avec le dépôt `compta` à côté), puis relire le diff.

Organisation du code (`public/espace/js/`) : `donnees.js` (modèle et nettoyage de tout ce qui entre), `store.js` et `stockage.js` (état et IndexedDB), `stats.js` (calculs, testés sous Node), `crypto.js` (sauvegarde chiffrée), `ui.js` (jamais d'`innerHTML`), `vues/` (une vue par page) et `main.js` (routeur).

## Contenu

- `public/` : le site, écrit à la main (HTML, CSS, un script de raccourcis). Style du kit de marque StudioGLSC (bleu #2447D6, Inter et Inter Display, monogramme inchangé, mode sombre) ; polices auto-hébergées (SIL OFL).
- `deploy.sh` : installe nginx et le certificat HTTPS, sauvegarde l'existant, remplace le site de façon atomique, vérifie que les pages répondent et remet l'ancienne version sinon.
- `deploy/pro-security.conf` : en-têtes de sécurité (CSP stricte sans code en ligne, HSTS, `noindex`) et cache.
- `tests/portail.mjs` : contrôle des liens, de l'absence de code en ligne, des raccourcis et de l'affichage mobile.
- `tests/unit/` : modèle de données, chiffrement, calculs. `tests/espace.mjs` : parcours complet de l'espace sous la CSP de production. `tests/a11y.mjs` : axe-core sur chaque vue, en clair et en sombre.

## Déployer

En root sur le serveur :

```bash
curl -fsSL https://raw.githubusercontent.com/gabinlsc/pro/main/deploy.sh | sudo bash
```

Options : `--domain`, `--email`, `--ref`, `--root`, `--no-tls`, `--dry-run` (voir l'en-tête du script). Le domaine doit pointer vers le serveur (enregistrement DNS A, et AAAA si IPv6).

### Déploiement automatique

Le dépôt `portfolio` reçoit le webhook GitHub de `gabinlsc/pro` : à chaque push sur `main`, `deploy/deploy-pro.sh` télécharge le dépôt et relance `deploy.sh` (même mécanisme que Compta). Pour activer : admin → GitHub et déploiements, créer le webhook pour `gabinlsc/pro`.

## Tester

```bash
npm install --no-save playwright   # une fois
node tests/portail.mjs && node tests/espace.mjs && node tests/a11y.mjs
node --test "tests/unit/*.test.mjs"
```
