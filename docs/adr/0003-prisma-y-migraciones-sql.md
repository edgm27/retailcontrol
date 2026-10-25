# ADR-0003 — Prisma 6 + migraciones SQL explícitas para RLS

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Contexto
Se requiere un ORM tipado y migraciones reproducibles; Prisma no modela RLS, políticas, triggers ni grants.

## Decisión
- **Prisma 6.19** (`prisma-client-js`). Prisma 7/8 cambian el modelo de generación y conexión; se evaluará la
  migración más adelante con su propio ADR.
- Las tablas se generan con `prisma migrate`; RLS, grants, funciones, triggers y CHECK se escriben a mano en
  migraciones SQL dedicadas (`*_rls_policies`), versionadas junto al esquema.
- `pnpm db:check-drift` (CI) verifica que esquema y migraciones coinciden.
- Toda consulta cruda usa `$queryRaw` etiquetado (parametrizado); ESLint prohíbe `$queryRawUnsafe`.

## Consecuencias
+ Tipos generados y migraciones legibles. − Cada tabla nueva de empresa exige escribir su política (la
meta-prueba de cobertura falla si se olvida).
