# ADR-0002 — Aislamiento con RLS forzado, roles separados y contexto por transacción

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Contexto
Una fuga entre empresas es el peor fallo posible de un SaaS multiempresa. Filtrar por `tenant_id` solo en el
código depende de que nadie lo olvide nunca.

## Decisión
- Base compartida, esquema compartido, columna `tenant_id` + **Row-Level Security** con `FORCE ROW LEVEL SECURITY`.
- Roles: `rc_owner` (migraciones, dueño), `rc_app` (runtime, sin BYPASSRLS, no dueño), `rc_backup` (respaldos).
- Contexto con `set_config('app.tenant_id', $1, true)` dentro de una transacción interactiva por operación
  (`withContext`). Al terminar la transacción, el valor desaparece: seguro con pool de conexiones y PgBouncer en
  modo transacción.
- Funciones `app.current_tenant_id()` etc. con `NULLIF(..., '')` → sin contexto = sin filas (falla cerrada).
- FK compuestas `(tenant_id, id)` para impedir referencias cruzadas.
- Sin privilegios por defecto + meta-prueba de cobertura RLS.

## Consecuencias
+ Defensa en profundidad verificable con pruebas. + Un error de código no filtra datos.
− Cada operación con datos de empresa abre una transacción (coste bajo, aceptado).
− `pg_dump` necesita un rol con BYPASSRLS (`rc_backup`), con credencial separada y solo lectura.
− Consultas de plataforma requieren contexto explícito (`platformAdmin`) y políticas específicas.

## Alternativas
Base de datos por empresa (aislamiento fuerte, operación costosa con miles de comercios pequeños); esquema por
empresa (migraciones N veces); solo filtrado en aplicación (rechazado: un olvido = fuga).
