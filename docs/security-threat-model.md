# Modelo de amenazas

> Método: STRIDE por componente + escenarios de abuso específicos del negocio. Revisar en cada fase.
> Estado: Fase 1. Riesgo = probabilidad × impacto (A/M/B) **después** de los controles actuales.

## 1. Activos

| Activo | Por qué importa |
|---|---|
| Datos de inventario, costos y proveedores de cada empresa | Confidencialidad comercial; la fuga entre empresas destruye la confianza en el SaaS |
| Identidades, sesiones, secretos TOTP y códigos de recuperación | Toma de cuentas |
| Bitácora de auditoría | Evidencia ante fraude interno (robo hormiga, ajustes falsos) |
| Tasas y documentos históricos (F3) | Exactitud contable; no deben reescribirse |
| Credenciales de infraestructura y claves de cifrado | Compromiso total |

## 2. Límites de confianza

Navegador ↔ Next.js (Internet, TLS) · Next.js ↔ PostgreSQL (red privada, rol `rc_app`) · Next.js ↔ Google OIDC /
SMTP · Operadores de plataforma ↔ datos de empresas · CI/CD ↔ repositorio y registro de paquetes.

## 3. Amenazas y controles

| # | Amenaza (STRIDE) | Escenario | Controles implementados | Riesgo residual | Pendiente |
|---|---|---|---|---|---|
| T1 | Divulgación (I) | Empresa A lee datos de B por un `where` olvidado | RLS forzado, rol sin BYPASSRLS, FK compuestas, meta-prueba de cobertura, pruebas negativas | B | Revisión de cada migración nueva (checklist en PR) |
| T2 | Elevación (E) | Usuario manipula `tenant_id` en el navegador | Empresa activa en fila de sesión; membresía revalidada por petición | B | — |
| T3 | Suplantación (S) | Robo de cookie de sesión | HttpOnly, Secure/`__Secure-` en HTTPS, SameSite=Lax, CSP; sesiones de 12 h; revocación inmediata | M | Vincular sesión a huella de dispositivo (evaluar); hash del token de sesión en BD |
| T4 | Suplantación | Fuerza bruta de TOTP | Bloqueo tras 5 fallos (15 min), límite por usuario, anti-replay por paso de tiempo, fila bloqueada `FOR UPDATE` | B | Alertar al usuario por correo tras bloqueo |
| T5 | Suplantación | Intercepción del enlace mágico (correo comprometido) | Enlace de un solo uso, 10 min, límite de envíos; MFA obligatorio para propietario/admin | M | Notificar nuevos inicios de sesión |
| T6 | Suplantación | Ingeniería social para recuperar acceso sin 2FA | Códigos de recuperación; restablecimiento solo por superadmin con justificación, revoca todas las sesiones, auditado | M | Procedimiento de verificación de identidad documentado (fuera de banda) y doble aprobación interna |
| T7 | Divulgación | Lectura de la BD (respaldo filtrado, acceso indebido) | Secretos TOTP cifrados AES-256-GCM con AAD por usuario; códigos con HMAC + pimienta; respaldos cifrados con GPG | M | Cifrado en reposo del proveedor; KMS para claves; rotación de claves (`v1.` versionado) |
| T8 | Manipulación (T) | Empleado borra rastros de un ajuste fraudulento | Auditoría solo inserción (privilegios + trigger), en la misma transacción que el cambio | B | Exportación periódica de auditoría a almacenamiento WORM (F5) |
| T9 | Repudio (R) | "Yo no cambié ese rol" | Actor, IP, user-agent, correlation id, antes/después en auditoría | B | Sincronización horaria verificada en infraestructura |
| T10 | Manipulación | CSRF en acciones de estado | Server Actions con verificación de `Origin`; token CSRF de Auth.js; SameSite=Lax | B | — |
| T11 | Manipulación | XSS almacenado (nombres de productos, empresas) | Escape de React; CSP con nonce y `strict-dynamic`; validación zod | B | `style-src 'unsafe-inline'` se mantiene (bajo impacto) — evaluar retirarlo |
| T12 | Manipulación | Inyección SQL | Prisma parametrizado; `$queryRaw` etiquetado; ESLint prohíbe variantes `Unsafe` | B | SAST (CodeQL) en CI |
| T13 | Elevación | Admin se asciende a propietario o deja la empresa sin dueño | Reglas `canAssignRole`, bloqueo de último propietario con `FOR UPDATE` | B | — |
| T14 | DoS | Abuso de registro / invitaciones / correos | Límites por clave (PostgreSQL); límites de plan con candado transaccional | M | Rate limit por IP en el borde (WAF/CDN); CAPTCHA si se detecta abuso |
| T15 | Elevación | Operador de plataforma lee inventarios | Políticas RLS sin cláusula de plataforma en tablas de negocio; `support_grants` temporales (F4) | B | Separación de funciones en operación (F4) |
| T16 | Divulgación | Secretos en el repositorio o en logs | `.env` ignorado, gitleaks en CI, redacción en pino, auditoría con redacción de claves sensibles | B | Gestor de secretos en producción |
| T17 | Manipulación | Dependencia comprometida (cadena de suministro) | Lockfile congelado, versiones exactas, `pnpm audit` en CI, Dependabot, `onlyBuiltDependencies` | M | Fijar acciones de GitHub por SHA; SBOM; firma de imágenes |
| T18 | Divulgación | Fuga por exportaciones o jobs | Jobs con contexto por empresa (probado) | B | Exportaciones F5 con URL firmada y verificación de membresía |
| T19 | Pérdida de datos | Borrado accidental / ransomware | Respaldo cifrado + prueba de restauración automatizada | M | PITR del proveedor, copia fuera de la cuenta principal, simulacros trimestrales |
| T20 | Manipulación | Reescritura de documentos históricos con la tasa actual (F3) | Diseño: tasa congelada en el documento | — | Implementar en F3 con pruebas |

## 4. Recuperación de acceso (procedimiento propuesto)

1. El usuario usa un **código de recuperación** (autoservicio). La app recomienda regenerar códigos y cerrar
   otras sesiones.
2. Sin códigos: solicita soporte desde el correo registrado. Soporte verifica identidad **fuera de banda**
   (p. ej. videollamada con documento y confirmación de otro propietario de la empresa si existe).
3. Un superadmin ejecuta `adminResetMfa` con justificación (≥ 15 caracteres): borra el factor, revoca **todas**
   las sesiones y queda auditado. El usuario debe enrolarse de nuevo al entrar.
4. Pendiente (F4): doble aprobación interna y notificación al resto de propietarios de la empresa.

## 5. Supuestos

- TLS 1.2+ en el borde; la app no se expone por HTTP plano en producción.
- PostgreSQL accesible solo desde la red privada de la app.
- `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `RECOVERY_CODE_PEPPER` y credenciales de BD provienen de un gestor de
  secretos y se rotan según [iso27001-control-mapping.md](iso27001-control-mapping.md).
