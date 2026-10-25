# ADR-0007 — Sin Redis en Fase 1: límites y candados en PostgreSQL

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Decisión
- Limitador de frecuencia con ventana fija atómica (`INSERT … ON CONFLICT … RETURNING`) en `rate_limit_buckets`.
- Candados de cuota con `pg_advisory_xact_lock` por empresa.
- Jobs con intervalo simple en el worker; en Fase 3 cola en PostgreSQL (`FOR UPDATE SKIP LOCKED`) para alertas.

## Consecuencias
+ Una pieza menos que operar y asegurar. − Carga extra en PostgreSQL bajo abuso; mitigación: límite por IP en
el borde (WAF/CDN). Se reevaluará Redis si las métricas de F5 lo justifican; la interfaz `enforceRateLimit` no cambia.
