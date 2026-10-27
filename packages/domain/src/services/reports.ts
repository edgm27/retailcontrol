import { Prisma, withTenant } from "@rc/db";
import { validation } from "../errors";
import { assertPermission } from "../rbac";
import { getInventoryPolicy, todayIn } from "./inventory/core";
import { warehouseFilter } from "./inventory/analytics";
import type { TenantActor } from "./types";

/*
 * Reportes de inventario. Todos devuelven el mismo formato tabular (columnas + filas)
 * para mostrarlos en pantalla y exportarlos (CSV/XLSX) sin duplicar consultas.
 * Siempre en el contexto RLS de la empresa del actor; montos a costo en moneda base.
 */

export type ColumnType = "text" | "int" | "number" | "money" | "percent" | "date";
export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}
export type ReportRow = Record<string, string | number | null>;
export interface ReportResult {
  key: ReportKey;
  title: string;
  description: string;
  currency: "USD" | "VES";
  generatedAt: Date;
  periodLabel: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: { label: string; value: string }[];
  truncated: boolean;
}

export const REPORTS = {
  abc: { title: "Reporte ABC", description: "Clasifica los productos según su participación en el valor de las salidas: A (hasta 80 %), B (hasta 95 %) y C (resto)." },
  existencias: { title: "Existencias valorizadas", description: "Existencia actual por producto y almacén, a costo promedio." },
  rotacion: { title: "Rotación y cobertura", description: "Salidas del período, consumo diario promedio y días de cobertura de la existencia actual." },
  mermas: { title: "Mermas", description: "Mermas registradas en el período por producto, con sus motivos." },
  vencimientos: { title: "Vencimientos", description: "Lotes con existencia vencidos o por vencer dentro del horizonte elegido." },
  movimientos: { title: "Movimientos (Kardex general)", description: "Todos los movimientos del período con cantidad, costo y referencia." },
} as const;
export type ReportKey = keyof typeof REPORTS;
export const REPORT_KEYS = Object.keys(REPORTS) as ReportKey[];

export interface ReportParams {
  days?: number;
  warehouseId?: string;
  /** Máximo de filas (pantalla: 500; exportación: 50 000). */
  limit?: number;
}

export const PERIOD_OPTIONS = [30, 90, 180, 365] as const;
const n = (d: Prisma.Decimal | number | bigint | null | undefined) =>
  d === null || d === undefined ? 0 : typeof d === "number" ? d : typeof d === "bigint" ? Number(d) : Number(d.toString());
const r2 = (v: number) => Math.round(v * 100) / 100;
const OUT_TYPES = Prisma.sql`('ISSUE', 'RETURN_OUT')`;

export function isReportKey(v: string): v is ReportKey {
  return (REPORT_KEYS as string[]).includes(v);
}

export async function runReport(actor: TenantActor, key: ReportKey, params: ReportParams = {}, now = new Date()): Promise<ReportResult> {
  assertPermission(actor, "reports.read");
  if (!isReportKey(key)) throw validation("Reporte no disponible.");
  const days = (PERIOD_OPTIONS as readonly number[]).includes(params.days ?? 0) ? params.days! : key === "vencimientos" ? 30 : 90;
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 50_000);

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const tz = policy.timezone;
    const today = todayIn(tz, now);
    const T = actor.tenantId;
    const wfB = warehouseFilter(actor, params.warehouseId, "b");
    const wfM = warehouseFilter(actor, params.warehouseId, "m");
    const start = Prisma.sql`(${today}::date - ${days - 1}::int)`;
    const mValue = Prisma.sql`ABS(m.quantity) * COALESCE(m.unit_cost, p.avg_cost)`;
    // Desde la medianoche local del inicio del período, en UTC: aprovecha el índice (tenant_id, created_at).
    const since = Prisma.sql`m.created_at >= ((${start})::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`;
    const base = { key, ...REPORTS[key], currency: policy.baseCurrency, generatedAt: now };
    const period = `Últimos ${days} días (hasta ${today})`;

    switch (key) {
      case "abc": {
        // Clasificación en SQL (ventanas): solo viajan a la app las filas que se muestran.
        const rows = await tx.$queryRaw<{
          rn: bigint; cls: string; sku: string; name: string; base_unit: string; qty: Prisma.Decimal | null; value: Prisma.Decimal;
          share: Prisma.Decimal | null; cum: Prisma.Decimal | null; stock: Prisma.Decimal | null; stock_value: Prisma.Decimal | null;
          total_rows: bigint; total_value: Prisma.Decimal | null;
          a_n: bigint; a_v: Prisma.Decimal | null; b_n: bigint; b_v: Prisma.Decimal | null; c_n: bigint; c_v: Prisma.Decimal | null; sm_n: bigint;
        }[]>`
          WITH outs AS (
            SELECT m.product_id, SUM(ABS(m.quantity)) AS qty, SUM(${mValue}) AS value
            FROM stock_movements m JOIN products p ON p.id = m.product_id
            WHERE m.tenant_id = ${T}::uuid AND m.type IN ${OUT_TYPES} AND ${since} ${wfM}
            GROUP BY m.product_id
          ),
          stock AS (
            SELECT b.product_id, SUM(b.on_hand) AS stock FROM stock_balances b
            WHERE b.tenant_id = ${T}::uuid ${wfB} GROUP BY b.product_id
          ),
          base AS (
            SELECT p.sku, p.name, p.base_unit, o.qty, COALESCE(o.value, 0) AS value, s.stock, s.stock * p.avg_cost AS stock_value
            FROM products p
            LEFT JOIN outs o ON o.product_id = p.id
            LEFT JOIN stock s ON s.product_id = p.id
            WHERE p.tenant_id = ${T}::uuid AND (o.value > 0 OR (s.stock > 0 AND p.status = 'ACTIVE'))
          ),
          ranked AS (
            SELECT *,
                   row_number() OVER (ORDER BY value DESC, stock DESC NULLS LAST, sku) AS rn,
                   SUM(value) OVER () AS total_value,
                   SUM(value) OVER (ORDER BY value DESC, stock DESC NULLS LAST, sku ROWS UNBOUNDED PRECEDING) AS cum_value
            FROM base
          ),
          classified AS (
            SELECT *,
                   -- Un producto pertenece a la clase donde EMPIEZA su aporte: el que cruza el 80 % sigue siendo A.
                   CASE WHEN value <= 0 OR total_value <= 0 THEN 'SM'
                        WHEN (cum_value - value) / total_value < 0.80 THEN 'A'
                        WHEN (cum_value - value) / total_value < 0.95 THEN 'B'
                        ELSE 'C' END AS cls
            FROM ranked
          ),
          totals AS (
            SELECT COUNT(*) AS total_rows,
                   COUNT(*) FILTER (WHERE cls = 'A') AS a_n, SUM(value) FILTER (WHERE cls = 'A') AS a_v,
                   COUNT(*) FILTER (WHERE cls = 'B') AS b_n, SUM(value) FILTER (WHERE cls = 'B') AS b_v,
                   COUNT(*) FILTER (WHERE cls = 'C') AS c_n, SUM(value) FILTER (WHERE cls = 'C') AS c_v,
                   COUNT(*) FILTER (WHERE cls = 'SM') AS sm_n
            FROM classified
          )
          SELECT c.rn, c.cls, c.sku, c.name, c.base_unit, c.qty, c.value,
                 CASE WHEN c.cls = 'SM' THEN NULL ELSE round(c.value / c.total_value * 100, 2) END AS share,
                 CASE WHEN c.cls = 'SM' THEN NULL ELSE round(LEAST(c.cum_value / c.total_value, 1) * 100, 2) END AS cum,
                 c.stock, c.stock_value, c.total_value, t.*
          FROM classified c CROSS JOIN totals t
          WHERE c.rn <= ${limit}
          ORDER BY c.rn`;
        const t = rows[0];
        const total = n(t?.total_value);
        const pct = (v: Prisma.Decimal | null | undefined) => (total > 0 ? `${((n(v) / total) * 100).toFixed(1).replace(".", ",")} %` : "—");
        const count = Number(t?.total_rows ?? 0) || 1;
        return {
          ...base,
          periodLabel: period,
          truncated: Number(t?.total_rows ?? 0) > rows.length,
          columns: [
            { key: "rank", label: "#", type: "int" },
            { key: "clase", label: "Clase", type: "text" },
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "qty", label: "Cant. salida", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "value", label: "Valor salidas", type: "money" },
            { key: "share", label: "% del valor", type: "percent" },
            { key: "cum", label: "% acumulado", type: "percent" },
            { key: "stock", label: "Existencia", type: "number" },
            { key: "stockValue", label: "Valor existencia", type: "money" },
          ],
          rows: rows.map((r) => ({
            rank: Number(r.rn),
            clase: r.cls === "SM" ? "Sin salidas" : r.cls,
            sku: r.sku,
            name: r.name,
            qty: r2(n(r.qty)),
            unit: r.base_unit,
            value: r2(n(r.value)),
            share: r.share === null ? null : n(r.share),
            cum: r.cum === null ? null : n(r.cum),
            stock: r2(n(r.stock)),
            stockValue: r2(n(r.stock_value)),
          })),
          summary: [
            { label: "Clase A", value: `${n(t?.a_n)} productos (${Math.round((n(t?.a_n) / count) * 100)} %) · ${pct(t?.a_v)} del valor` },
            { label: "Clase B", value: `${n(t?.b_n)} productos · ${pct(t?.b_v)} del valor` },
            { label: "Clase C", value: `${n(t?.c_n)} productos · ${pct(t?.c_v)} del valor` },
            { label: "Sin salidas en el período", value: `${n(t?.sm_n)} productos con existencia` },
          ],
        };
      }

      case "existencias": {
        const rows = await tx.$queryRaw<{ sku: string; name: string; base_unit: string; warehouse: string; on_hand: Prisma.Decimal; avg_cost: Prisma.Decimal; min_stock: Prisma.Decimal | null }[]>`
          SELECT p.sku, p.name, p.base_unit, w.name AS warehouse, SUM(b.on_hand) AS on_hand, p.avg_cost, p.min_stock
          FROM stock_balances b JOIN products p ON p.id = b.product_id JOIN warehouses w ON w.id = b.warehouse_id
          WHERE b.tenant_id = ${T}::uuid AND b.on_hand <> 0 ${wfB}
          GROUP BY p.id, p.sku, p.name, p.base_unit, p.avg_cost, p.min_stock, w.id, w.name
          ORDER BY p.sku, w.name
          LIMIT ${limit + 1}`;
        const total = rows.reduce((a, r) => a + n(r.on_hand) * n(r.avg_cost), 0);
        return {
          ...base,
          periodLabel: `Al ${today}`,
          truncated: rows.length > limit,
          columns: [
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "warehouse", label: "Almacén", type: "text" },
            { key: "onHand", label: "Existencia", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "minStock", label: "Mínimo", type: "number" },
            { key: "avgCost", label: "Costo prom.", type: "money" },
            { key: "value", label: "Valor", type: "money" },
          ],
          rows: rows.slice(0, limit).map((r) => ({
            sku: r.sku, name: r.name, warehouse: r.warehouse, onHand: n(r.on_hand), unit: r.base_unit,
            minStock: r.min_stock === null ? null : n(r.min_stock), avgCost: n(r.avg_cost), value: r2(n(r.on_hand) * n(r.avg_cost)),
          })),
          summary: [{ label: "Valor total", value: total.toFixed(2) }, { label: "Líneas", value: String(Math.min(rows.length, limit)) }],
        };
      }

      case "rotacion": {
        const rows = await tx.$queryRaw<{ sku: string; name: string; base_unit: string; qty: Prisma.Decimal | null; value: Prisma.Decimal | null; stock: Prisma.Decimal | null; avg_cost: Prisma.Decimal }[]>`
          WITH outs AS (
            SELECT m.product_id, SUM(ABS(m.quantity)) AS qty, SUM(${mValue}) AS value
            FROM stock_movements m JOIN products p ON p.id = m.product_id
            WHERE m.tenant_id = ${T}::uuid AND m.type IN ${OUT_TYPES} AND ${since} ${wfM}
            GROUP BY m.product_id
          ),
          stock AS (SELECT b.product_id, SUM(b.on_hand) AS stock FROM stock_balances b WHERE b.tenant_id = ${T}::uuid ${wfB} GROUP BY b.product_id)
          SELECT p.sku, p.name, p.base_unit, o.qty, o.value, s.stock, p.avg_cost
          FROM products p LEFT JOIN outs o ON o.product_id = p.id LEFT JOIN stock s ON s.product_id = p.id
          WHERE p.tenant_id = ${T}::uuid AND p.status = 'ACTIVE' AND (o.qty > 0 OR s.stock > 0)
          ORDER BY o.value DESC NULLS LAST, p.sku
          LIMIT ${limit + 1}`;
        return {
          ...base,
          periodLabel: period,
          truncated: rows.length > limit,
          columns: [
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "qty", label: "Salidas", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "daily", label: "Consumo diario", type: "number" },
            { key: "stock", label: "Existencia", type: "number" },
            { key: "coverage", label: "Cobertura (días)", type: "number" },
            { key: "turnover", label: "Rotación (veces)", type: "number" },
          ],
          rows: rows.slice(0, limit).map((r) => {
            const qty = n(r.qty);
            const stock = n(r.stock);
            const daily = qty / days;
            const stockValue = stock * n(r.avg_cost);
            return {
              sku: r.sku, name: r.name, qty: r2(qty), unit: r.base_unit, daily: Math.round(daily * 1000) / 1000, stock: r2(stock),
              coverage: daily > 0 ? Math.round((stock / daily) * 10) / 10 : null,
              turnover: stockValue > 0 ? r2(n(r.value) / stockValue) : null,
            };
          }),
          summary: [{ label: "Lectura", value: "Cobertura vacía = sin salidas en el período (producto sin rotación)." }],
        };
      }

      case "mermas": {
        const rows = await tx.$queryRaw<{ sku: string; name: string; base_unit: string; qty: Prisma.Decimal; value: Prisma.Decimal | null; events: bigint; reasons: string | null }[]>`
          SELECT p.sku, p.name, p.base_unit, SUM(ABS(m.quantity)) AS qty, SUM(${mValue}) AS value, COUNT(*) AS events,
                 string_agg(DISTINCT m.reason, ' · ') AS reasons
          FROM stock_movements m JOIN products p ON p.id = m.product_id
          WHERE m.tenant_id = ${T}::uuid AND m.type = 'WASTE' AND ${since} ${wfM}
          GROUP BY p.id, p.sku, p.name, p.base_unit
          ORDER BY value DESC NULLS LAST
          LIMIT ${limit + 1}`;
        const total = rows.reduce((a, r) => a + n(r.value), 0);
        return {
          ...base,
          periodLabel: period,
          truncated: rows.length > limit,
          columns: [
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "qty", label: "Cantidad", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "value", label: "Valor a costo", type: "money" },
            { key: "events", label: "Registros", type: "int" },
            { key: "reasons", label: "Motivos", type: "text" },
          ],
          rows: rows.slice(0, limit).map((r) => ({ sku: r.sku, name: r.name, qty: r2(n(r.qty)), unit: r.base_unit, value: r2(n(r.value)), events: n(r.events), reasons: r.reasons })),
          summary: [{ label: "Total mermas", value: total.toFixed(2) }],
        };
      }

      case "vencimientos": {
        const horizon = days;
        const rows = await tx.$queryRaw<{ sku: string; name: string; base_unit: string; lot_number: string; expires_at: Date; warehouse: string; on_hand: Prisma.Decimal; avg_cost: Prisma.Decimal; status: string }[]>`
          SELECT p.sku, p.name, p.base_unit, l.lot_number, l.expires_at, w.name AS warehouse, b.on_hand, p.avg_cost, l.status::text AS status
          FROM stock_balances b JOIN lots l ON l.id = b.lot_id JOIN products p ON p.id = b.product_id JOIN warehouses w ON w.id = b.warehouse_id
          WHERE b.tenant_id = ${T}::uuid AND b.on_hand > 0 AND l.expires_at IS NOT NULL AND l.expires_at <= ${today}::date + ${horizon}::int ${wfB}
          ORDER BY l.expires_at, p.sku
          LIMIT ${limit + 1}`;
        const todayMs = Date.parse(`${today}T00:00:00Z`);
        return {
          ...base,
          periodLabel: `Vencidos y por vencer en ${horizon} días (desde ${today})`,
          truncated: rows.length > limit,
          columns: [
            { key: "expiresAt", label: "Vence", type: "date" },
            { key: "daysLeft", label: "Días", type: "int" },
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "lot", label: "Lote", type: "text" },
            { key: "warehouse", label: "Almacén", type: "text" },
            { key: "onHand", label: "Existencia", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "value", label: "Valor", type: "money" },
          ],
          rows: rows.slice(0, limit).map((r) => {
            const exp = r.expires_at.toISOString().slice(0, 10);
            return {
              expiresAt: exp, daysLeft: Math.round((Date.parse(`${exp}T00:00:00Z`) - todayMs) / 86_400_000),
              sku: r.sku, name: r.name, lot: r.lot_number, warehouse: r.warehouse, onHand: n(r.on_hand), unit: r.base_unit,
              value: r2(n(r.on_hand) * n(r.avg_cost)),
            };
          }),
          summary: [],
        };
      }

      case "movimientos": {
        const rows = await tx.$queryRaw<{ created_at: Date; type: string; sku: string; name: string; warehouse: string; lot_number: string | null; quantity: Prisma.Decimal; base_unit: string; cost: Prisma.Decimal | null; reason: string | null; reference_type: string | null; actor: string | null }[]>`
          SELECT m.created_at, m.type::text AS type, p.sku, p.name, w.name AS warehouse, l.lot_number, m.quantity, p.base_unit,
                 COALESCE(m.unit_cost, p.avg_cost) AS cost, m.reason, m.reference_type, u.email AS actor
          FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
          LEFT JOIN lots l ON l.id = m.lot_id LEFT JOIN users u ON u.id = m.actor_user_id
          WHERE m.tenant_id = ${T}::uuid AND ${since} ${wfM}
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT ${limit + 1}`;
        const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
        return {
          ...base,
          periodLabel: period,
          truncated: rows.length > limit,
          columns: [
            { key: "date", label: "Fecha y hora", type: "text" },
            { key: "type", label: "Tipo", type: "text" },
            { key: "sku", label: "SKU", type: "text" },
            { key: "name", label: "Producto", type: "text" },
            { key: "warehouse", label: "Almacén", type: "text" },
            { key: "lot", label: "Lote", type: "text" },
            { key: "qty", label: "Cantidad", type: "number" },
            { key: "unit", label: "Unidad", type: "text" },
            { key: "cost", label: "Costo unit.", type: "money" },
            { key: "value", label: "Valor", type: "money" },
            { key: "reason", label: "Motivo", type: "text" },
            { key: "user", label: "Usuario", type: "text" },
          ],
          rows: rows.slice(0, limit).map((r) => ({
            date: fmt.format(r.created_at), type: MOVEMENT_TYPE_LABELS[r.type] ?? r.type, sku: r.sku, name: r.name, warehouse: r.warehouse,
            lot: r.lot_number, qty: n(r.quantity), unit: r.base_unit, cost: n(r.cost), value: r2(n(r.quantity) * n(r.cost)),
            reason: r.reason ?? r.reference_type, user: r.actor,
          })),
          summary: [],
        };
      }
    }
  });
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIPT: "Entrada", ISSUE: "Salida", RETURN_IN: "Devolución de cliente", RETURN_OUT: "Devolución a proveedor",
  ADJUSTMENT_IN: "Ajuste (+)", ADJUSTMENT_OUT: "Ajuste (−)", WASTE: "Merma", TRANSFER_OUT: "Transferencia (salida)",
  TRANSFER_IN: "Transferencia (entrada)", COUNT_ADJUSTMENT: "Ajuste por conteo", REVERSAL: "Reverso",
};
