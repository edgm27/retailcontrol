# Runbook: respaldo y restauración

## Respaldo
- **Producción** (recomendado): base de datos administrada con respaldos diarios automáticos y PITR
  (Render PostgreSQL de pago u otro proveedor). El plan gratuito de Render **no** incluye respaldos.
- **Respaldo lógico cifrado**: `BACKUP_PASSPHRASE=… pnpm backup:test` usa el rol `rc_backup` (lectura + BYPASSRLS),
  genera un `pg_dump` cifrado con GPG en `backups/`, lo restaura en una base temporal y verifica conteos, RLS,
  triggers y falla cerrada. Copie el archivo cifrado a un almacenamiento externo (otra cuenta/región).
- Guarde la frase de cifrado en el gestor de secretos, **separada** del respaldo.

## Restauración
1. Detenga escrituras (ponga el servicio en mantenimiento o suspenda el servicio web).
2. Cree una base nueva; restaure con el rol dueño:
   `gpg -d respaldo.dump.gpg | pg_restore --no-owner --role=rc_owner -d <nueva_base>`
3. Ejecute `scripts/db/bootstrap.sh` si los roles no existen (rc_app, rc_backup) y verifique RLS:
   `pnpm test:integration` contra una copia, o la verificación incluida en `backup:test`.
4. Apunte `MIGRATION_DATABASE_URL`/`DATABASE_URL` a la base restaurada, redespliegue y verifique `/api/health`.
5. Registre en el incidente: hora del respaldo usado (RPO real) y duración (RTO real).

**Objetivo propuesto**: RPO 24 h (diario) / 15 min con PITR; RTO 4 h. Pruebe la restauración al menos cada trimestre.
