# ADR-0004 — Auth.js v5 con sesiones en BD, Google OIDC y enlace mágico

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Contexto
Se pide Google OIDC, correo opcional, MFA independiente y sesiones revocables, con una solución madura.

## Decisión
- **Auth.js v5** (`next-auth@5.0.0-beta.32`) con adaptador Prisma y estrategia de sesión **database**: revocar =
  borrar la fila; el servidor lee la sesión de la BD en cada petición.
- Proveedores: **Google OIDC** (solo si `email_verified = true`; se habilita la vinculación por correo porque
  Google verifica la propiedad del correo) y **enlace mágico por correo** (un uso, 10 min, límite de envíos).
- **Sin contraseñas** en el MVP (menos superficie: sin almacenamiento de hashes, sin reutilización de claves).
- Sesión de 12 h con renovación por uso; cookies HttpOnly, `SameSite=Lax`, `__Secure-` en HTTPS.
- OAuth **no** sustituye el segundo factor: el MFA TOTP se exige después, independientemente del proveedor.

## Consecuencias
+ Proyecto maduro y ampliamente usado. − La v5 sigue etiquetada como beta en npm: versión fijada exacta, se
sigue su changelog; la lógica de MFA/sesión está en código propio para reducir dependencia.
− Los tokens de sesión se guardan en claro en `sessions` (diseño de Auth.js); mitigado con acceso restringido a
la BD y cifrado en reposo; pendiente evaluar hash del token.

## Alternativas
Better Auth (plugins de 2FA y organizaciones, menos rodaje), Keycloak/Zitadel (más operación), Clerk/Auth0
(costo y residencia de datos; posible bloqueo para Venezuela).

## Enmienda 2026-10-25 — Acceso con contraseña

Por requerimiento del negocio se añade **correo + contraseña**:
- Hash **scrypt** (N=2^17, r=8, p=1, sal de 16 bytes), comparación en tiempo constante, política NIST
  (12+ caracteres, sin claves obvias ni el propio correo).
- Mensaje genérico ("Correo o contraseña incorrectos"), tiempo similar exista o no el usuario, límite de
  10 intentos por correo y 50 por IP cada 15 minutos; intentos fallidos auditados.
- La sesión se crea en la misma tabla y cookie que Auth.js (revocable igual); el MFA se exige después si está
  activo. Cambiar la contraseña exige la actual y cierra las demás sesiones.
- Administrador inicial creado al desplegar desde variables secretas (`ADMIN_EMAIL`,
  `ADMIN_INITIAL_PASSWORD`); nunca en el repositorio. Solo se crea si no existe.
