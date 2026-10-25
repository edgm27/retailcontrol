# Registro de decisiones de arquitectura (ADR)

Formato: contexto → decisión → consecuencias → alternativas. Estado: Propuesto / Aceptado / Reemplazado.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-monorepo-y-stack.md) | Monorepo pnpm con Next.js 15, TypeScript y Tailwind | Aceptado |
| [0002](0002-rls-postgresql.md) | Aislamiento con RLS forzado, roles separados y contexto por transacción | Aceptado |
| [0003](0003-prisma-y-migraciones-sql.md) | Prisma 6 + migraciones SQL explícitas para RLS | Aceptado |
| [0004](0004-autenticacion.md) | Auth.js v5 con sesiones en BD, Google OIDC y enlace mágico | Aceptado |
| [0005](0005-mfa-totp.md) | MFA TOTP propio sobre otplib, secretos cifrados y códigos con HMAC | Aceptado |
| [0006](0006-rbac-roles-fijos.md) | RBAC con roles fijos en código | Aceptado |
| [0007](0007-sin-redis-en-fase-1.md) | Sin Redis en Fase 1: límites y candados en PostgreSQL | Aceptado |
| [0008](0008-empresa-activa-en-sesion.md) | Empresa activa guardada en la sesión del servidor | Aceptado |
| [0009](0009-dinero-decimal-y-tasa-congelada.md) | DECIMAL para dinero y tasa congelada por documento | Aceptado |
| [0010](0010-facturacion-saas-adaptador.md) | Facturación del SaaS con adaptador y conciliación manual primero | Aceptado |
