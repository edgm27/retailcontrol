# Observabilidad

| Señal | Implementación | Configuración |
|---|---|---|
| Logs estructurados | pino (JSON) con nivel `LOG_LEVEL`; sin datos personales ni secretos | `LOG_LEVEL` |
| Id de correlación | El middleware asigna `x-correlation-id` a cada petición y lo devuelve en la respuesta | — |
| Errores de servidor | `onRequestError` (apps/web/src/instrumentation.ts): registra digest (el código que ve el usuario), id de correlación, método y ruta **sin** parámetros de búsqueda | — |
| Trazas (OpenTelemetry) | `@vercel/otel` solo si hay destino configurado; trazas de peticiones y llamadas salientes | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME` |
| Consultas lentas | Registro `slow_query` con la plantilla SQL y la duración (nunca los parámetros) | `SLOW_QUERY_MS` (p. ej. 500) |
| Salud | `GET /api/health`: estado, latencia de BD, uptime, versión, commit | Monitor externo cada 1–5 min |
| Auditoría de negocio | Bitácora inmutable en BD (`audit_events`) | — |

## Cómo usarlo

- **Buscar un error que reportó un usuario**: pida el código de la pantalla de error (digest) y búsquelo en los logs
  (`"digest":"…"`); el `correlationId` del mismo registro une todas las líneas de esa petición.
- **Trazas**: configure un colector OTLP (Grafana Cloud, Honeycomb, Jaeger u otro) y defina las variables. Sin ellas
  no se carga ningún componente de OpenTelemetry.
- **Alertas recomendadas** (en el monitor externo / proveedor de logs): `/api/health` ≠ 200 durante 2 min;
  más de 5 `request_error` en 5 min; `slow_query` > 2 s; `db: "error"`.

En Render gratuito no hay alertas integradas ni retención larga de logs: ver [go-live-checklist.md](go-live-checklist.md).
