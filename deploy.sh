#!/usr/bin/env bash
# Déploie le portail pro.glsc.fr sur un serveur Debian ou Ubuntu : nginx, certificat HTTPS Let's Encrypt, site, en-têtes de sécurité, rotation des journaux.
# À lancer en root. Relançable à volonté (mise à jour du site, du snippet nginx et des journaux ; le vhost et le certificat déjà en place ne sont pas touchés).
#
#   curl -fsSL https://raw.githubusercontent.com/gabinlsc/pro/main/deploy.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/gabinlsc/pro/main/deploy.sh | sudo bash -s -- --domain pro.exemple.fr --email moi@exemple.fr
#   curl -fsSL https://raw.githubusercontent.com/gabinlsc/pro/main/deploy.sh | sudo bash -s -- --ref feature/ma-branche --no-tls
#
# Options (ou variables d'environnement) :
#   --domain  nom de domaine            (PRO_DOMAIN, défaut pro.glsc.fr)
#   --email   e-mail pour Let's Encrypt (PRO_EMAIL,  défaut pro@glsc.fr)
#   --ref     branche, tag ou commit    (PRO_REF,    défaut main)
#   --root    dossier du site           (PRO_ROOT,   défaut /var/www/<domaine>)
#   --no-tls  ne pas demander de certificat (site en HTTP seulement, pour un essai)
#   --dry-run affiche ce qui serait fait sans rien modifier
# Pour tester une copie locale du dépôt : PRO_SRC=/chemin/du/depot (au lieu du téléchargement).
#
# Ce que fait le script : installe nginx et certbot si besoin ; télécharge la version demandée ; sauvegarde l'existant (5 dernières) ;
# installe le site par échange atomique ; vérifie que les pages répondent et remet l'ancienne version sinon ; installe le snippet d'en-têtes
# (CSP stricte, HSTS, cache) ; crée le vhost nginx au premier lancement ; obtient le certificat ; limite les journaux à 35 jours.
# Codes de sortie : 0 réussi · 1 échec (rien à restaurer ou erreur) · 3 échec, ancienne version remise en service.
set -euo pipefail

DOMAIN="${PRO_DOMAIN:-pro.glsc.fr}"
EMAIL="${PRO_EMAIL:-pro@glsc.fr}"
REF="${PRO_REF:-main}"
ROOT="${PRO_ROOT:-}"
TLS=1
DRY=0
REPO=gabinlsc/pro
BACKUPS=/var/backups/pro
LOGDIR=/var/log/nginx/pro

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?valeur manquante pour --domain}"; shift 2 ;;
    --email) EMAIL="${2:?valeur manquante pour --email}"; shift 2 ;;
    --ref) REF="${2:?valeur manquante pour --ref}"; shift 2 ;;
    --root) ROOT="${2:?valeur manquante pour --root}"; shift 2 ;;
    --no-tls) TLS=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,22p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || true; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { c 36 "▸ $*"; }
ok() { c 32 "  ✓ $*"; }
warn() { c 33 "  ! $*"; }
die() { c 31 "  ✗ $*"; exit 1; }
run() { if [ "$DRY" = 1 ]; then echo "  (dry-run) $*"; else "$@"; fi; }

[[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || die "Nom de domaine invalide : $DOMAIN"
[[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || die "E-mail invalide : $EMAIL"
[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || die "Référence git invalide : $REF"
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || die "À lancer en root (sudo)."
ROOT="${ROOT:-/var/www/$DOMAIN}"
info "Site : $DOMAIN · dossier : $ROOT · version : ${PRO_SRC:+copie locale}${PRO_SRC:-$REF}"

diagnostic() {
  c 33 "  Diagnostic (à envoyer si le problème persiste) :"
  echo "  · Ports 80/443 à l'écoute :"; (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E ':(80|443)\b' | sed 's/^/      /' || true
  echo "  · État de nginx :"; (systemctl status nginx --no-pager 2>&1 || true) | head -12 | sed 's/^/      /'
  echo "  · Dernières erreurs nginx :"; tail -n 8 /var/log/nginx/error.log "$LOGDIR/error.log" 2>/dev/null | sed 's/^/      /' || true
  echo "  · Sites actifs sur le port 80 :"; (nginx -T 2>/dev/null | grep -E 'server_name|listen +(\[::\]:)?80' | sort | uniq -c | head -12) | sed 's/^/      /' || true
}

# ---- paquets
need=()
command -v nginx >/dev/null || need+=(nginx)
command -v curl >/dev/null || need+=(curl)
if [ "$TLS" = 1 ] && ! command -v certbot >/dev/null; then need+=(certbot python3-certbot-nginx); fi
if [ "${#need[@]}" -gt 0 ]; then
  command -v apt-get >/dev/null || die "Installer à la main : ${need[*]} (ce script gère apt, Debian/Ubuntu)."
  info "Installation : ${need[*]}"
  run env DEBIAN_FRONTEND=noninteractive apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
  ok "paquets installés"
fi

# ---- téléchargement
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
if [ -n "${PRO_SRC:-}" ]; then SRC="$PRO_SRC"
else
  info "Téléchargement de $REPO@$REF"
  [ "$DRY" = 1 ] && { echo "  (dry-run) curl codeload.github.com/$REPO/tar.gz/$REF"; SRC=""; } || {
    curl -fsSL --retry 3 --max-time 120 "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$WORK" || die "Téléchargement impossible (dépôt privé, branche inconnue ou réseau)."
    SRC="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | head -1)"
  }
fi
if [ "$DRY" = 0 ]; then
  [ -s "$SRC/public/index.html" ] || die "public/index.html introuvable dans la version téléchargée : le dépôt est incomplet."
  [ -s "$SRC/deploy/pro-security.conf" ] || die "deploy/pro-security.conf introuvable."
  ok "archive complète"
fi

# ---- sauvegarde
if [ -d "$ROOT" ] && [ -n "$(ls -A "$ROOT" 2>/dev/null)" ]; then
  run install -d -m 700 "$BACKUPS"
  BK="$BACKUPS/$DOMAIN-$(date +%Y%m%d-%H%M%S).tar.gz"
  run tar -czf "$BK" -C "$ROOT" .
  [ "$DRY" = 1 ] || { ok "sauvegarde : $BK"; ls -1t "$BACKUPS"/"$DOMAIN"-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f; }
else BK=""; fi

# ---- installation du site (échange atomique)
rollback() {
  if [ -n "$BK" ]; then c 31 "  ↩ retour à la version précédente"; else c 31 "  ↩ premier déploiement : pas de version précédente, fichiers laissés en place pour diagnostic"; exit 1; fi
  rm -rf "$ROOT.failed"; [ -d "$ROOT" ] && mv "$ROOT" "$ROOT.failed"
  mkdir -p "$ROOT"; tar -xzf "$BK" -C "$ROOT"
  rm -rf "$ROOT.failed"; exit 3   # 3 : la nouvelle version a échoué, l'ancienne est remise en service (convention du déploiement automatique du dépôt portfolio)
}
if [ "$DRY" = 0 ]; then
  rm -rf "$ROOT.new" "$ROOT.old"
  mkdir -p "$(dirname "$ROOT")"
  cp -r "$SRC/public" "$ROOT.new"
  find "$ROOT.new" -type d -exec chmod 755 {} + ; find "$ROOT.new" -type f -exec chmod 644 {} +
  [ -d "$ROOT" ] && mv "$ROOT" "$ROOT.old"
  mv "$ROOT.new" "$ROOT"
  chown -R root:root "$ROOT" 2>/dev/null || true
  ok "fichiers en place"
else echo "  (dry-run) installation de public/ dans $ROOT"; fi

# ---- nginx : snippet d'en-têtes, journaux, vhost
SNIP=/etc/nginx/snippets/pro-security.conf
VHOST_AVAIL=/etc/nginx/sites-available/$DOMAIN
VHOST_ENAB=/etc/nginx/sites-enabled/$DOMAIN
if [ "$DRY" = 0 ]; then
  install -d /etc/nginx/snippets "$LOGDIR"
  install -m 644 "$SRC/deploy/pro-security.conf" "$SNIP"
  ok "en-têtes de sécurité : $SNIP"
  # Journaux : 35 jours au plus, comme annoncé dans la politique de confidentialité (dossier à part : pas de conflit avec la rotation de nginx).
  cat > /etc/logrotate.d/pro <<LOGROTATE
$LOGDIR/*.log {
    daily
    rotate 35
    maxage 35
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        [ ! -f /run/nginx.pid ] || kill -USR1 \$(cat /run/nginx.pid)
    endscript
}
LOGROTATE
  ok "journaux : conservés 35 jours au plus ($LOGDIR)"
  if [ ! -e "$VHOST_AVAIL" ]; then
    V6LISTEN=''; [ -e /proc/net/if_inet6 ] && V6LISTEN='listen [::]:80;'
    cat > "$VHOST_AVAIL" <<VHOST
# Portail pro : généré par deploy.sh. Certbot y ajoute le bloc HTTPS et la redirection ; ce fichier n'est plus réécrit ensuite.
server {
    listen 80;
    $V6LISTEN
    server_name $DOMAIN;
    root $ROOT;
    index index.html;
    access_log $LOGDIR/access.log;
    error_log $LOGDIR/error.log;

    include snippets/pro-security.conf;

    location / { try_files \$uri \$uri/ =404; }
    error_page 404 /404.html;
}
VHOST
    ln -sf "$VHOST_AVAIL" "$VHOST_ENAB"
    ok "vhost créé : $VHOST_AVAIL"
  else
    grep -q 'snippets/pro-security.conf' "$VHOST_AVAIL" && ok "vhost existant : inchangé (snippet déjà inclus)" || warn "vhost existant sans « include snippets/pro-security.conf; » : à ajouter dans le bloc server de $VHOST_AVAIL"
  fi
  nginx -t 2>/dev/null || { nginx -t; die "Configuration nginx invalide."; }
  if systemctl is-active --quiet nginx 2>/dev/null; then systemctl reload nginx
  elif pgrep -x nginx >/dev/null; then nginx -s reload
  else { systemctl enable --now nginx 2>/dev/null || nginx; } || { diagnostic; die "nginx ne démarre pas (port 80 déjà utilisé par un autre service ?)"; }; fi
  ok "nginx rechargé"
else echo "  (dry-run) snippet, logrotate, vhost $VHOST_AVAIL, rechargement de nginx"; fi

# ---- vérification (avant le certificat : en local, avec l'en-tête Host)
verifier() { # $1 = chemin ; renvoie le code HTTP (000 si la connexion échoue), avec quelques essais le temps que nginx démarre
  local code="000" i
  for i in 1 2 3 4 5 6 7 8; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $DOMAIN" "http://127.0.0.1$1" 2>/dev/null)" || code="000"
    [ "$code" != 000 ] && break; sleep 1
  done
  echo "$code"
}
if [ "$DRY" = 0 ]; then
  for path in / /404.html /assets/pro.css /assets/pro.js /assets/fonts/fredoka-latin-700-normal.woff2 /robots.txt; do
    code="$(verifier "$path")"
    case "$code" in
      200) ok "$path → 200" ;;
      301|308) ok "$path → $code (redirection HTTPS)" ;;
      000) c 31 "  ✗ $path → aucune réponse sur 127.0.0.1:80 (nginx n'écoute pas sur le port 80, ou un autre service l'occupe)"; diagnostic; rollback ;;
      *) c 31 "  ✗ $path → $code"; diagnostic; rollback ;;
    esac
  done
  hdr="$(curl -sI --max-time 15 -H "Host: $DOMAIN" http://127.0.0.1/ | tr -d '\r' | grep -i '^content-security-policy' || true)"
  [ -n "$hdr" ] && ok "en-tête Content-Security-Policy présent" || warn "en-tête Content-Security-Policy absent (page servie par un autre vhost ?)"
fi

# ---- DNS et certificat
if [ "$DRY" = 0 ] && command -v getent >/dev/null; then
  dns="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
  me="$(curl -s4 --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$dns" ]; then warn "Le domaine $DOMAIN ne pointe vers rien (créer l'enregistrement DNS A, voir README.md)."
  elif [ -n "$me" ] && [ "$dns" != "$me" ]; then warn "$DOMAIN pointe vers $dns, ce serveur est $me : vérifier le DNS avant de demander le certificat."
  else ok "DNS : $DOMAIN → $dns"; fi
fi
if [ "$TLS" = 1 ]; then
  if [ "$DRY" = 1 ]; then echo "  (dry-run) certbot --nginx -d $DOMAIN"
  elif [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then ok "certificat Let's Encrypt déjà en place (renouvellement automatique par certbot)"
  else
    info "Demande du certificat HTTPS"
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then ok "HTTPS activé"; else warn "Certificat non obtenu (DNS pas encore propagé ?). Relancer le script ensuite : le site reste en HTTP en attendant."; fi
  fi
fi

c 32 "Terminé : http$([ "$TLS" = 1 ] && echo s)://$DOMAIN/"
