import { hasPermission, listWarehouses, PERIOD_OPTIONS, REPORT_KEYS, REPORTS, runReport, type ReportColumn, type ReportKey, type ReportResult } from "@rc/domain";
import { Alert, buttonVariants, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { PrintButton } from "./print-button";

export const metadata = { title: "Reportes" };

const nf = (digits: number) => new Intl.NumberFormat("es-VE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const nfVar = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 3 });

function fmtCell(v: string | number | null | undefined, col: ReportColumn): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (col.type === "money") return nf(2).format(v);
    if (col.type === "percent") return `${nf(2).format(v)} %`;
    if (col.type === "int") return nf(0).format(v);
    return nfVar.format(v);
  }
  if (col.type === "date") return fmtDate(v);
  return v;
}

const isNumeric = (c: ReportColumn) => c.type !== "text" && c.type !== "date";
const CLASS_STYLE: Record<string, string> = {
  A: "bg-[var(--color-series-1)] text-white",
  B: "bg-[var(--color-series-2)] text-white",
  C: "bg-[var(--color-series-3)] text-white",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; dias?: string; almacen?: string }> }) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("reports.read");
  const key: ReportKey = (REPORT_KEYS as string[]).includes(sp.r ?? "") ? (sp.r as ReportKey) : "abc";
  const warehouses = await listWarehouses(actor);
  const almacen = warehouses.some((w) => w.id === sp.almacen) ? sp.almacen! : "";
  const days = (PERIOD_OPTIONS as readonly number[]).includes(Number(sp.dias)) ? Number(sp.dias) : undefined;
  const report = await runReport(actor, key, { days, warehouseId: almacen || undefined, limit: 500 });
  const canExport = hasPermission(access.role, "reports.export");
  const exportUrl = (formato: string) =>
    `/app/reportes/exportar?${new URLSearchParams({ reporte: key, formato, ...(days ? { dias: String(days) } : {}), ...(almacen ? { almacen } : {}) })}`;
  const usesPeriod = key !== "existencias";

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Reportes</h1>
      </div>

      <nav aria-label="Tipo de reporte" className="no-print flex gap-2 overflow-x-auto pb-1">
        {REPORT_KEYS.map((k) => (
          <Link
            key={k}
            href={`/app/reportes?r=${k}`}
            aria-current={k === key ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${k === key ? "border-navy bg-navy text-white" : "bg-card hover:bg-accent"}`}
          >
            {REPORTS[k].title}
          </Link>
        ))}
      </nav>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="rep-t">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="rep-t" className="text-xl font-bold">{report.title}</h2>
            <p className="text-sm text-muted-foreground">{report.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {access.tenantName} · {report.periodLabel} · Montos a costo en {report.currency === "VES" ? "bolívares" : "dólares"}
              {almacen && ` · ${warehouses.find((w) => w.id === almacen)?.name}`}
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <a href={exportUrl("xlsx")} className={buttonVariants({ size: "sm" })} download>Excel (XLSX)</a>
                <a href={exportUrl("csv")} className={buttonVariants({ variant: "outline", size: "sm" })} download>CSV</a>
              </>
            )}
            <PrintButton />
          </div>
        </div>

        <form className="no-print mt-4 flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="r" value={key} />
          {usesPeriod && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{key === "vencimientos" ? "Horizonte" : "Período"}</span>
              <select name="dias" defaultValue={String(days ?? (key === "vencimientos" ? 30 : 90))} className="h-10 rounded-lg border border-input bg-white px-3">
                {PERIOD_OPTIONS.map((d) => <option key={d} value={d}>{key === "vencimientos" ? `Próximos ${d} días` : `Últimos ${d} días`}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Almacén</span>
            <select name="almacen" defaultValue={almacen} className="h-10 rounded-lg border border-input bg-white px-3">
              <option value="">Todos</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Aplicar</button>
        </form>

        {key === "abc" && <AbcSummary report={report} />}
        {report.summary.length > 0 && key !== "abc" && (
          <ul className="mt-4 flex flex-wrap gap-3 text-sm">
            {report.summary.map((s) => <li key={s.label} className="rounded-xl border px-3 py-2"><span className="text-muted-foreground">{s.label}:</span> <strong>{s.value}</strong></li>)}
          </ul>
        )}
      </section>

      {report.truncated && (
        <Alert variant="info">En pantalla se muestran las primeras {report.rows.length} filas. {canExport ? "La exportación incluye hasta 50 000 filas." : ""}</Alert>
      )}
      {report.rows.length === 0 ? (
        <EmptyState title="Sin datos para este reporte" description="Pruebe con otro período o almacén." />
      ) : (
        <Table data-testid="report-table">
          <caption className="sr-only">{report.title}</caption>
          <THead>
            <tr>{report.columns.map((c) => <th key={c.key} scope="col" className={isNumeric(c) ? "text-right" : ""}>{c.label}</th>)}</tr>
          </THead>
          <TBody>
            {report.rows.map((row, i) => (
              <tr key={i}>
                {report.columns.map((c) => (
                  <td key={c.key} className={isNumeric(c) ? "text-right tabular-nums" : c.key === "sku" || c.key === "lot" ? "font-mono text-xs" : ""}>
                    {c.key === "clase" && CLASS_STYLE[String(row[c.key])] ? (
                      <span className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${CLASS_STYLE[String(row[c.key])]}`}>{row[c.key]}</span>
                    ) : c.key === "daysLeft" && typeof row[c.key] === "number" && (row[c.key] as number) < 0 ? (
                      <span className="font-semibold text-destructive">Vencido</span>
                    ) : (
                      fmtCell(row[c.key], c)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">Generado {report.generatedAt.toLocaleString("es-VE", { timeZone: "America/Caracas" })} · RetailControl</p>
    </div>
  );
}

/** Barras 100 % apiladas: participación de cada clase en productos y en valor (con etiquetas, no solo color). */
function AbcSummary({ report }: { report: ReportResult }) {
  const counts = { A: 0, B: 0, C: 0 };
  const values = { A: 0, B: 0, C: 0 };
  for (const r of report.rows) {
    const c = r.clase as "A" | "B" | "C";
    if (c in counts) {
      counts[c]++;
      values[c] += Number(r.value ?? 0);
    }
  }
  const totalCount = counts.A + counts.B + counts.C;
  const totalValue = values.A + values.B + values.C;
  if (!totalCount) return null;
  const bar = (label: string, data: Record<"A" | "B" | "C", number>, total: number) => (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`${label}: ${(["A", "B", "C"] as const).map((k) => `clase ${k} ${Math.round((data[k] / total) * 100)} %`).join(", ")}`}>
        {(["A", "B", "C"] as const).map((k) => {
          const pct = (data[k] / total) * 100;
          return pct > 0 ? (
            <div key={k} className={`flex items-center justify-center text-xs font-semibold ${CLASS_STYLE[k]}`} style={{ width: `${pct}%` }}>
              {pct >= 8 ? `${k} ${Math.round(pct)} %` : ""}
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
      <div className="grid gap-3">
        {bar("Participación en el valor de las salidas", values, totalValue)}
        {bar("Participación en la cantidad de productos", counts, totalCount)}
      </div>
      <ul className="grid content-start gap-1 text-sm">
        {report.summary.map((s) => <li key={s.label}><span className="text-muted-foreground">{s.label}:</span> <strong>{s.value}</strong></li>)}
      </ul>
    </div>
  );
}
