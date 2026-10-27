# Runbook: despliegue y rollback

## Despliegue (Render, Blueprint)
1. Todo cambio entra por `main` con CI en verde (tipos, lint, unitarias, integración con PostgreSQL real, respaldo,
   E2E, secretos y dependencias).
2. Render despliega automáticamente. Al arrancar, `scripts/deploy/start-web.sh` aplica migraciones con el rol dueño
   (`prisma migrate deploy`), asigna el administrador inicial/superadministradores y arranca con `rc_app`.
3. Verifique `/api/health` (`version` y `commit` esperados, `db: "ok"`) y entre a la app.

## Rollback
- **Código**: Render → servicio → *Deploys* → elegir el despliegue anterior → *Rollback*.
- **Migraciones**: son aditivas (columnas e índices nuevos, sin borrar datos). Un rollback de código con una
  migración ya aplicada es compatible en la mayoría de los casos. **No** borre migraciones aplicadas; si una
  migración debe revertirse, escriba una nueva migración correctiva y pruébela con una copia de la base.
- Si la migración falló a mitad: revise el error en los logs, corrija y redespliegue; `prisma migrate resolve` solo
  con una copia probada y quedando registrado en el incidente.
