# ADR-0009 — DECIMAL para dinero y tasa congelada por documento

**Estado**: Aceptado (implementación en Fase 3) · **Fecha**: 2026-10-25

## Decisión
- Cantidades, costos, importes y tasas en `DECIMAL` (ver precisiones en `data-model.md`); en TypeScript con
  `Prisma.Decimal`. Prohibido `float`/`number` para dinero.
- Cada documento guarda la tasa usada (id + valor + fuente). Los históricos nunca se recalculan con la tasa actual.
- Redondeo solo al totalizar (2 decimales, `ROUND_HALF_UP`, configurable).
- FEFO (despacho físico) y método de valoración (promedio ponderado / FIFO contable) son conceptos separados.

## Consecuencias
+ Exactitud y trazabilidad ante auditorías. − Más columnas por documento; reportes deben elegir explícitamente
entre "valor histórico" y "valor a tasa actual".
