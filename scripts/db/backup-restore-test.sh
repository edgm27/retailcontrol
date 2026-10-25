#!/usr/bin/env bash
# Prueba de respaldo y restauración (aceptación 12).
#
# 1. pg_dump (formato custom) con el rol dedicado rc_backup (lectura + BYPASSRLS):
#    con RLS forzado, ni el dueño de las tablas puede volcar todas las filas.
# 2. Cifrado simétrico con GPG (AES-256, con verificación de integridad MDC)
#    usando BACKUP_PASSPHRASE. El archivo en claro se borra de inmediato.
# 3. Descifra y restaura en una base temporal <db>_restore_check.
# 4. Verifica: conteo de filas por tabla idéntico, migraciones aplicadas,
#    RLS habilitado y forzado, trigger de auditoría presente y que el rol
#    rc_app sin contexto no ve filas (falla cerrada) en la base restaurada.
# 5. Borra la base temporal. Deja el respaldo cifrado en backups/.
#
# Variables: BACKUP_DATABASE_URL (rol rc_backup), MIGRATION_DATABASE_URL (rc_owner,
#            restaura), DATABASE_URL (rc_app, verifica falla cerrada). Se leen de .env.
#            BACKUP_PASSPHRASE (obligatoria; en producción, desde el gestor de secretos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
: "${BACKUP_DATABASE_URL:?Falta BACKUP_DATABASE_URL}"
: "${MIGRATION_DATABASE_URL:?Falta MIGRATION_DATABASE_URL}"
: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?Defina BACKUP_PASSPHRASE (no se guarda en el repositorio)}"

strip_params() { echo "${1%%\?*}"; }
SRC_URL="$(strip_params "$MIGRATION_DATABASE_URL")"
SRC_DB="${SRC_URL##*/}"
RESTORE_DB="${SRC_DB}_restore_check"
BASE_URL="${SRC_URL%/*}"
RESTORE_URL="$BASE_URL/$RESTORE_DB"
APP_BASE="$(strip_params "$DATABASE_URL")"; APP_BASE="${APP_BASE%/*}"
APP_RESTORE_URL="$APP_BASE/$RESTORE_DB"
MAINT_URL="$BASE_URL/postgres"
BK_URL="$(strip_params "$BACKUP_DATABASE_URL")"
BK_RESTORE_URL="${BK_URL%/*}/$RESTORE_DB"

mkdir -p "$ROOT/backups"; chmod 700 "$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PLAIN="$(mktemp "$ROOT/backups/.tmp.XXXXXX")"
ENC="$ROOT/backups/${SRC_DB}_${STAMP}.dump.gpg"
cleanup() { rm -f "$PLAIN" "$PLAIN.restore"; psql -q "$MAINT_URL" -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ Respaldando $SRC_DB"
pg_dump --format=custom "$BK_URL" --file="$PLAIN"
gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --force-mdc \
    --passphrase-fd 3 --output "$ENC" "$PLAIN" 3<<<"$BACKUP_PASSPHRASE"
rm -f "$PLAIN"
echo "  respaldo cifrado: backups/$(basename "$ENC") ($(du -h "$ENC" | cut -f1))"

echo "→ Restaurando en $RESTORE_DB"
psql -q "$MAINT_URL" -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$RESTORE_DB\" TEMPLATE template0"
gpg --batch --quiet --decrypt --passphrase-fd 3 --output "$PLAIN.restore" "$ENC" 3<<<"$BACKUP_PASSPHRASE"
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_URL" "$PLAIN.restore"
rm -f "$PLAIN.restore"

echo "→ Verificando"
COUNT_SQL="SELECT string_agg(format('%s=%s', table_name, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', table_name), false, true, '')))[1]::text), ',' ORDER BY table_name)
           FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
# Conteos con rc_backup (BYPASSRLS, solo lectura) en origen y destino.
SRC_COUNTS="$(psql -qAt "$BK_URL" -c "$COUNT_SQL")"
DST_COUNTS="$(psql -qAt "$BK_RESTORE_URL" -c "$COUNT_SQL")"
if [[ "$SRC_COUNTS" != "$DST_COUNTS" ]]; then
  echo "✗ Los conteos difieren"; echo "  origen:   $SRC_COUNTS"; echo "  restaura: $DST_COUNTS"; exit 1
fi
echo "  conteos idénticos: $DST_COUNTS"

RLS_BAD="$(psql -qAt "$RESTORE_URL" -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (SELECT 1 FROM information_schema.columns col
  WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id')
  AND NOT (c.relrowsecurity AND c.relforcerowsecurity)")"
[[ "$RLS_BAD" == "0" ]] || { echo "✗ Hay tablas sin RLS forzado tras restaurar"; exit 1; }
TRIG="$(psql -qAt "$RESTORE_URL" -c "SELECT count(*) FROM pg_trigger WHERE tgname='audit_events_immutable'")"
[[ "$TRIG" == "1" ]] || { echo "✗ Falta el trigger de inmutabilidad de auditoría"; exit 1; }
MIGS="$(psql -qAt "$RESTORE_URL" -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
echo "  RLS forzado: OK · trigger auditoría: OK · migraciones aplicadas: $MIGS"

LEAK="$(psql -qAt "$APP_RESTORE_URL" -c "SELECT count(*) FROM products")"
[[ "$LEAK" == "0" ]] || { echo "✗ rc_app ve filas sin contexto en la base restaurada"; exit 1; }
echo "  rc_app sin contexto ve 0 productos: OK (falla cerrada)"
echo "✓ Respaldo restaurado y verificado correctamente."
