import { Prisma, withTenant, type Tx } from "@rc/db";
import { assertPermission } from "../../rbac";
import type { TenantActor } from "../types";
import { getInventoryPolicy, todayIn } from "./core";

type Decimal = Prisma.Decimal;
const n = (d: Decimal | null | undefined) => (d ? Number(d.toDecimalPlaces(2)) : 0);

export function warehouseFilter(actor: TenantActor, warehouseId: string | undefined, alias: string) {
  const parts: Prisma.Sql[] = [];
  if (warehouseId) parts.push(Prisma.sql`AND ${Prisma.raw(alias)}.warehouse_id = ${warehouseId}::uuid`);
  if (actor.branchIds.length) {
    parts.push(
      Prisma.sql`AND ${Prisma.raw(alias)}.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${Prisma.join(actor.branchIds.map((b) => Prisma.sql`${b}::uuid`))}))`,
    );
  }
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

export interface DashboardAnalytics {
  currency: "USD" | "VES";
  periodDays: number;
  today: string;
  kpis: {
    inventoryValue: number;
    activeProducts: number;
    productsWithStock: number;
    lowStock: number;
    expiringLots: number;
    expiringValue: number;
    expiredValue: number;
    inbound: { value: number; previous: number };
    outbound: { value: number; previous: number };
    waste: { value: number; previous: number };
    purchases: { value: number; previous: number; receipts: number };
    pendingAdjustments: number;
    openPurchaseOrders: number;
    /** Días de inventario al ritmo de salidas del período (null si no hubo salidas). */
    coverageDays: number | null;
    /** Rotación del período = salidas a costo / valor promedio del inventario. */
    turnover: number | null;
  };
  /** Serie diaria: valor de entradas, salidas y valor estimado del inventario al cierre de cada día. */
  daily: { date: string; inbound: number; outbound: number; inventory: number }[];
  topProducts: { sku: string; name: string; value: number }[];
  byWarehouse: { name: string; value: number }[];
  expiryBuckets: { key: string; label: string; lots: number; value: number }[];
  purchasesBySupplier: { name: string; value: number }[];
  recent: { createdAt: Date; type: string; sku: string; name: string; quantity: string; baseUnit: string; warehouse: string }[];
}

const OUT_TYPES = Prisma.sql`('ISSUE', 'RETURN_OUT')`;
const IN_TYPES = Prisma.sql`('RECEIPT', 'RETURN_IN')`;

/**
 * Indicadores del tablero de inicio. Todos los importes en la moneda base, a costo
 * (no a precio de venta). El valor histórico del inventario se reconstruye desde el
 * libro: valor actual − movimientos posteriores valorizados a su costo registrado.
 */
export async function getDashboardAnalytics(
  actor: TenantActor,
  opts: { days?: number; warehouseId?: string } = {},
): Promise<DashboardAnalytics> {
  assertPermission(actor, "inventory.read");
  const days = [7, 30, 90].includes(opts.days ?? 30) ? (opts.days ?? 30) : 30;
  // Las consultas son independientes: se ejecutan en paralelo, cada una en su propia transacción
  // con el contexto RLS de la empresa (una sola transacción las serializaría en una conexión).
  const run = <R>(fn: (tx: Tx) => Promise<R>) => withTenant(actor.tenantId, actor.userId, fn);
  const policy = await run((tx) => getInventoryPolicy(tx, actor.tenantId));
  {
    const tz = policy.timezone;
    const today = todayIn(tz);
    const T = actor.tenantId;
    const wfB = warehouseFilter(actor, opts.warehouseId, "b");
    const wfM = warehouseFilter(actor, opts.warehouseId, "m");
    const wfG = warehouseFilter(actor, opts.warehouseId, "g");
    const start = Prisma.sql`(${today}::date - ${days - 1}::int)`;
    const prevStart = Prisma.sql`(${today}::date - ${2 * days - 1}::int)`;
    // Las fechas se guardan como timestamp en UTC (sin zona): primero se marca como UTC y luego se lleva a la zona de la empresa.
    const localDate = Prisma.sql`((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date`;
    const receivedLocal = Prisma.sql`((g.received_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date`;
    const mValue = Prisma.sql`ABS(m.quantity) * COALESCE(m.unit_cost, p.avg_cost)`;
    // Medianoche local de una fecha, expresada en UTC (created_at se guarda en UTC sin zona): permite usar índices.
    const since = (d: Prisma.Sql) => Prisma.sql`((${d})::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`;

    const stockP = run((tx) => tx.$queryRaw<{ value: Decimal | null; with_stock: bigint }[]>`
      SELECT SUM(b.on_hand * p.avg_cost) AS value, COUNT(DISTINCT b.product_id) FILTER (WHERE b.on_hand > 0) AS with_stock
      FROM stock_balances b JOIN products p ON p.id = b.product_id
      WHERE b.tenant_id = ${T}::uuid AND b.on_hand > 0 ${wfB}`);
    const countsP = run((tx) => tx.$queryRaw<{ active: bigint; low: bigint }[]>`
      SELECT COUNT(*) AS active,
             COUNT(*) FILTER (WHERE p.min_stock IS NOT NULL AND COALESCE(s.available, 0) < p.min_stock) AS low
      FROM products p
      LEFT JOIN (SELECT b.product_id, SUM(b.on_hand - b.reserved) AS available FROM stock_balances b
                 WHERE b.tenant_id = ${T}::uuid ${wfB} GROUP BY b.product_id) s ON s.product_id = p.id
      WHERE p.tenant_id = ${T}::uuid AND p.status = 'ACTIVE'`);

    const flowsP = run((tx) => tx.$queryRaw<{ bucket: string; kind: string; value: Decimal | null }[]>`
      SELECT CASE WHEN ${localDate} >= ${start} THEN 'cur' ELSE 'prev' END AS bucket,
             CASE WHEN m.type IN ${IN_TYPES} THEN 'in' WHEN m.type IN ${OUT_TYPES} THEN 'out' WHEN m.type = 'WASTE' THEN 'waste' ELSE 'other' END AS kind,
             SUM(${mValue}) AS value
      FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE m.tenant_id = ${T}::uuid AND m.created_at >= ${since(prevStart)} ${wfM}
      GROUP BY 1, 2`);

    const purchasesP = run((tx) => tx.$queryRaw<{ bucket: string; value: Decimal | null; receipts: bigint }[]>`
      SELECT CASE WHEN ${receivedLocal} >= ${start} THEN 'cur' ELSE 'prev' END AS bucket,
             SUM(g.total_base) AS value, COUNT(*) AS receipts
      FROM goods_receipts g
      WHERE g.tenant_id = ${T}::uuid AND g.received_at >= ${since(prevStart)} ${wfG}
      GROUP BY 1`);

    const bucketsP = run((tx) => tx.$queryRaw<{ key: string; lots: bigint; value: Decimal | null }[]>`
      SELECT CASE
               WHEN l.expires_at < ${today}::date THEN 'expired'
               WHEN l.expires_at <= ${today}::date + 7 THEN 'd7'
               WHEN l.expires_at <= ${today}::date + 15 THEN 'd15'
               WHEN l.expires_at <= ${today}::date + 30 THEN 'd30'
               WHEN l.expires_at <= ${today}::date + 60 THEN 'd60'
               ELSE 'd90' END AS key,
             COUNT(DISTINCT l.id) AS lots, SUM(b.on_hand * p.avg_cost) AS value
      FROM stock_balances b JOIN lots l ON l.id = b.lot_id JOIN products p ON p.id = b.product_id
      WHERE b.tenant_id = ${T}::uuid AND b.on_hand > 0 AND l.expires_at IS NOT NULL AND l.expires_at <= ${today}::date + 90 ${wfB}
      GROUP BY 1`);

    const dailyP = run((tx) => tx.$queryRaw<{ d: Date; inbound: Decimal | null; outbound: Decimal | null; delta: Decimal | null }[]>`
      WITH days AS (SELECT generate_series(${start}, ${today}::date, interval '1 day')::date AS d),
      mv AS (
        SELECT ${localDate} AS d,
               SUM(CASE WHEN m.type IN ${IN_TYPES} THEN ${mValue} ELSE 0 END) AS inbound,
               SUM(CASE WHEN m.type IN ${OUT_TYPES} THEN ${mValue} ELSE 0 END) AS outbound,
               SUM(m.quantity * COALESCE(m.unit_cost, p.avg_cost)) AS delta
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE m.tenant_id = ${T}::uuid AND m.created_at >= ${since(start)} ${wfM}
        GROUP BY 1
      )
      SELECT days.d, mv.inbound, mv.outbound, mv.delta FROM days LEFT JOIN mv ON mv.d = days.d ORDER BY days.d`);

    const topProductsP = run((tx) => tx.$queryRaw<{ sku: string; name: string; value: Decimal }[]>`
      SELECT p.sku, p.name, SUM(b.on_hand * p.avg_cost) AS value
      FROM stock_balances b JOIN products p ON p.id = b.product_id
      WHERE b.tenant_id = ${T}::uuid AND b.on_hand > 0 ${wfB}
      GROUP BY p.id HAVING SUM(b.on_hand * p.avg_cost) > 0 ORDER BY value DESC LIMIT 8`);
    const byWarehouseP = run((tx) => tx.$queryRaw<{ name: string; value: Decimal }[]>`
      SELECT w.name, SUM(b.on_hand * p.avg_cost) AS value
      FROM stock_balances b JOIN products p ON p.id = b.product_id JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.tenant_id = ${T}::uuid AND b.on_hand > 0 ${wfB}
      GROUP BY w.id, w.name ORDER BY value DESC LIMIT 8`);
    const bySupplierP = run((tx) => tx.$queryRaw<{ name: string; value: Decimal }[]>`
      SELECT s.name, SUM(g.total_base) AS value
      FROM goods_receipts g JOIN suppliers s ON s.id = g.supplier_id
      WHERE g.tenant_id = ${T}::uuid AND g.received_at >= ${since(start)} ${wfG}
      GROUP BY s.id, s.name ORDER BY value DESC LIMIT 6`);
    const recentP = run((tx) => tx.$queryRaw<{ created_at: Date; type: string; sku: string; name: string; quantity: Decimal; base_unit: string; warehouse: string }[]>`
      SELECT m.created_at, m.type::text AS type, p.sku, p.name, m.quantity, p.base_unit, w.name AS warehouse
      FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
      WHERE m.tenant_id = ${T}::uuid ${wfM}
      ORDER BY m.created_at DESC, m.id DESC LIMIT 8`);
    const pendingAdjustmentsP = run((tx) => tx.stockAdjustment.count({ where: { tenantId: T, status: "PENDING" } }));
    const openPurchaseOrdersP = run((tx) => tx.purchaseOrder.count({ where: { tenantId: T, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } } }));

    const [[stock], [counts], flows, purchases, buckets, daily, topProducts, byWarehouse, bySupplier, recent, pendingAdjustments, openPurchaseOrders] = await Promise.all([
      stockP,
      countsP,
      flowsP,
      purchasesP,
      bucketsP,
      dailyP,
      topProductsP,
      byWarehouseP,
      bySupplierP,
      recentP,
      pendingAdjustmentsP,
      openPurchaseOrdersP,
    ]);
    const flow = (bucket: string, kind: string) => n(flows.find((f) => f.bucket === bucket && f.kind === kind)?.value);
    const pur = (b: string) => purchases.find((x) => x.bucket === b);
    const BUCKETS = [
      ["expired", "Vencidos"],
      ["d7", "0–7 días"],
      ["d15", "8–15"],
      ["d30", "16–30"],
      ["d60", "31–60"],
      ["d90", "61–90"],
    ] as const;
    const expiryBuckets = BUCKETS.map(([key, label]) => {
      const r = buckets.find((b) => b.key === key);
      return { key, label, lots: Number(r?.lots ?? 0), value: n(r?.value) };
    });
    // Valor al cierre de cada día: se recorre hacia atrás desde el valor actual.
    const currentValue = n(stock?.value);
    let running = currentValue;
    const closing: number[] = new Array(daily.length);
    for (let i = daily.length - 1; i >= 0; i--) {
      closing[i] = Math.max(0, Math.round(running * 100) / 100);
      running -= n(daily[i]!.delta);
    }

    const outCur = flow("cur", "out");
    const avgInventory = closing.length ? closing.reduce((a, v) => a + v, 0) / closing.length : 0;
    const expiredValue = expiryBuckets.find((b) => b.key === "expired")!.value;
    const within30 = expiryBuckets.filter((b) => ["d7", "d15", "d30"].includes(b.key));

    return {
      currency: policy.baseCurrency,
      periodDays: days,
      today,
      kpis: {
        inventoryValue: currentValue,
        activeProducts: Number(counts?.active ?? 0),
        productsWithStock: Number(stock?.with_stock ?? 0),
        lowStock: Number(counts?.low ?? 0),
        expiringLots: within30.reduce((a, b) => a + b.lots, 0),
        expiringValue: Math.round(within30.reduce((a, b) => a + b.value, 0) * 100) / 100,
        expiredValue,
        inbound: { value: flow("cur", "in"), previous: flow("prev", "in") },
        outbound: { value: outCur, previous: flow("prev", "out") },
        waste: { value: flow("cur", "waste"), previous: flow("prev", "waste") },
        purchases: { value: n(pur("cur")?.value), previous: n(pur("prev")?.value), receipts: Number(pur("cur")?.receipts ?? 0) },
        pendingAdjustments,
        openPurchaseOrders,
        coverageDays: outCur > 0 ? Math.round((currentValue / (outCur / days)) * 10) / 10 : null,
        turnover: outCur > 0 && avgInventory > 0 ? Math.round((outCur / avgInventory) * 100) / 100 : null,
      },
      daily: daily.map((r, i) => ({ date: r.d.toISOString().slice(0, 10), inbound: n(r.inbound), outbound: n(r.outbound), inventory: closing[i]! })),
      topProducts: topProducts.map((r) => ({ sku: r.sku, name: r.name, value: n(r.value) })),
      byWarehouse: byWarehouse.map((r) => ({ name: r.name, value: n(r.value) })),
      expiryBuckets,
      purchasesBySupplier: bySupplier.map((r) => ({ name: r.name, value: n(r.value) })),
      recent: recent.map((r) => ({ createdAt: r.created_at, type: r.type, sku: r.sku, name: r.name, quantity: r.quantity.toString(), baseUnit: r.base_unit, warehouse: r.warehouse })),
    };
  }
}
