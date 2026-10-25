# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado semántico.

## [0.2.0] — 2026-10-25

### Añadido
- Inicio de sesión con correo y contraseña (hash scrypt, límites de intentos, auditoría de fallos).
- Definir y cambiar contraseña desde **Seguridad** (cierra las demás sesiones).
- Administrador inicial creado al desplegar desde variables secretas (`ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`).
- MFA de propietario/administrador configurable (`MFA_ENFORCE_PRIVILEGED_ROLES`); activable por cada usuario desde **Seguridad**.
- Despliegue en Render (Blueprint) y `/api/health` con versión y commit.

### Corregido
- Los formularios ya no se vacían tras un error de validación.
- Falsos positivos del escáner de secretos en CI.

## [0.1.0] — 2026-10-25

### Añadido
- Fase 0 (documentación) y Fase 1 (fundaciones): multiempresa con RLS, Google OIDC y enlace mágico,
  MFA TOTP con códigos de recuperación, sesiones revocables, RBAC, auditoría inmutable, límites de plan,
  respaldo verificado y CI.
