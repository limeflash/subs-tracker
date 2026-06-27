#!/bin/sh
set -e

echo "→ applying prisma migrations"
prisma migrate deploy

# seed the owner account (idempotent) when SEED_OWNER_EMAIL is set.
# Uses a precomputed argon2id hash (SEED_OWNER_PASSWORD_HASH) or, with SEED_DEMO=1,
# a baked demo hash so it runs in the slim runner image without native argon2.
if [ -n "$SEED_OWNER_EMAIL" ]; then
  echo "→ seeding (idempotent)"
  node --experimental-strip-types prisma/seed.ts || echo "  seed skipped/failed (non-fatal if owner exists)"
fi

echo "→ starting Next.js"
exec node server.js