# Rendimiento (Fase 5)

Objetivo del PRD: **p95 < 500 ms** en las pantallas principales con 50 000 productos.

## Método

`pnpm perf:load` ([scripts/perf/load-test.ts](../scripts/perf/load-test.ts)) crea una empresa con datos **ficticios**:
50 000 productos, 2 almacenes y 300 000 movimientos repartidos en 180 días (40 % entradas, 55 % salidas, 5 % mermas;
distribución tipo Pareto). Mide cada consulta 30 veces (tras un calentamiento) con el rol de la app (`rc_app`, con RLS),
igual que en producción. Para repetir sin recargar datos: `PERF_TENANT_ID=<id> pnpm perf:load`.

Entorno de medición: contenedor de desarrollo (PostgreSQL 16 local, sin otros usuarios). **No es el servidor de
producción**: en Render gratuito (CPU compartida) los tiempos serán mayores. Repita la prueba en el entorno final.

## Resultados (2026-10-27, v0.9.0)

| Consulta | p50 (ms) | p95 (ms) | máx (ms) |
|---|---:|---:|---:|
| Productos: página 1 | 11 | 14 | 14 |
| Productos: búsqueda | 107 | 178 | 183 |
| Inventario: existencias pág. 1 | 199 | 271 | 274 |
| Inicio: tablero 30 días | 336 | 420 | 434 |
| Inicio: tablero 90 días | 573 | 778 | 851 |
| Kardex de un producto | 51 | 62 | 69 |
| Reporte ABC 90 días (pantalla) | 674 | 756 | 802 |
| Reporte rotación 90 días | 430 | 481 | 506 |
| Reporte existencias | 263 | 333 | 427 |
| Movimientos 30 días (500) | 13 | 18 | 22 |

**8 de 10** consultas cumplen p95 < 500 ms. No cumplen, en este escenario extremo (el 100 % de los 300 000
movimientos cae dentro de la ventana): el **tablero de 90 días** (~0,75 s) y el **Reporte ABC de 90 días** (~0,75 s).

## Hallazgos y cambios aplicados

| Hallazgo | Cambio | Efecto |
|---|---|---|
| Tras una carga masiva, sin estadísticas, una consulta de existencias tardó >13 min | Documentado: ejecutar `ANALYZE` (rol dueño) tras importaciones masivas; autovacuum lo hace solo en minutos | 0,25 s |
| Filtro por fecha local no aprovechaba índices | Filtro `created_at >= medianoche local en UTC` + índice `(tenant_id, created_at)` | Movimientos 168 → 21 ms |
| El tablero ejecutaba ~12 consultas en secuencia | Consultas en paralelo, cada una en su transacción con contexto RLS | Tablero 30 días 2,2 s → 0,42 s |
| El Reporte ABC traía 50 000 filas para mostrar 500 | Clasificación A/B/C en SQL con funciones de ventana; solo viajan las filas mostradas | 1,14 s → 0,76 s |
| Probado y descartado: subconsulta para el costo | Impide el paralelismo de PostgreSQL | Empeoraba 2× |

## Pendiente

- Tabla de **agregados diarios** por producto y almacén (actualizada al registrar movimientos) para que el tablero
  y el ABC de 90 días no recorran todos los movimientos. Recomendado antes de clientes con >1 000 movimientos diarios.
- Repetir la medición en el entorno de producción y con varios usuarios simultáneos.
