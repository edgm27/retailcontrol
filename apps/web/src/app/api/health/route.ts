import { prisma } from "@rc/db";

export const dynamic = "force-dynamic";

/** Liveness + readiness mínima (sin datos sensibles). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch {
    return Response.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}
