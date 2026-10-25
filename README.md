# RetailControl

SaaS multiempresa de control de inventarios para abastos, minimarkets, ferreterías, bodegas y tiendas
venezolanas. Español de Venezuela, mobile-first, con aislamiento estricto por empresa y verificación en dos pasos.

> **Estado: Fase 1 (fundaciones) completada.** Incluye empresas, usuarios, roles, sucursales, almacenes,
> catálogo mínimo, MFA TOTP, sesiones revocables, auditoría inmutable y límites de plan. Inventario, lotes y
> compras llegan en las Fases 2 y 3. RetailControl **no emite facturas fiscales** y **no está certificado** en
> ISO/IEC 27001. Ver [docs/roadmap.md](docs/roadmap.md).

## Stack

TypeScript · Next.js 15 (App Router) · React 19 · Tailwind CSS 4 · Auth.js v5 · Prisma 6 · PostgreSQL 16 con
Row-Level Security · Vitest · Playwright · pnpm workspaces.

```
apps/web          Next.js: UI, Server Actions, Auth.js, middleware de seguridad, E2E
apps/worker       Jobs idempotentes
packages/db       Esquema Prisma, migraciones (incluye RLS), seeds ficticios, contexto de BD
packages/domain   Reglas (RBAC, TOTP, cifrado, validación) y servicios de aplicación
packages/ui       Componentes accesibles
tests/integration Pruebas contra PostgreSQL real
docs/             PRD, arquitectura, seguridad, ISO 27001, RBAC, Venezuela, facturación, ADR
```

## Requisitos

- Node.js ≥ 22 y pnpm 10 (`corepack enable`)
- PostgreSQL 16 (local o con `docker compose up -d`)
- `openssl` y `gpg` (scripts de secretos y respaldo)

## Puesta en marcha (desarrollo)

```bash
pnpm install                       # instala y genera el cliente Prisma
bash scripts/dev/create-env.sh     # crea .env con secretos ALEATORIOS de desarrollo

# Opción A: PostgreSQL con Docker (crea roles y bases automáticamente)
docker compose up -d

# Opción B: PostgreSQL local (requiere acceso de superusuario)
set -a; . ./.env; set +a
bash scripts/db/bootstrap.sh
RC_DB_NAME=retailcontrol_shadow bash scripts/db/bootstrap.sh

pnpm db:migrate                    # migraciones con el rol dueño (rc_owner)
pnpm db:seed                       # planes de ejemplo + 2 empresas ficticias
pnpm dev                           # http://localhost:3000
```

### Entrar en desarrollo

Con `EMAIL_TRANSPORT=dev-file` el enlace de acceso no se envía: se escribe en
`apps/web/.dev-mailbox/<correo>.json` (campo `actionUrl`). Ábralo en el navegador. Usuarios demo:
`propietario.uno@example.com`, `propietario.dos@example.com`, `almacen.compartido@example.com` (pertenece a las
dos empresas demo). Los propietarios deberán configurar TOTP al entrar.

Para Google OIDC, cree un cliente OAuth (tipo aplicación web) con la URI de redirección
`http://localhost:3000/api/auth/callback/google` y complete `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## Pruebas

```bash
pnpm typecheck          # TypeScript estricto en todos los paquetes
pnpm lint               # ESLint (incluye reglas de seguridad)
pnpm test:unit          # reglas puras: RBAC, TOTP (vectores RFC 6238), cifrado, validación
pnpm test:integration   # PostgreSQL real: crea retailcontrol_test, migra y prueba aislamiento, RBAC,
                        # límites de plan, invitaciones, MFA, sesiones y jobs
pnpm build && pnpm test:e2e   # Playwright: registro → empresa → MFA → recuperación → revocación
BACKUP_PASSPHRASE=... pnpm backup:test   # respaldo cifrado + restauración verificada
pnpm db:check-drift     # el esquema Prisma coincide con las migraciones
```

Si Playwright no encuentra el navegador: `pnpm --filter @rc/web exec playwright install chromium`.

## Variables de entorno

Ver [.env.example](.env.example). Nunca suba `.env`. En producción, use un gestor de secretos. Variables
críticas: `DATABASE_URL` (rol `rc_app`), `MIGRATION_DATABASE_URL` (rol `rc_owner`), `AUTH_SECRET`,
`MFA_ENCRYPTION_KEY` (32 bytes base64), `RECOVERY_CODE_PEPPER`.

## Seguridad en una línea por capa

Sesión leída de la BD en cada petición (revocación inmediata) → MFA verificado → membresía activa revalidada →
permiso RBAC → servicio vuelve a verificar → transacción con contexto RLS → auditoría en la misma transacción.
Detalle: [docs/tenant-isolation.md](docs/tenant-isolation.md) y [docs/security-threat-model.md](docs/security-threat-model.md).

## Documentación

[PRD](docs/prd.md) · [Arquitectura](docs/architecture.md) · [Modelo de datos](docs/data-model.md) ·
[Aislamiento](docs/tenant-isolation.md) · [Amenazas](docs/security-threat-model.md) ·
[ISO 27001](docs/iso27001-control-mapping.md) · [RBAC](docs/rbac-matrix.md) ·
[Venezuela](docs/venezuela-localization.md) · [Facturación](docs/billing-strategy.md) ·
[Despliegue en Render](docs/deploy-render.md) · [Roadmap y estado](docs/roadmap.md) · [Preguntas abiertas](docs/open-questions.md) · [ADR](docs/adr/README.md)
