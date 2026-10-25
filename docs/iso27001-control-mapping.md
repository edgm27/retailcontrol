# Matriz de controles — ISO/IEC 27001:2022 (Anexo A) y guía ISO/IEC 27002:2022

> **Aviso**: este documento prepara el camino hacia un SGSI. RetailControl **no está certificado** en ISO/IEC
> 27001. La certificación requiere un Sistema de Gestión de Seguridad de la Información operativo (alcance,
> política, evaluación y tratamiento de riesgos, Declaración de Aplicabilidad, auditoría interna, revisión por la
> dirección) y una auditoría de un organismo certificador independiente.

Estados: ✅ implementado con evidencia · 🟡 parcial · ⏳ planificado · 🏢 organizativo (fuera del código).
Responsables propuestos (a confirmar): **CTO**, **SecOps**, **Producto**, **Dirección**, **Proveedor cloud**.

## 1. Controles organizativos (5.x)

| Control | Aplicación en RetailControl | Estado | Evidencia / próximo paso | Responsable |
|---|---|---|---|---|
| 5.1 Políticas de seguridad | Política de seguridad y uso aceptable | 🏢 ⏳ | Redactar y aprobar antes del go-live | Dirección |
| 5.2 Roles y responsabilidades | Dueños de controles en esta matriz | 🟡 | Confirmar nombres | Dirección |
| 5.3 Segregación de funciones | Aprobación de ajustes por otro usuario (F2); plataforma sin acceso a inventarios; restablecer MFA solo superadmin | 🟡 | `rbac.ts`, políticas RLS; doble aprobación interna en F4 | CTO |
| 5.7 Inteligencia de amenazas | Avisos de dependencias | 🟡 | Dependabot, `pnpm audit` | SecOps |
| 5.9 Inventario de activos | Activos de información listados | 🟡 | [security-threat-model.md](security-threat-model.md) §1; inventario de infraestructura en F5 | SecOps |
| 5.12 Clasificación de la información | Datos de empresa = confidencial; secretos = restringido | ⏳ | Esquema de clasificación | SecOps |
| 5.15 Control de acceso | RBAC por empresa y sucursal + RLS | ✅ | `packages/domain/src/rbac.ts`, migración `*_rls_policies`, pruebas de integración | CTO |
| 5.16 Gestión de identidades | Usuarios únicos por correo verificado; invitaciones ligadas al correo | ✅ | `members.ts`, `invitations.test.ts` | CTO |
| 5.17 Información de autenticación | Sin contraseñas; TOTP cifrado; códigos con HMAC; enlace mágico de un uso | ✅ | `mfa.ts`, `crypto.ts`, `security.test.ts` | CTO |
| 5.18 Derechos de acceso | Altas, cambios de rol y bajas auditadas; revocación inmediata | ✅ | `audit_events`, `mfa-sessions.test.ts` | CTO |
| 5.19–5.22 Proveedores | Google, SMTP, hosting, pasarelas | ⏳ | Evaluación de proveedores y acuerdos (DPA) | Dirección |
| 5.23 Servicios en la nube | Selección de proveedor con cifrado en reposo, respaldos, regiones | ⏳ | Pregunta abierta Q-INF-1 | CTO |
| 5.24–5.28 Gestión de incidentes | Plan de respuesta, registro, lecciones aprendidas | ⏳ | Runbook en F5 | SecOps |
| 5.29–5.30 Continuidad | Respaldos verificados; RPO/RTO objetivo | 🟡 | `scripts/db/backup-restore-test.sh` en CI; PITR en F5 | CTO |
| 5.31 Requisitos legales | Fiscal (SENIAT), protección de datos, contratos | 🟡 | [venezuela-localization.md](venezuela-localization.md), [open-questions.md](open-questions.md) | Dirección |
| 5.33 Protección de registros | Auditoría inmutable; retención definida | 🟡 | Trigger + privilegios; política de retención pendiente | CTO |
| 5.34 Privacidad y datos personales | Minimización: correo, nombre, IP y user-agent de sesión | 🟡 | Aviso de privacidad y base legal pendientes | Dirección |
| 5.36 Cumplimiento de políticas | Revisión periódica de esta matriz | ⏳ | Revisión trimestral | SecOps |

## 2. Controles de personas (6.x)

| Control | Aplicación | Estado | Responsable |
|---|---|---|---|
| 6.1 Selección / 6.2 Términos de empleo | Verificación y acuerdos de confidencialidad del equipo | 🏢 ⏳ | Dirección |
| 6.3 Concienciación y formación | Formación en desarrollo seguro y atención de soporte (ingeniería social) | 🏢 ⏳ | SecOps |
| 6.7 Trabajo remoto | Equipos con disco cifrado y MFA en cuentas de trabajo | 🏢 ⏳ | SecOps |

## 3. Controles físicos (7.x)

Delegados al proveedor de nube (centros de datos). Se aceptarán mediante sus informes (p. ej. SOC 2 / ISO 27001
del proveedor) — ⏳ al seleccionar proveedor. Equipos de trabajo: 7.9/7.10 cubiertos por política de endpoints 🏢.

## 4. Controles tecnológicos (8.x)

| Control | Aplicación | Estado | Evidencia |
|---|---|---|---|
| 8.2 Accesos privilegiados | Roles de plataforma separados; MFA obligatorio; BD con roles mínimos (`rc_owner`/`rc_app`/`rc_backup`) | ✅ | `bootstrap.sql`, `session.ts` |
| 8.3 Restricción de acceso a la información | RLS forzado por empresa y por usuario (MFA) | ✅ | `tenant-isolation.test.ts` |
| 8.4 Acceso al código fuente | Repositorio privado, revisión por PR, ramas protegidas | ⏳ | Configurar en GitHub |
| 8.5 Autenticación segura | OIDC, enlace mágico, TOTP, bloqueo, anti-replay, sesiones revocables | ✅ | `mfa-sessions.test.ts`, E2E `auth-mfa.spec.ts` |
| 8.7 Protección contra malware | Sin carga de archivos en F1; escaneo de imágenes subidas en F2 | ⏳ | — |
| 8.8 Vulnerabilidades técnicas | `pnpm audit` (0 vulnerabilidades conocidas al 2026-10-25), Dependabot, CodeQL | ✅ | `.github/workflows/*` |
| 8.9 Gestión de configuración | Infraestructura como código | ⏳ | F5 |
| 8.10 Eliminación de información | Política de retención; no se borran datos por impago | 🟡 | [billing-strategy.md](billing-strategy.md) |
| 8.11 Enmascaramiento | Redacción en logs y auditoría | ✅ | `audit.ts` `redact()`, `logger.ts` |
| 8.12 Prevención de fuga de datos | Exportaciones con control de empresa (F5) | ⏳ | — |
| 8.13 Respaldo | Respaldo cifrado + restauración verificada automáticamente | ✅ | `backup-restore-test.sh` (ejecutado localmente; en CI) |
| 8.15 Registro (logging) | Logs JSON con correlation id; auditoría de negocio | ✅ | `logger.ts`, `audit_events` |
| 8.16 Monitoreo | Métricas, trazas y alertas | ⏳ | OpenTelemetry en F5 |
| 8.17 Sincronización de reloj | NTP del proveedor; TOTP tolera ±30 s | 🟡 | Verificar en infraestructura |
| 8.20–8.22 Seguridad de redes | BD solo en red privada; TLS en el borde | ⏳ | F5 |
| 8.24 Criptografía | AES-256-GCM (secretos TOTP), HMAC-SHA256 (códigos), SHA-256 (tokens), TLS; claves fuera del código | ✅ | `crypto.ts` |
| 8.25 Ciclo de vida de desarrollo seguro | Fases con puertas de calidad, ADR, modelo de amenazas | ✅ | `docs/` |
| 8.26 Requisitos de seguridad de aplicaciones | Definidos en PRD y aquí | ✅ | — |
| 8.27 Arquitectura segura | Defensa en profundidad (servidor + RLS), falla cerrada | ✅ | [architecture.md](architecture.md) |
| 8.28 Codificación segura | TypeScript estricto, zod, ESLint con reglas de seguridad | ✅ | `eslint.config.mjs` |
| 8.29 Pruebas de seguridad | Pruebas negativas de aislamiento, RBAC, MFA; SAST/SCA; escaneo de secretos | ✅ | `tests/integration`, CI |
| 8.31 Separación de entornos | Bases de prueba desechables (`*_test`), datos ficticios | 🟡 | Entornos staging/prod en F5 |
| 8.32 Gestión de cambios | PR + CI obligatorio + migraciones verificadas (drift) | 🟡 | Activar protección de rama |
| 8.33 Información de prueba | Solo datos ficticios `@example.com` | ✅ | `seed.ts`, `helpers.ts` |

## 5. Evaluación de riesgos

El registro de riesgos inicial es la tabla del [modelo de amenazas](security-threat-model.md). Para el SGSI se
requiere: metodología formal (criterios de probabilidad/impacto y aceptación), dueños de riesgo, plan de
tratamiento y Declaración de Aplicabilidad (SoA) que justifique la inclusión o exclusión de los 93 controles.

## 6. Rotación de secretos (propuesta)

| Secreto | Frecuencia | Procedimiento |
|---|---|---|
| Contraseñas de roles de BD | 90 días o ante incidente | Rotar en gestor + `ALTER ROLE` + despliegue |
| `AUTH_SECRET` | 180 días | Invalida enlaces mágicos pendientes; sesiones en BD no dependen de él |
| `MFA_ENCRYPTION_KEY` | Anual o ante incidente | Prefijo de versión `v1.` permite re-cifrado gradual con `v2` (job pendiente) |
| `RECOVERY_CODE_PEPPER` | Ante incidente | Requiere regenerar códigos de todos los usuarios |
| Frase de respaldo | Anual | Re-cifrar respaldos retenidos |
