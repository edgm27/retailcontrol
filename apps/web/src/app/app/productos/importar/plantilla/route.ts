import { IMPORT_TEMPLATE } from "@rc/domain";
import { NextResponse } from "next/server";
import { requireTenant } from "@/server/session";

export async function GET() {
  await requireTenant("products.write");
  return new NextResponse(`\uFEFF${IMPORT_TEMPLATE}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-productos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
