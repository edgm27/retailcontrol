# Despliegue en Render

> Configuración en [`render.yaml`](../render.yaml) (Blueprint). Usa planes **gratuitos** para no generar
> costos. La base de datos gratuita de Render tiene límites de capacidad y vencimiento: sirve para una
> demostración, **no** para datos reales de clientes. Para producción, cambie `plan` a uno de pago (con
> respaldos) y revise [roadmap.md](roadmap.md) (Fase 5).

## Qué crea el Blueprint

| Recurso | Detalle |
|---|---|
| `retailcontrol-db` | PostgreSQL 16, usuario dueño `rc_owner`, sin acceso desde Internet (`ipAllowList: []`) |
| `retailcontrol-web` | Node 22. Build: `pnpm install` + `pnpm build`. Arranque: `scripts/deploy/start-web.sh` |

En cada arranque, `start-web.sh`:
1. crea el rol `rc_app` (sin BYPASSRLS, no dueño) o verifica su contraseña;
2. aplica migraciones con el usuario dueño;
3. crea los planes de ejemplo **solo si no existen**;
4. arranca Next.js conectado como `rc_app` (RLS siempre activo).

Los secretos `RC_APP_PASSWORD`, `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` y `RECOVERY_CODE_PEPPER` los genera Render.
`AUTH_URL` se toma de `RENDER_EXTERNAL_URL` automáticamente.

## Administrador inicial y MFA en fase de pruebas

- En **retailcontrol-web → Environment** defina `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD` (12+ caracteres).
  En el siguiente despliegue se crea ese usuario con una empresa de pruebas (rol Propietario). Si el usuario ya
  existe no se modifica nada: cambiar la contraseña desde **Seguridad** es permanente.
- `MFA_ENFORCE_PRIVILEGED_ROLES=false` (valor del Blueprint): la verificación en dos pasos es **opcional** y
  cada usuario la activa desde **Seguridad**. Una vez activada, se exige en cada inicio de sesión.
  **Antes de recibir datos reales, cámbiela a `true`** para exigirla a propietarios y administradores.
- Diagnóstico: `https://<su-servicio>.onrender.com/api/health` muestra `"adminConfigured": true` cuando
  ambas variables están definidas.
- ¿No puede entrar? Agregue `ADMIN_RESET_PASSWORD` = `true`, guarde (redespliega), entre con
  `ADMIN_INITIAL_PASSWORD` y **luego borre `ADMIN_RESET_PASSWORD`** (si no, cada despliegue la restablecería).
- Tras el primer acceso, cambie la contraseña inicial desde **Seguridad** y considere borrar
  `ADMIN_INITIAL_PASSWORD` del panel.

## Pasos

1. En Render: **New → Blueprint** → conecte su cuenta de GitHub → elija el repositorio.
2. Render pedirá los valores marcados `sync: false`:
   - **Correo (obligatorio para entrar con enlace mágico)**: `SMTP_URL`
     (`smtp://usuario:clave@servidor:587`) y `EMAIL_FROM` (`RetailControl <no-responder@su-dominio.com>`).
     Puede usar cualquier proveedor SMTP transaccional.
   - **Google (opcional)**: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. En Google Cloud Console, la URI de
     redirección es `https://<su-servicio>.onrender.com/api/auth/callback/google`.
   - Sin SMTP ni Google solo se puede entrar con **correo + contraseña** (administrador inicial o usuarios que
     ya definieron contraseña). El enlace mágico por correo requiere SMTP.
3. **Apply**. Al terminar, abra `https://<su-servicio>.onrender.com/api/health` → `{"status":"ok","db":"ok"}`.

## Si falla al crear `rc_app`

El log mostrará "No se pudo crear/actualizar el rol rc_app". Significa que el usuario de la base no tiene
`CREATEROLE`. Conéctese con el comando PSQL que muestra Render en la página de la base y ejecute (con la
contraseña que Render generó en `RC_APP_PASSWORD` del servicio web):

```sql
CREATE ROLE rc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<RC_APP_PASSWORD>';
```

Si su plan no permite crear roles, contacte a soporte de Render. **No** cambie la app para conectarse con el
usuario dueño sin revisar antes el impacto en el aislamiento.

## Limitaciones conocidas en Render gratuito

- El servicio se suspende tras inactividad; el primer acceso tarda en despertar.
- No hay worker: la purga de sesiones vencidas no se ejecuta (no afecta la seguridad: las sesiones vencidas
  se rechazan igual). Un Cron Job de Render (de pago) puede ejecutar `pnpm --filter @rc/worker start --once`.
- El rol de respaldo `rc_backup` (BYPASSRLS) requiere superusuario y no puede crearse en Render; use los
  respaldos del propio Render en un plan de pago.
