#!/usr/bin/env bash
# Crea roles rc_owner / rc_app y la base de datos indicada.
# Variables: PGSUPER_URL (conexión superusuario), RC_OWNER_PASSWORD, RC_APP_PASSWORD,
#            RC_BACKUP_PASSWORD, RC_DB_NAME
# Por defecto usa el socket local con el usuario postgres (entorno de desarrollo).
set -euo pipefail
cd "$(dirname "$0")"

: "${RC_OWNER_PASSWORD:?Define RC_OWNER_PASSWORD}"
: "${RC_APP_PASSWORD:?Define RC_APP_PASSWORD}"
: "${RC_BACKUP_PASSWORD:?Define RC_BACKUP_PASSWORD}"
DB_NAME="${RC_DB_NAME:-retailcontrol}"

run_psql() {
  if [[ -n "${PGSUPER_URL:-}" ]]; then
    psql "$PGSUPER_URL" "$@"
  elif [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
    su postgres -c "psql $(printf '%q ' "$@")"
  else
    psql -U postgres "$@"
  fi
}

run_psql -v owner_password="$RC_OWNER_PASSWORD" -v app_password="$RC_APP_PASSWORD" \
  -v backup_password="$RC_BACKUP_PASSWORD" \
  -v db_name="$DB_NAME" -f "$(pwd)/bootstrap.sql"
echo "Roles y base de datos '$DB_NAME' listos."
