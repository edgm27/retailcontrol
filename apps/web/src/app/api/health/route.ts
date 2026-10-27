import { prisma } from "@rc/db";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Liveness + readiness mínima. Muestra versión y commit (sin datos sensibles). */
export async function GET() {
  const info = {
    version: pkg.version,
    commit: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "local").slice(0, 7),
    // Diagnóstico de la fase de pruebas: indica solo SI las variables existen, nunca su valor.
    adminConfigured: Boolean(process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_INITIAL_PASSWORD?.trim()),
    mfaEnforced: process.env.MFA_ENFORCE_PRIVILEGED_ROLES !== "false",
  };
  try {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round(performance.now() - t0);
    return Response.json({ status: "ok", db: "ok", dbLatencyMs, uptimeS: Math.round(process.uptime()), ...info }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", db: "error", ...info }, { status: 503 });
  }
}
