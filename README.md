# Subs

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)

Self-hostable personal subscription & expense tracker. Single-owner web app
for managing recurring subscriptions, multi-currency costs, employee payroll
records, and statistics — with optional 2FA, encrypted secrets, and Telegram
notifications.

Next.js 15 (App Router, RSC) · shadcn/ui + Tailwind v3 · PostgreSQL (Prisma) ·
Auth.js v5 (Credentials + JWT + TOTP 2FA) · AES-256-GCM · Docker.

> This project is generic and self-hostable. Deploy it on your own server/VPS
> with your own domain — no vendor lock-in, no external accounts required.

## Features
- **Subscriptions**: manual entry of amount/currency/billing period, auto
  favicon by URL, groups.
- **Multi-currency** (TRY/EUR/RUB/USD…), conversion into a display currency,
  daily rate refresh from free providers (no API key).
- **Statistics** by month / quarter / year, charts, CSV/JSON export.
- **Employees & payroll history** (accounting only — employees get no app access).
- **Security**: 2FA (TOTP + backup codes), AES-256-GCM encrypted secrets,
  Argon2id passwords, audit log, login rate-limit.
- **Telegram notifications** (owner only): upcoming/past payments, payroll,
  weekly summary.
- Dark/light theme, shadcn/ui.

## Quick start (self-host)
```bash
cp .env.example .env            # fill in secrets (AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET, owner seed)
docker compose -f deploy/docker-compose.yml up -d --build
```
The container entrypoint runs Prisma migrations + an idempotent seed of the
owner account. See [deploy/DEPLOY.md](deploy/DEPLOY.md) for the reverse-proxy
setup (nginx / Caddy / sidecar) and cron configuration.

## Owner account
Created once via seed: set `SEED_OWNER_EMAIL` and either
`SEED_OWNER_PASSWORD_HASH` (an Argon2id hash you generate locally) or
`SEED_DEMO=1` for a throwaway local preview password. Registration is closed —
there is exactly one owner row; no sign-up route exists.

## Security architecture
- `ENCRYPTION_KEY` (32 bytes) — master key for AES-256-GCM; encrypts TOTP
  secrets and the Telegram token (stored encrypted in the DB). **Do not change
  it after the first run** — existing ciphertext would become undecryptable.
- Passwords — Argon2id (`@node-rs/argon2`).
- Sessions — JWT (Auth.js v5), httpOnly + Secure cookies.
- DB in a Docker volume, not published to the host; the app listens on
  127.0.0.1 only and is fronted by a reverse proxy.
- Backups are wired as an extension point (the sink is plugged in later).

## License
MIT — see [LICENSE](LICENSE).