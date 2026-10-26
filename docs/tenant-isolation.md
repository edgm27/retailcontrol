# Aislamiento multiempresa

Objetivo: que un error de programación **no** pueda exponer ni modificar datos de otra empresa. Se combinan
dos capas independientes: autorización en el servidor y Row-Level Security (RLS) en PostgreSQL.

## 1. Origen del contexto de empresa

- La empresa activa se guarda en la **fila de sesión** (`sessions.active_tenant_id`), no en una cookie ni en un
  parámetro del navegador. Cambiarla exige una Server Action que valida la membresía (`setActiveTenant`).
- En cada petición, `requireTenant()` vuelve a ejecutar `resolveTenantAccess(userId, tenantId)`:
  1. Busca la membresía **sin** fijar contexto de empresa (RLS solo deja ver las membresías propias del usuario).
  2. Solo si la membresía está ACTIVA fija `app.tenant_id` y lee empresa, configuración y suscripción.
- Una membresía desactivada o una empresa suspendida por la plataforma pierden el acceso en la siguiente petición.

## 2. Roles de base de datos

| Rol | Uso | Atributos |
|---|---|---|
| `rc_owner` | Migraciones (`MIGRATION_DATABASE_URL`) | dueño del esquema; no lo usa la app |
| `rc_app` | App web y worker (`DATABASE_URL`) | `NOSUPERUSER NOBYPASSRLS`, no es dueño de ninguna tabla, sin acceso a `_prisma_migrations` |
| `rc_backup` | Solo `pg_dump` | `pg_read_all_data` + `BYPASSRLS`, sin escritura; credencial separada |

No hay `ALTER DEFAULT PRIVILEGES`: una tabla nueva es inaccesible para `rc_app` hasta que una migración la
autorice explícitamente y le active RLS. Una meta-prueba verifica que **toda** tabla con `tenant_id` tenga RLS
habilitado, forzado y con políticas.

## 3. Contexto por transacción

```ts
withContext({ tenantId, userId, userEmail, platformAdmin }, async (tx) => { ... })
```

- Valida que los identificadores sean UUID antes de llegar a SQL.
- Ejecuta `set_config('app.tenant_id', $1, true)` (equivalente a `SET LOCAL`), parametrizado.
- Al terminar la transacción PostgreSQL descarta los valores: **no hay fuga entre peticiones que reutilizan una
  conexión del pool**. Probado con 30 transacciones alternadas sobre un pool de 3 conexiones.
- Sin contexto, `app.current_tenant_id()` devuelve `NULL` y ninguna fila coincide (falla cerrada).

## 4. Políticas

| Tabla | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| Tablas de empresa estándar | `tenant_id = contexto` | `WITH CHECK tenant_id = contexto` | igual (productos: sin privilegio) |
| `tenants` | contexto, miembro activo o plataforma | INSERT = contexto; UPDATE = contexto o plataforma | ninguna |
| `memberships` | contexto **o** `user_id` = usuario actual | contexto | contexto |
| `invitations` | contexto **o** correo = correo del usuario actual | contexto | ninguna |
| `subscriptions` | contexto o plataforma | INSERT = contexto (onboarding) o plataforma; UPDATE = **solo plataforma** | ninguna |
| `plans` | todos | solo plataforma | ninguna |
| `mfa_totp`, `recovery_codes` | usuario dueño o plataforma | usuario dueño | usuario dueño o plataforma |
| `audit_events` | contexto; eventos sin empresa: actor o plataforma | contexto o `tenant_id IS NULL` | prohibido (trigger) |

`app.platform_admin` solo lo fija código de servidor. En Fase 1 lo usan: los seeds (planes), el job que lista
ids de empresas y `adminResetMfa` (que antes verifica `platform_role = SUPERADMIN`). El panel superadmin de la
Fase 4 exigirá además MFA verificado en la sesión (`requireVerifiedUser` ya obliga a los roles de plataforma a
tener MFA). Da acceso a metadatos de plataforma (empresas, planes, suscripciones), **nunca** a productos,
inventario o compras: esas tablas no tienen cláusula de plataforma en sus políticas.

## 5. Otros canales (estado y diseño)

| Canal | Estado | Control |
|---|---|---|
| Jobs | ✅ | `forEachActiveTenant()` lista ids con contexto de plataforma y procesa cada empresa en su propia transacción con su contexto |
| Búsqueda | ✅ | consultas siempre dentro de `withTenant`; probado con búsqueda de texto |
| Exportaciones | 🟡 F5 | generación en job con contexto de la empresa solicitante; archivo con ruta `tenant/<id>/…`, URL firmada de corta duración, verificación de membresía al descargar |
| Archivos / imágenes | 🟡 F2 | almacenamiento por prefijo de empresa; nunca rutas proporcionadas por el usuario |
| Caché | ✅ / 🟡 | sin caché de datos compartida en Fase 1 (`force-dynamic`); claves futuras siempre prefijadas por empresa |
| Notificaciones | ✅ | generadas por empresa en su propia transacción; RLS: cada usuario solo ve las suyas; deduplicación por (empresa, usuario, clave) |
| Logs | ✅ | sin datos de negocio en logs; correlation id; redacción de campos sensibles |

## 6. Acceso de soporte

Diseño (Fase 4): `support_grants (tenant_id, support_user_id, reason, approved_by, expires_at)` creado por el
propietario de la empresa o con doble aprobación interna; el acceso es de **solo lectura**, temporal, con
banner visible y auditado. Hasta entonces, la plataforma no tiene ningún camino para leer inventarios ajenos.

## 7. Pruebas negativas (evidencia)

`tests/integration/tenant-isolation.test.ts`, `authorization.test.ts`, `invitations.test.ts`,
`entitlements.test.ts`, `mfa-sessions.test.ts`, `jobs.test.ts`:

- mismo SKU en dos empresas, lectura/búsqueda/actualización cruzadas → invisibles / 0 filas;
- inserción con `tenant_id` ajeno → rechazada por `WITH CHECK`; mover una fila de empresa → rechazado;
- sin contexto → 0 filas y escrituras rechazadas;
- FK compuesta impide colgar un almacén de una sucursal ajena;
- usuario en dos empresas con roles distintos actúa según el contexto; sin membresía → sin acceso;
- la empresa no puede modificar su propia suscripción;
- un usuario no ve invitaciones ni factores MFA de otro;
- otra empresa no puede ver, modificar, restablecer ni eliminar usuarios ajenos (`user-admin.test.ts`);
- `rc_app` no es superusuario, no tiene BYPASSRLS, no es dueño de tablas y no lee `_prisma_migrations`.


## Usuarios creados por la empresa (v0.7.0)

Las cuentas de usuario (`users`) son globales: una persona puede pertenecer a varias empresas. El
propietario/administrador crea usuarios con **clave temporal** (sin invitación). Para que una empresa no pueda
tomar el control de una cuenta ajena:

- `users.managed_by_tenant_id` marca la empresa que creó la cuenta. Solo esa empresa puede **restablecer la clave**,
  **desvincular la 2FA** o **deshabilitar la cuenta**, y solo mientras la persona **no pertenezca a otra empresa**.
- Si el correo ya tenía cuenta propia, se agrega la membresía **sin tocar su clave** ni su 2FA.
- Eliminar quita la membresía (el historial se conserva); si la cuenta era administrada, queda deshabilitada y sin clave.
- Lecturas/escrituras acotadas fuera del contexto de la empresa, hechas en el servidor solo tras validar el permiso
  `members.manage` y la membresía del objetivo: conteo de membresías del objetivo (contexto del propio usuario) y
  lectura/borrado de `mfa_totp`/`recovery_codes` de miembros (contexto de plataforma). Todo queda en auditoría
  (`member.user_created`, `member.updated`, `member.password_reset`, `member.mfa_reset`, `member.removed`).
- La exigencia de 2FA por usuario vive en `memberships.mfa_required` (RLS de la empresa).
