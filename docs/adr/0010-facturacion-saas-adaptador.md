# ADR-0010 — Facturación del SaaS con adaptador y conciliación manual primero

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Decisión
Interfaz `BillingProvider`; primera implementación **manual con conciliación** (registro de pago, comprobante,
aprobación por operador, auditoría). Pasarelas internacionales solo si la entidad comercial es elegible; webhooks
firmados e idempotentes. Planes, límites y estados se validan siempre en backend; nunca se borran datos por
impago (modo solo lectura).

## Consecuencias
+ Funciona en Venezuela desde el día uno. − Trabajo operativo de conciliación; se automatizará al integrar
proveedores validados.
