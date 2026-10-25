# ADR-0006 — RBAC con roles fijos en código

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Decisión
Siete roles de empresa fijos (propietario, administrador, gerente, almacenista, comprador, auditor, solo
lectura) con permisos granulares definidos en `packages/domain/src/rbac.ts`, más alcance opcional por sucursal
en `membership_branches`. Las verificaciones se hacen en la guarda del servidor **y** en cada servicio.

## Consecuencias
+ Revisable en PR y probado; sin estados inconsistentes de permisos en BD. − Roles personalizados por cliente
no disponibles (pregunta abierta para plan Empresarial; se podría añadir una capa de roles a medida que solo
reste permisos a un rol base).
