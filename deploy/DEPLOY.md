# Self-host deploy on a VPS

## Prerequisites on the server
- Docker + the `docker compose` plugin.
- DNS: an A record pointing your domain to the server's IP.
- Ports 22, 80, 443 open (the rest get locked down by UFW via bootstrap).

## 1. Prepare .env
```bash
cp .env.example .env
# generate:
AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SEED_OWNER_EMAIL=you@example.com
SEED_OWNER_PASSWORD=<strong password>
NEXTAUTH_URL=https://your-domain.example
```
> `ENCRYPTION_KEY` **must not** change after the first run — otherwise the
> encrypted TOTP/Telegram secrets become undecryptable. Keep an off-server
> backup of this key.

## 2. Launch
```bash
./deploy/bootstrap.sh
```
The script:
1. picks a free host port (3001..3010), binds the app to `127.0.0.1`;
2. builds and starts `app` + `db` (PostgreSQL, internal network);
3. applies migrations and seeds the owner (via the entrypoint);
4. detects the reverse-proxy scenario:
   - **A** nginx present → adds a server block for your domain, `certbot --nginx`;
   - **B** Caddy present → appends a block (auto-TLS);
   - **C** 80/443 free → starts a Caddy sidecar (auto-TLS);
   - **D** 80/443 taken by an unknown proxy → binds the app to a custom https
     port (needs manual TLS setup — the log flags it);
5. configures UFW (22/80/443).

Under scenarios A/C/Caddy the site gets a valid TLS certificate immediately.

## 3. Cron (rates + notifications)
**Not required since the built-in scheduler landed** — the app sends Telegram
notifications daily from 09:00 and refreshes rates at night out of the box
(`src/instrumentation.ts`). The HTTP endpoints below still work if you prefer
host cron or custom send times; per-day deduplication makes overlaps harmless.
```bash
crontab -e   # optionally paste from deploy/cron.example, substituting CRON_SECRET
```
- `09:07` — `/api/cron/notify` (payments, payroll, Monday summary);
- `03:13` — `/api/cron/rates` (currency rate refresh).

## 4. Isolation from an already-running service
- The app container **never** takes 80/443 directly — only the reverse proxy does.
- `db` is not published to the host (internal `subsnet` network only).
- `bootstrap.sh` probes `ss -ltn`, nginx/caddy processes, and 80/443 usage, so
  port conflicts are avoided: the first free port is chosen.
- If nginx/Caddy already runs, the new site is added as an extra server block /
  Caddyfile block without touching existing sites.

## 5. Backups
The backup sink is deferred (extension point). For immediate protection:
```bash
# nightly, in cron:
docker exec subs-db-1 pg_dump -U subs subs | gpg --symmetric --cipher-algo AES256 > /var/backups/subs-$(date +%F).sql.gpg
```
Move archives to separate storage (S3-compatible / a second server) — a backup
on the same VPS is lost with it.

## 6. After first login
- Enable 2FA in Settings → Security; save your backup codes.
- Configure Telegram (token from @BotFather, chat id from @userinfobot) —
  Settings → Telegram → Test.
- Set your display currency and override rates if needed.