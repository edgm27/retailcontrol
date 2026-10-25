# PRD — RetailControl

> Estado: borrador v0.1 (Fase 0). Fecha: 2026-10-25. Responsable: Producto (por asignar).

## 1. Problema

Abastos, minimarkets, bodegas y ferreterías venezolanas controlan inventario con cuadernos, hojas de cálculo o
sistemas de facturación que no manejan bien lotes, vencimientos, varias sucursales ni la convivencia diaria de
precios en USD y bolívares. Consecuencias: mermas por vencimiento, faltantes no detectados, compras sin
criterio, robo hormiga sin trazabilidad y dificultad para delegar en personal de mostrador o almacén.

## 2. Propuesta de valor

Un SaaS web, en español de Venezuela, rápido en conexiones limitadas y usable desde el teléfono, que:

- Registra cada entrada y salida como un **libro (Kardex) inmutable**: quién, qué, cuándo, dónde y por qué.
- Controla **lotes y vencimientos** con despacho FEFO y alertas anticipadas.
- Trabaja con **USD y VES** guardando la tasa usada en cada documento, sin reescribir el pasado.
- Separa estrictamente los datos de cada empresa y protege el acceso con **verificación en dos pasos**.

## 3. Usuarios y roles

| Persona | Necesidad principal | Rol típico |
|---|---|---|
| Dueño/a del comercio | Ver valor del inventario, mermas y controlar a su personal | Propietario |
| Encargado/a administrativo | Configurar usuarios, sucursales, tasas | Administrador |
| Gerente de tienda | Aprobar ajustes, compras y transferencias | Gerente |
| Almacenista / mostrador | Recibir mercancía, despachar, contar | Almacenista |
| Comprador/a | Órdenes de compra y proveedores | Comprador |
| Contador/a o auditor externo | Revisar sin modificar | Auditor |
| Socio/a o consulta | Solo ver | Solo lectura |
| Equipo de la plataforma | Planes, cobros, soporte (sin ver inventarios) | Superadmin / Soporte |

Detalle de permisos: [rbac-matrix.md](rbac-matrix.md).

## 4. Alcance del MVP

Incluido: onboarding autoservicio, suscripciones y planes, usuarios y roles, sucursales y almacenes, catálogo,
unidades y conversiones, inventario como libro, lotes y vencimientos (FEFO), compras y recepciones, conteos
físicos, alertas, tasas de cambio auditadas, reportes y exportaciones CSV/XLSX.

**Excluido del MVP** (con interfaces previstas para el futuro): POS, facturación fiscal, contabilidad completa,
integraciones bancarias, app offline/PWA con sincronización, API pública, lectura de códigos por cámara.

## 5. Requisitos funcionales por fase

Ver [roadmap.md](roadmap.md) para fases, criterios de salida y estado. Resumen:

| Área | Requisitos clave | Fase |
|---|---|---|
| Identidad | Google OIDC, enlace mágico por correo, TOTP, códigos de recuperación, sesiones revocables | 1 ✅ |
| Multiempresa | Membresías, empresa activa validada en servidor, RLS, auditoría | 1 ✅ |
| Catálogo | SKU único por empresa, códigos de barra, variantes, unidades y conversiones, importación CSV | 1 (mínimo) / 2 |
| Inventario | Movimientos inmutables, saldos, idempotencia, no negativos, ajustes con aprobación, transferencias, conteos | 2 |
| Lotes | Estados, FEFO, bloqueo de vencidos/cuarentena, alertas 7/15/30/60/90 días | 2–3 |
| Compras | Proveedores con RIF, OC con estados, recepción parcial por lote, diferencias, devoluciones | 3 |
| Moneda | VES/USD, tasas BCV o manuales auditadas, tasa congelada por documento | 3 |
| Comercial | Landing, 3 planes, entitlements en backend, conciliación de pagos manuales, superadmin | 4 (límites ✅ en 1) |
| Producción | Reportes, exportaciones, observabilidad, rendimiento, respaldos, despliegue | 5 |

## 6. Requisitos no funcionales

- **Seguridad**: aislamiento por empresa en base de datos (RLS) y en servidor; MFA obligatorio para propietario,
  administrador y superadmin; auditoría inmutable; ver [security-threat-model.md](security-threat-model.md).
- **Rendimiento** (objetivo, a medir en Fase 5): p95 < 500 ms en pantallas principales con 50 000 productos y
  1 M de movimientos por empresa; primera carga < 200 kB JS en móvil.
- **Disponibilidad** (objetivo): 99,5 % mensual en el MVP; RPO 24 h / RTO 4 h con respaldos diarios
  restaurados en prueba (Fase 5 lo afina).
- **Accesibilidad**: WCAG 2.2 AA como objetivo medible (auditoría con axe + revisión manual en Fase 5).
- **Localización**: es-VE, America/Caracas, formatos de número y fecha venezolanos; i18n preparado.
- **Exactitud**: DECIMAL para cantidades, costos, importes y tasas; reglas de redondeo documentadas.

## 7. Métricas de éxito (hipótesis a validar)

- Activación: empresa que registra ≥ 20 productos y ≥ 1 recepción en 7 días.
- Retención: % de empresas con movimientos en 4 de las últimas 4 semanas.
- Valor: reducción de mermas por vencimiento reportada por el cliente (encuesta) y valor de inventario próximo
  a vencer detectado a tiempo.

## 8. Restricciones y supuestos

- No se promete cumplimiento SENIAT ni emisión fiscal en el MVP.
- Precios de planes son **de ejemplo** y editables; la moneda y condiciones de cobro se definen en
  [billing-strategy.md](billing-strategy.md).
- No se publican testimonios, logos de clientes ni certificaciones que no existan.
- Decisiones de negocio pendientes: [open-questions.md](open-questions.md).

## 9. Criterios de aceptación globales

Las 12 pruebas de aceptación obligatorias y su estado/evidencia están en [roadmap.md](roadmap.md#estado-de-las-pruebas-de-aceptación).
