# Arquitectura

> Estado: Fase 1 implementada. Las decisiones se justifican en [adr/](adr/).

## 1. Vista general

```mermaid
flowchart LR
  subgraph Cliente
    B[Navegador móvil / escritorio]
  end
  subgraph "apps/web (Next.js 15, App Router)"
    MW[middleware.ts<br/>CSP con nonce, cabeceras,<br/>correlation id, redirección optimista]
    RSC[Server Components<br/>y Server Actions]
    AUTH[Auth.js v5<br/>Google OIDC + enlace mágico<br/>sesiones en BD]
    G[server/session.ts<br/>guardas: sesión → MFA → empresa → permiso]
  end
  subgraph "packages/domain"
    SVC[Servicios de aplicación<br/>tenants, members, branches,<br/>products, mfa, sessions, jobs]
    RULES[Reglas puras<br/>RBAC, TOTP, cifrado,<br/>validación, suscripción]
  end
  subgraph "packages/db"
    CTX[withContext / withTenant<br/>set_config(..., true) por transacción]
    PR[Prisma Client]
  end
  W[apps/worker<br/>jobs idempotentes]
  PG[(PostgreSQL 16<br/>RLS forzado)]
  MAIL[SMTP / buzón dev]

  B --> MW --> RSC
  RSC --> G --> SVC
  RSC --> AUTH --> PR
  SVC --> RULES
  SVC --> CTX --> PR --> PG
  W --> SVC
  AUTH --> MAIL
```

## 2. Monorepo

| Ruta | Contenido |
|---|---|
| `apps/web` | Next.js (UI, Server Actions, Auth.js, middleware, E2E Playwright) |
| `apps/worker` | Proceso de jobs (Fase 1: purga idempotente; Fase 3: alertas) |
| `packages/db` | Esquema Prisma, migraciones SQL (incluye RLS), seeds ficticios, contexto de BD |
| `packages/domain` | Reglas de negocio puras + servicios de aplicación (usados por web y worker) |
| `packages/ui` | Componentes accesibles estilo shadcn/ui (Tailwind v4) |
| `packages/config` | `tsconfig` base compartido |
| `tests/integration` | Pruebas contra PostgreSQL real (rol `rc_app`, RLS activo) |
| `scripts/db` | Bootstrap de roles, respaldo/restauración verificada |
| `docs` | Producto, arquitectura, seguridad, ADR |

`packages/domain` contiene servicios con acceso a datos (desviación consciente de un "dominio puro") para que
web y worker compartan exactamente las mismas reglas de autorización — ver [ADR-0001](adr/0001-monorepo-y-stack.md).

## 3. Flujo de una petición autenticada

1. **middleware.ts** genera un nonce, aplica CSP y cabeceras, asigna `x-correlation-id` y, si no hay cookie de
   sesión en una ruta privada, redirige a `/login` (optimista; no autoriza nada).
2. **`getSession()`** lee la cookie y busca la fila `sessions` en PostgreSQL en cada petición. Si la fila fue
   borrada (revocación), la sesión deja de valer al instante.
3. **`requireVerifiedUser()`**: si el usuario tiene TOTP, la sesión debe tener `mfa_verified_at`; los roles de
   plataforma deben tener MFA configurado.
4. **`requireTenant(permiso)`**: la empresa activa vive en la fila de sesión (servidor). Se revalida con
   `resolveTenantAccess()` (membresía ACTIVA + empresa ACTIVA). Si el rol exige MFA y no está configurado, se
   obliga a configurarlo. Luego se comprueba el permiso RBAC.
5. El servicio de dominio vuelve a comprobar el permiso (defensa en profundidad), abre una transacción con
   `withTenant()` que fija `app.tenant_id` / `app.user_id` con `set_config(..., true)` y ejecuta la consulta.
6. PostgreSQL aplica RLS: cualquier fila de otra empresa es invisible y no modificable, aunque el código olvide
   filtrar. El evento de auditoría se inserta en la **misma transacción**.

## 4. Datos y aislamiento

- Roles PostgreSQL: `rc_owner` (migraciones), `rc_app` (runtime, sin BYPASSRLS, no dueño), `rc_backup`
  (solo respaldos). Detalle en [tenant-isolation.md](tenant-isolation.md).
- Modelo y restricciones: [data-model.md](data-model.md).

## 5. Seguridad transversal

| Control | Implementación |
|---|---|
| CSRF | Server Actions verifican `Origin`; Auth.js usa token CSRF en sus rutas; cookies `SameSite=Lax` |
| XSS | React escapa por defecto; CSP con nonce + `strict-dynamic`; sin `dangerouslySetInnerHTML` |
| Inyección SQL | Solo consultas parametrizadas (`$queryRaw` etiquetado); ESLint prohíbe `$queryRawUnsafe` fuera de pruebas |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Cookies | HttpOnly, `Secure` y prefijo `__Secure-` en HTTPS (Auth.js), `SameSite=Lax` |
| Fuerza bruta | Bloqueo TOTP tras 5 fallos (15 min); límites por clave en PostgreSQL (enlace mágico, MFA, invitaciones, creación de empresas) |
| Secretos | Solo por variables de entorno/gestor de secretos; `.env` ignorado; gitleaks en CI |
| Logs | JSON estructurado (pino) con redacción de campos sensibles; correlation id |

## 6. Observabilidad (estado)

- ✅ Logs estructurados con redacción y `x-correlation-id` por petición; `/api/health` (liveness + BD).
- ⏳ OpenTelemetry (trazas y métricas), métricas de negocio y alertas: Fase 5. Se instrumentará con
  `instrumentation.ts` y exportador OTLP configurable por entorno.

## 7. Despliegue (propuesta, sin ejecutar)

Inicial y simple: un contenedor `web` (Next.js `next start`), un contenedor `worker`, PostgreSQL 16 gestionado con
cifrado en reposo, respaldos automáticos y PITR. TLS terminado en el balanceador. Secretos en el gestor del
proveedor. **No se ha desplegado nada ni se han generado costos.** La elección de proveedor es una pregunta
abierta ([open-questions.md](open-questions.md)).

## 8. Extensibilidad prevista

- **POS / facturación fiscal**: el inventario expondrá un servicio `postStockMovement` idempotente; un futuro
  POS lo consumirá con su propio documento de venta. La emisión fiscal será un adaptador separado y homologado.
- **Facturación SaaS**: interfaz `BillingProvider` (manual / pasarela) — ver [billing-strategy.md](billing-strategy.md).
- **Tasas**: `ExchangeRateSource` (manual auditada / fuente verificable) — ver [venezuela-localization.md](venezuela-localization.md).
- **API pública**: contratos con zod → OpenAPI, versionado `/api/v1`, tokens por empresa con alcance (Fase posterior).
