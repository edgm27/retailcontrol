import { withTenant } from "@rc/db";
import { toCsv, toXlsx } from "../export/tabular";
import { assertPermission } from "../rbac";
import { recordAudit } from "./audit";
import { enforceRateLimit } from "./rate-limit";
import { runReport, type ReportKey, type ReportParams } from "./reports";
import type { TenantActor } from "./types";

export type ExportFormat = "csv" | "xlsx";
export const EXPORT_MAX_ROWS = 50_000;

/**
 * Genera la exportación en la misma petición (sin archivos intermedios ni URLs públicas):
 * los datos salen del contexto RLS de la empresa del actor y la descarga queda auditada.
 */
export async function exportReport(actor: TenantActor, key: ReportKey, params: ReportParams, format: ExportFormat, now = new Date()) {
  assertPermission(actor, "reports.export");
  await enforceRateLimit(`report-export:${actor.userId}`, 60, 3600);
  const report = await runReport(actor, key, { ...params, limit: EXPORT_MAX_ROWS }, now);
  const subtitle = [report.periodLabel, `Moneda: ${report.currency}`, `Generado: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`]
    .filter(Boolean)
    .join(" · ");
  const body = format === "xlsx" ? toXlsx(report, { subtitle }) : toCsv(report);
  await withTenant(actor.tenantId, actor.userId, (tx) =>
    recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "report.exported",
      entityType: "Report",
      entityId: null,
      metadata: { report: key, format, rows: report.rows.length, truncated: report.truncated, days: params.days ?? null, warehouseId: params.warehouseId ?? null },
      meta: actor.meta,
    }),
  );
  const date = now.toISOString().slice(0, 10);
  return {
    filename: `retailcontrol-${key}-${date}.${format}`,
    contentType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
    body,
    rows: report.rows.length,
    truncated: report.truncated,
  };
}
