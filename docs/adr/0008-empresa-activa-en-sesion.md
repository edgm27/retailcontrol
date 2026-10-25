# ADR-0008 — Empresa activa guardada en la sesión del servidor

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Decisión
`sessions.active_tenant_id` guarda la empresa elegida. Solo se cambia con una Server Action que valida la
membresía. Cada petición revalida membresía y estado de la empresa (`resolveTenantAccess`). No se aceptan
`tenant_id` en URL, formularios ni cookies propias.

## Consecuencias
+ El navegador no puede elegir un tenant arbitrario. + Revocar membresía surte efecto en la siguiente petición.
− Dos pestañas comparten la misma empresa activa (aceptable; mostrar la empresa activa siempre en el encabezado).
