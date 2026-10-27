import { exportReport, isDomainError, isReportKey } from "@rc/domain";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/server/logger";
import { requireTenant } from "@/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Descarga de reportes. Se valida sesión, empresa activa y permiso en cada petición. */
export async function GET(req: NextRequest) {
  const { actor } = await requireTenant("reports.export");
  const sp = req.nextUrl.searchParams;
  const key = sp.get("reporte") ?? "";
  const format = sp.get("formato") === "csv" ? "csv" : "xlsx";
  if (!isReportKey(key)) return NextResponse.json({ error: "Reporte no disponible." }, { status: 400 });
  const almacen = sp.get("almacen") ?? "";
  try {
    const file = await exportReport(actor, key, { days: Number(sp.get("dias")) || undefined, warehouseId: UUID.test(almacen) ? almacen : undefined }, format);
    return new NextResponse(Buffer.from(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    logger.error({ err: { message: (e as Error).message } }, "error exportando reporte");
    return NextResponse.json({ error: "No se pudo generar la exportación." }, { status: 500 });
  }
}
