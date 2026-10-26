# pro.glsc.fr

Point d'entrée de l'espace pro : une page avec trois portes, **Admin** ([admin.glsc.fr](https://admin.glsc.fr)), **Studio** ([studio.glsc.fr](https://studio.glsc.fr)) et **Compta** ([compta.glsc.fr](https://compta.glsc.fr)), plus des raccourcis clavier (A, S, C).

Le portail n'a pas de connexion à lui : chaque espace garde la sienne (l'admin demande son identifiant et son code à usage unique). Il ne contient aucun secret, aucune donnée, aucun cookie, aucun appel à un service tiers, et la page n'est pas indexée par les moteurs de recherche.

## Contenu

- `public/` : le site, écrit à la main (HTML, CSS, un script de raccourcis). Polices Fredoka et Space Grotesk auto-hébergées (SIL OFL).
- `deploy.sh` : installe nginx et le certificat HTTPS, sauvegarde l'existant, remplace le site de façon atomique, vérifie que les pages répondent et remet l'ancienne version sinon.
- `deploy/pro-security.conf` : en-têtes de sécurité (CSP stricte sans code en ligne, HSTS, `noindex`) et cache.
- `tests/portail.mjs` : contrôle des liens, de l'absence de code en ligne, des raccourcis et de l'affichage mobile.

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
node tests/portail.mjs
```
