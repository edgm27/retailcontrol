#!/usr/bin/env bash
# Arranque en Render: prepara la BD (idempotente) y lanza Next.js con el rol rc_app.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${MIGRATION_DATABASE_URL:?Falta MIGRATION_DATABASE_URL}"
: "${RC_APP_PASSWORD:?Falta RC_APP_PASSWORD}"

# La app NUNCA usa el usuario dueño: se conecta como rc_app (sujeto a RLS).
DATABASE_URL="$(node -e 'const u=new URL(process.env.MIGRATION_DATABASE_URL);u.username="rc_app";u.password=process.env.RC_APP_PASSWORD;u.searchParams.set("connection_limit",process.env.DB_POOL_SIZE||"5");console.log(u.toString())')"
export DATABASE_URL
export AUTH_URL="${AUTH_URL:-${RENDER_EXTERNAL_URL:-}}"
export AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}"
export NODE_ENV=production

(cd packages/db && node scripts/prepare-deploy.mjs)
(cd apps/worker && node_modules/.bin/tsx src/bootstrap-admin.ts)
cd apps/web
exec node_modules/.bin/next start -p "${PORT:-3000}"
