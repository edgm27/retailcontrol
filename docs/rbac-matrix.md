# Matriz RBAC

Fuente de verdad: [`packages/domain/src/rbac.ts`](../packages/domain/src/rbac.ts) (verificado por
`packages/domain/test/rbac.test.ts`). Los roles son fijos y versionados en código; cada membresía tiene un rol
y, opcionalmente, una lista de sucursales permitidas (vacía = todas).

Leyenda: ✔ permitido · — denegado.

| Permiso | Propietario | Administrador | Gerente | Almacenista | Comprador | Auditor | Solo lectura |
|---|---|---|---|---|---|---|---|
| `tenant.settings.manage` | ✔ | ✔ | — | — | — | — | — |
| `billing.read` | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `billing.manage` | ✔ | — | — | — | — | — | — |
| `members.read` | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `members.manage` | ✔ | ✔ | — | — | — | — | — |
| `branches.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `branches.manage` | ✔ | ✔ | — | — | — | — | — |
| `products.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `products.write` | ✔ | ✔ | ✔ | — | — | — | — |
| `inventory.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `inventory.move` | ✔ | ✔ | ✔ | ✔ | — | — | — |
| `inventory.transfer` | ✔ | ✔ | ✔ | ✔ | — | — | — |
| `inventory.count` | ✔ | ✔ | ✔ | ✔ | — | — | — |
| `inventory.adjust` | ✔ | ✔ | ✔ | — | — | — | — |
| `inventory.adjust.approve` | ✔ | ✔ | ✔ | — | — | — | — |
| `suppliers.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `suppliers.write` | ✔ | ✔ | ✔ | — | ✔ | — | — |
| `purchases.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `purchases.write` | ✔ | ✔ | ✔ | — | ✔ | — | — |
| `purchases.approve` | ✔ | ✔ | ✔ | — | — | — | — |
| `purchases.receive` | ✔ | ✔ | ✔ | ✔ | — | — | — |
| `exchange_rates.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `exchange_rates.manage` | ✔ | ✔ | — | — | — | — | — |
| `reports.read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `reports.export` | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `audit.read` | ✔ | ✔ | — | — | — | ✔ | — |

## Reglas adicionales

- **MFA obligatorio**: Propietario y Administrador (salvo `MFA_ENFORCE_PRIVILEGED_ROLES=false`, solo para la
  fase de pruebas); el resto si la empresa activa `mfa_required_for_all`. Superadmin y Soporte de plataforma
  siempre. Cualquier usuario puede activarlo voluntariamente desde **Seguridad**; una vez activo, se exige en
  cada inicio de sesión.
- **Asignación de roles**: solo un Propietario crea, modifica o desactiva Propietarios. Un Administrador gestiona
  los demás roles. Nadie puede dejar la empresa sin un Propietario activo.
- **Aprobación de ajustes (F2)**: sobre el umbral configurado, quien aprueba debe ser un usuario distinto de
  quien solicita (aunque ambos tengan `inventory.adjust.approve`).
- **Alcance por sucursal**: las operaciones con sucursal (`assertPermission(..., { branchId })`) se rechazan
  fuera de las sucursales asignadas. Un miembro limitado a sucursales no puede crear sucursales nuevas.
- **Plataforma**: `SUPERADMIN` y `SUPPORT` no son roles de empresa y no otorgan permisos sobre datos de negocio.
- **Doble verificación**: la UI oculta acciones sin permiso, pero **toda** acción se verifica en el servidor
  (guarda `requireTenant(permiso)` + el propio servicio).

## Supuestos a validar con clientes

- ¿El almacenista debe poder registrar mermas sin aprobación? (Hoy: mermas = `inventory.adjust`, que no tiene.)
- ¿El comprador puede crear productos nuevos al cargar una orden? (Hoy: no.)
- Ver [open-questions.md](open-questions.md).


### Gestión de usuarios (v0.7.0)

`members.manage` (Propietario y Administrador) permite crear usuarios con clave temporal, cambiar rol y estado,
activar/desactivar la 2FA (Google Authenticator), asignar una nueva clave temporal y eliminar usuarios.
Un Administrador no puede crear, modificar ni eliminar Propietarios. Nadie puede cambiar su propio rol,
desactivarse ni eliminarse; la empresa siempre conserva al menos un Propietario activo.
