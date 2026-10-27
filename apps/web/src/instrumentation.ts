import type { Instrumentation } from "next";

/**
 * Observabilidad del servidor.
 * - OpenTelemetry (trazas de peticiones y fetch) SOLO si se define OTEL_EXPORTER_OTLP_ENDPOINT
 *   (p. ej. un colector OTLP o un proveedor compatible). Sin esa variable no se carga nada.
 * - Errores de servidor: registro estructurado con id de correlación, ruta y digest
 *   (el mismo código que ve el usuario en la pantalla de error).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "retailcontrol-web",
    attributes: {
      "service.version": process.env.npm_package_version ?? "desconocida",
      "deployment.environment": process.env.RENDER ? "render" : (process.env.NODE_ENV ?? "development"),
    },
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/server/logger");
  const err = error as Error & { digest?: string };
  const header = (name: string) => {
    const h = request.headers[name];
    return Array.isArray(h) ? h[0] : h;
  };
  logger.error(
    {
      event: "request_error",
      digest: err.digest,
      correlationId: header("x-correlation-id"),
      method: request.method,
      // Solo la ruta: los parámetros de búsqueda pueden contener datos del usuario.
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
      err: { name: err.name, message: err.message },
    },
    "error no controlado en una petición",
  );
};
