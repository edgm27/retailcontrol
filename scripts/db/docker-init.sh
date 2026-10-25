#!/usr/bin/env bash
# Se ejecuta una sola vez al crear el volumen de PostgreSQL en Docker.
set -euo pipefail
for db in "${RC_DB_NAME:-retailcontrol}" "${RC_DB_NAME:-retailcontrol}_shadow"; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v owner_password="$RC_OWNER_PASSWORD" -v app_password="$RC_APP_PASSWORD" \
    -v backup_password="$RC_BACKUP_PASSWORD" -v db_name="$db" \
    -f /opt/retailcontrol/bootstrap.sql
done
