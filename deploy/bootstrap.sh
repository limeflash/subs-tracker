#!/bin/bash
# Deployment bootstrap with an auto-adapting reverse proxy.
# Designed to coexist with an already-running service on the same VPS.
#
# Strategy (chosen at runtime after probing the host):
#   A) nginx present  -> add a server block for $DOMAIN, certbot TLS
#   B) caddy present  -> append a $DOMAIN block (Caddy auto-TLS)
#   C) nothing on :80/:443 -> run our own Caddy sidecar (auto-TLS)
#   D) :80/:443 taken by an unknown proxy -> bind app on a custom https port
#
# The app container NEVER binds 80/443 directly — only the reverse proxy does.
set -euo pipefail

DOMAIN="${DOMAIN:-your-domain.example}"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$COMPOSE_DIR/../.env"

log(){ echo "[bootstrap] $*"; }
die(){ echo "[bootstrap] ERROR: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die ".env not found at $ENV_FILE (copy .env.example and fill it)"
command -v docker >/dev/null || die "docker not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"

# ---- 1. pick a free host port for the app (loopback only) ----
APP_PORT=""
for p in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
  if ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$p\$"; then
    APP_PORT="$p"; break
  fi
done
[ -n "$APP_PORT" ] || die "no free port in 3001..3010"
log "chose APP_PORT=$APP_PORT"

export APP_PORT
grep -q "^APP_PORT=" "$ENV_FILE" && sed -i "s/^APP_PORT=.*/APP_PORT=$APP_PORT/" "$ENV_FILE" || echo "APP_PORT=$APP_PORT" >> "$ENV_FILE"

# ---- 2. bring up app + db ----
log "building + starting app & db containers"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_DIR/docker-compose.yml" up -d --build

# wait for app health (TCP)
log "waiting for app to listen on 127.0.0.1:$APP_PORT"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/login" >/dev/null 2>&1; then
    log "app is up"; break
  fi
  sleep 2
  [ "$i" -eq 30 ] && die "app did not become healthy"
done

# ---- 3. detect reverse-proxy scenario ----
HAS_NGINX="no"; HAS_CADDY="no"
command -v nginx >/dev/null && HAS_NGINX="yes"
command -v caddy >/dev/null && HAS_CADDY="yes"
# also check running containers (by name OR image) for caddy/nginx
docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -qiE 'caddy' && HAS_CADDY="yes"
docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -qiE 'nginx' && HAS_NGINX="yes"

PORT80_FREE=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ':80$' && echo no || echo yes)
PORT443_FREE=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ':443$' && echo no || echo yes)

SCENARIO="?"
if [ "$HAS_NGINX" = "yes" ]; then SCENARIO="A"
elif [ "$HAS_CADDY" = "yes" ]; then SCENARIO="B"
elif [ "$PORT80_FREE" = "yes" ] && [ "$PORT443_FREE" = "yes" ]; then SCENARIO="C"
else SCENARIO="D"; fi
log "reverse-proxy scenario: $SCENARIO"

case "$SCENARIO" in
  A)
    log "nginx detected — adding server block"
    BLOCK="/etc/nginx/sites-available/subs_simg.conf"
    cat > "$BLOCK" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    client_max_body_size 2m;
}
EOF
    ln -sf "$BLOCK" /etc/nginx/sites-enabled/subs_simg.conf 2>/dev/null || true
    nginx -t
    systemctl reload nginx || nginx -s reload
    command -v certbot >/dev/null && certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${CERTBOT_EMAIL:-admin@$DOMAIN}" --redirect || log "certbot skipped (install or run manually)"
    ;;
  B)
    log "caddy detected — appending to Caddyfile"
    CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
    {
      echo ""
      echo "$DOMAIN {"
      echo "    reverse_proxy 127.0.0.1:$APP_PORT"
      echo "}"
    } >> "$CADDYFILE"
    systemctl reload caddy || caddy reload --config "$CADDYFILE"
    ;;
  C)
    log "free 80/443 — starting Caddy sidecar"
    docker run -d --name subs-caddy --restart unless-stopped \
      -p 80:80 -p 443:443 \
      --add-host=host.docker.internal:host-gateway \
      -v subs_caddy_data:/data -v subs_caddy_config:/config \
      caddy:2-alpine caddy reverse-proxy --from "$DOMAIN" --to "host.docker.internal:$APP_PORT" \
      || die "failed to start Caddy sidecar"
    ;;
  D)
    log "WARN: 80/443 busy by an unrecognized proxy. Starting a Caddy sidecar on a custom https port."
    CUSTOM=8443
    while ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$CUSTOM\$"; do CUSTOM=$((CUSTOM+1)); done
    log "Using https://$DOMAIN:$CUSTOM (self-signed internal TLS). Point your browser / existing proxy at it."
    # Caddy auto-issues an internal CA cert for the hostname when it can't use
    # ACME on a non-standard port. The Caddyfile below pins the custom port.
    CADDYCONF="$(mktemp)"
    cat > "$CADDYCONF" <<EOF
$DOMAIN:$CUSTOM {
    reverse_proxy host.docker.internal:$APP_PORT
    tls internal
}
EOF
    docker run -d --name subs-caddy-custom --restart unless-stopped \
      -p "$CUSTOM:$CUSTOM" \
      --add-host=host.docker.internal:host-gateway \
      -v subs_caddy_data:/data -v subs_caddy_config:/config \
      -v "$CADDYCONF:/etc/caddy/Caddyfile:ro" \
      caddy:2-alpine caddy run --config /etc/caddy/Caddyfile \
      || die "failed to start Caddy sidecar on port $CUSTOM"
    log "Caddy sidecar up on :$CUSTOM. To expose it through your existing proxy, forward $DOMAIN -> 127.0.0.1:$CUSTOM."
    ;;
esac

# ---- 4. UFW hardening (best effort) ----
if command -v ufw >/dev/null; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
  log "ufw configured (22,80,443)"
fi

log "done. Verify: curl -k https://$DOMAIN/login"
log "Set up host cron for rates/notify (see deploy/cron.example) with CRON_SECRET from .env"