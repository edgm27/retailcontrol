# Runbook: rotación de secretos

| Secreto | Efecto de rotarlo | Procedimiento |
|---|---|---|
| `AUTH_SECRET` | Invalida tokens de Auth.js (enlaces mágicos pendientes). Las sesiones en BD siguen válidas | Generar `openssl rand -base64 32`, actualizar en Render, redesplegar |
| `MFA_ENCRYPTION_KEY` | **Sin migración, los secretos TOTP guardados no se pueden descifrar** | No rotar sin un script de re-cifrado (pendiente). Si se compromete: rotar y pedir a los usuarios volver a vincular la app (desactivar 2FA desde Usuarios) |
| `RECOVERY_CODE_PEPPER` | Invalida los códigos de recuperación existentes | Rotar y pedir a los usuarios regenerar códigos (Seguridad) |
| `RC_APP_PASSWORD` / roles BD | Corta conexiones con la clave anterior | `ALTER ROLE rc_app PASSWORD …` con el rol dueño, actualizar variable, redesplegar |
| `SMTP_URL` | Correos fallan hasta actualizar | Cambiar en el proveedor y en Render |
| `ADMIN_INITIAL_PASSWORD` | Solo se usa al crear el administrador | Quitar la variable cuando el administrador ya cambió su clave |

Tras una sospecha de compromiso: rotar, cerrar sesiones (`DELETE FROM sessions` con el rol dueño fuerza a todos a
entrar de nuevo) y registrar en el incidente.
