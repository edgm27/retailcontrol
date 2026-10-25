# Roadmap, backlog y estado

## Estado de las fases

| Fase | Objetivo | Estado | Puerta de calidad |
|---|---|---|---|
| 0 — Descubrimiento | PRD, arquitectura, amenazas, ERD, ADR, backlog | ✅ | Documentos en `docs/` |
| 1 — Fundaciones | Proyecto ejecutable, PostgreSQL + RLS, empresas, usuarios, Google OIDC, MFA TOTP, RBAC, auditoría, CI | ✅ (ver pendientes) | Pruebas de aislamiento y auth en verde ✅ |
| 2 — Inventario | Unidades, Kardex, movimientos, saldos, lotes, FEFO, vencimientos, conteos | ⏳ siguiente | Concurrencia e invariantes en verde |
| 3 — Compras y localización | Proveedores, OC, recepción, VES/USD, tasas auditadas, alertas | ⏳ | E2E de compras y precisión monetaria |
| 4 — Comercialización | Landing completa, onboarding con plan, cobro/conciliación, superadmin | ⏳ (límites ✅) | Onboarding y límites E2E |
| 5 — Producción | Reportes, exportaciones, observabilidad, rendimiento, seguridad, despliegue | ⏳ | Checklist de go-live |
| Posterior | POS, facturación fiscal autorizada, contabilidad, bancos | — | Requiere ADR y asesoría legal |

### Cambios posteriores (2026-10-25)

- Acceso con correo + contraseña, administrador inicial por variables secretas, MFA de propietario/admin
  configurable (opcional en la fase de pruebas en Render). Probado en integración y E2E.
- Despliegue en Render (Blueprint) y CI en GitHub en verde.

### Pendientes conocidos de la Fase 1

- Google OIDC está **implementado pero no probado contra Google real** (requiere credenciales del cliente OAuth).
  El flujo de correo + MFA sí está probado de punta a punta.
- CI definido en `.github/workflows/` pero **no ejecutado en GitHub** (el repositorio aún no tiene remoto).
  Los mismos pasos se ejecutaron localmente.
- `docker-compose.yml` validado sintácticamente; no se pudo levantar en este entorno (límite de descargas de
  Docker Hub). El desarrollo se verificó con PostgreSQL 16 local.
- Envío de correo SMTP implementado pero no probado contra un servidor real.
- OpenTelemetry pendiente (Fase 5); hoy hay logs estructurados y correlation id.
- ESLint 9 está fuera de soporte del proyecto ESLint; migrar a ESLint 10 cuando los plugins de Next/React lo
  soporten (herramienta de desarrollo, no se despliega).

## Estado de las pruebas de aceptación

| # | Prueba | Estado | Evidencia |
|---|---|---|---|
| 1 | Dos empresas con mismo SKU no ven ni modifican datos entre sí | ✅ | `tests/integration/tenant-isolation.test.ts` |
| 2 | Usuario de dos empresas solo actúa en el contexto autorizado | ✅ | `tenant-isolation.test.ts` ("Usuario con membresía en dos empresas") |
| 3 | Usuario sin permiso no ajusta existencias ni cambia tasas | 🟡 | Matriz verificada (`rbac.test.ts`); servicios de ajuste (F2) y tasas (F3) aún no existen — se repetirá a nivel de servicio |
| 4 | Recepciones repetidas con la misma clave de idempotencia no duplican stock | ⏳ F2/F3 | — |
| 5 | Dos salidas simultáneas no producen stock negativo indebido | ⏳ F2 | — |
| 6 | FEFO elige lote correcto y excluye vencidos/cuarentena | ⏳ F2 | — |
| 7 | Conteo físico genera ajustes auditados con aprobación | ⏳ F2 | — |
| 8 | Cambio de tasa BCV no altera históricos | ⏳ F3 | — |
| 9 | Límites de usuarios/sucursales por plan en backend | ✅ | `tests/integration/entitlements.test.ts` (incluye concurrencia) |
| 10 | MFA TOTP, recuperación y revocación de sesiones | ✅ | `mfa-sessions.test.ts` + E2E `apps/web/e2e/auth-mfa.spec.ts` |
| 11 | Exportaciones y jobs no filtran datos entre empresas | 🟡 | Jobs ✅ (`jobs.test.ts`); exportaciones no existen aún (F5) |
| 12 | Backup se restaura exitosamente en entorno de prueba | ✅ (local) | `scripts/db/backup-restore-test.sh`; paso en CI |

## Backlog priorizado — Fase 2 (propuesta)

| Prioridad | Historia | Criterio de aceptación |
|---|---|---|
| P0 | Unidades y conversiones exactas por dimensión | Conversión caja→unidad y kg→g exactas; rechaza convertir kg→litro |
| P0 | Movimientos inmutables + saldos por almacén/lote | No se puede UPDATE/DELETE un movimiento; reverso crea movimiento opuesto auditado |
| P0 | Idempotencia de mutaciones | Misma clave → mismo resultado, sin duplicar (aceptación 4) |
| P0 | No negativos con concurrencia | 2 salidas simultáneas sobre stock 1 → una falla (aceptación 5) |
| P0 | Lotes con estados y FEFO | Selecciona el que vence antes; excluye vencido/cuarentena/retirado/dañado (aceptación 6) |
| P1 | Ajustes con motivo y aprobación por umbral | Aprobador distinto del solicitante (aceptación 7) |
| P1 | Transferencias con estados | Salida y entrada reconciliadas; cancelación revierte |
| P1 | Conteos físicos/cíclicos | Diferencias → ajustes auditados |
| P1 | Kardex por producto/almacén/lote | Filtros, paginación, saldo acumulado |
| P1 | Códigos de barra + búsqueda por escáner USB | Escanear EAN abre el producto |
| P2 | Importación CSV con vista previa y errores por fila | Rollback total si hay errores; deduplicación por SKU |
| P2 | Dashboard: stock bajo, próximos a vencer, valorizado | Tarjetas con datos reales |

## Fases 3–5 (resumen)

- **F3**: proveedores (RIF), órdenes de compra con estados, recepción parcial por lote con diferencias y
  gastos de adquisición, devoluciones, tasas auditadas con snapshot por documento, costo promedio, alertas de
  vencimiento 7/15/30/60/90 días idempotentes (cola en PostgreSQL), reposición sugerida.
- **F4**: landing comercial (sectores, comparador, FAQ sin testimonios inventados), selección de plan en
  onboarding, registro y conciliación de pagos manuales, panel superadmin (empresas, planes, MRR/churn, uso,
  soporte temporal auditado), `support_grants`.
- **F5**: reportes (existencias, Kardex, valorización, rotación, cobertura, mermas, vencimientos), exportación
  CSV/XLSX aislada, OpenTelemetry, pruebas de carga, auditoría de accesibilidad WCAG 2.2 AA, pentest, IaC,
  despliegue, runbooks, checklist de go-live.
