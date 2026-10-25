import { prisma } from "@rc/db";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Liveness + readiness mínima. Muestra versión y commit (sin datos sensibles). */
export async function GET() {
  const info = {
    version: pkg.version,
    commit: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "local").slice(0, 7),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok", ...info });
  } catch {
    return Response.json({ status: "degraded", db: "error", ...info }, { status: 503 });
  }
}
