import { Prisma, withTenant } from "@rc/db";
import { assertPermission } from "../../rbac";
import type { TenantActor } from "../types";
import { D, getInventoryPolicy, todayIn } from "./core";

type Decimal = Prisma.Decimal;

/** Filtro SQL de almacenes visibles según el alcance por sucursal del actor. */
function warehouseScope(actor: TenantActor, alias: string) {
  if (!actor.branchIds.length) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(alias)}.branch_id IN (${Prisma.join(actor.branchIds.map((b) => Prisma.sql`${b}::uuid`))})`;
}

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  lotTracking: boolean;
  onHand: string;
  reserved: string;
  available: string;
  minStock: string | null;
  avgCost: string;
  value: string;
  low: boolean;
}

/** Existencias por producto (todos los almacenes visibles o uno). */
export async function listStock(
  actor: TenantActor,
  opts: { warehouseId?: string; search?: string; lowOnly?: boolean; page?: number; pageSize?: number } = {},
) {
  assertPermission(actor, "inventory.read");
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const q = opts.search?.trim() ? `%${opts.search.trim()}%` : null;
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.$queryRaw<
      { product_id: string; sku: string; name: string; base_unit: string; lot_tracking: boolean; on_hand: Decimal; reserved: Decimal; min_stock: Decimal | null; avg_cost: Decimal; total: bigint }[]
    >`
      WITH s AS (
        SELECT b.product_id, SUM(b.on_hand) AS on_hand, SUM(b.reserved) AS reserved
        FROM stock_balances b JOIN warehouses w ON w.id = b.warehouse_id
        WHERE b.tenant_id = ${actor.tenantId}::uuid
          ${opts.warehouseId ? Prisma.sql`AND b.warehouse_id = ${opts.warehouseId}::uuid` : Prisma.empty}
          ${warehouseScope(actor, "w")}
        GROUP BY b.product_id
      )
      SELECT p.id AS product_id, p.sku, p.name, p.base_unit, p.lot_tracking,
             COALESCE(s.on_hand, 0) AS on_hand, COALESCE(s.reserved, 0) AS reserved, p.min_stock, p.avg_cost,
             COUNT(*) OVER () AS total
      FROM products p LEFT JOIN s ON s.product_id = p.id
      WHERE p.tenant_id = ${actor.tenantId}::uuid AND p.status = 'ACTIVE'
        ${q ? Prisma.sql`AND (p.sku ILIKE ${q} OR p.name ILIKE ${q})` : Prisma.empty}
        ${opts.lowOnly ? Prisma.sql`AND p.min_stock IS NOT NULL AND COALESCE(s.on_hand, 0) - COALESCE(s.reserved, 0) < p.min_stock` : Prisma.empty}
      ORDER BY p.sku
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    const items: StockRow[] = rows.map((r) => {
      const available = r.on_hand.minus(r.reserved);
      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        baseUnit: r.base_unit,
        lotTracking: r.lot_tracking,
        onHand: r.on_hand.toString(),
        reserved: r.reserved.toString(),
        available: available.toString(),
        minStock: r.min_stock?.toString() ?? null,
        avgCost: r.avg_cost.toString(),
        value: r.on_hand.times(r.avg_cost).toDecimalPlaces(2).toString(),
        low: r.min_stock !== null && available.lessThan(r.min_stock),
      };
    });
    return { items, total: Number(rows[0]?.total ?? 0), page, pageSize };
  });
}

/** Existencias de un producto por almacén y lote (incluye estado y vencimiento del lote). */
export async function getProductStock(actor: TenantActor, productId: string) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone);
    const rows = await tx.$queryRaw<
      { warehouse_id: string; warehouse: string; lot_id: string | null; lot_number: string | null; expires_at: Date | null; status: string | null; on_hand: Decimal; reserved: Decimal }[]
    >`
      SELECT b.warehouse_id, w.name AS warehouse, b.lot_id, l.lot_number, l.expires_at, l.status::text AS status, b.on_hand, b.reserved
      FROM stock_balances b
      JOIN warehouses w ON w.id = b.warehouse_id
      LEFT JOIN lots l ON l.id = b.lot_id
      WHERE b.tenant_id = ${actor.tenantId}::uuid AND b.product_id = ${productId}::uuid AND b.on_hand <> 0
        ${warehouseScope(actor, "w")}
      ORDER BY w.name, l.expires_at ASC NULLS LAST, l.lot_number`;
    return rows.map((r) => ({
      warehouseId: r.warehouse_id,
      warehouse: r.warehouse,
      lotId: r.lot_id,
      lotNumber: r.lot_number,
      expiresAt: r.expires_at?.toISOString().slice(0, 10) ?? null,
      expired: !!r.expires_at && r.expires_at.toISOString().slice(0, 10) < today,
      status: r.status,
      onHand: r.on_hand.toString(),
      available: r.on_hand.minus(r.reserved).toString(),
    }));
  });
}

/** Kardex: movimientos con saldo acumulado por almacén (orden cronológico). */
export async function listKardex(
  actor: TenantActor,
  opts: { productId: string; warehouseId?: string; page?: number; pageSize?: number },
) {
  assertPermission(actor, "inventory.read");
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string; operation_id: string; created_at: Date; type: string; warehouse: string; lot_number: string | null;
        quantity: Decimal; entered_quantity: Decimal; entered_unit: string; unit_cost: Decimal | null; reason: string | null;
        reference_type: string | null; actor_email: string | null; balance: Decimal; total: bigint; reversed: boolean;
      }[]
    >`
      SELECT * FROM (
        SELECT m.id, m.operation_id, m.created_at, m.type::text AS type, w.name AS warehouse, l.lot_number,
               m.quantity, m.entered_quantity, m.entered_unit, m.unit_cost, m.reason, m.reference_type, u.email AS actor_email,
               SUM(m.quantity) OVER (PARTITION BY m.warehouse_id ORDER BY m.created_at, m.id) AS balance,
               COUNT(*) OVER () AS total,
               EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = m.id) AS reversed
        FROM stock_movements m
        JOIN warehouses w ON w.id = m.warehouse_id
        LEFT JOIN lots l ON l.id = m.lot_id
        LEFT JOIN users u ON u.id = m.actor_user_id
        WHERE m.tenant_id = ${actor.tenantId}::uuid AND m.product_id = ${opts.productId}::uuid
          ${opts.warehouseId ? Prisma.sql`AND m.warehouse_id = ${opts.warehouseId}::uuid` : Prisma.empty}
          ${warehouseScope(actor, "w")}
      ) k
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return {
      items: rows.map((r) => ({
        id: r.id,
        operationId: r.operation_id,
        createdAt: r.created_at,
        type: r.type,
        warehouse: r.warehouse,
        lotNumber: r.lot_number,
        quantity: r.quantity.toString(),
        enteredQuantity: r.entered_quantity.toString(),
        enteredUnit: r.entered_unit,
        unitCost: r.unit_cost?.toString() ?? null,
        reason: r.reason,
        referenceType: r.reference_type,
        actorEmail: r.actor_email,
        balance: r.balance.toString(),
        reversed: r.reversed,
      })),
      total: Number(rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  });
}

/** Lotes con existencia que vencen dentro de `days` días (incluye ya vencidos). */
export async function listExpiringLots(actor: TenantActor, opts: { days?: number; warehouseId?: string } = {}) {
  assertPermission(actor, "inventory.read");
  const days = Math.min(Math.max(opts.days ?? 30, 0), 3650);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone);
    const rows = await tx.$queryRaw<
      { lot_id: string; lot_number: string; expires_at: Date; status: string; product_id: string; sku: string; name: string; base_unit: string; warehouse: string; warehouse_id: string; on_hand: Decimal; avg_cost: Decimal; days_left: number }[]
    >`
      SELECT l.id AS lot_id, l.lot_number, l.expires_at, l.status::text AS status, p.id AS product_id, p.sku, p.name, p.base_unit,
             w.name AS warehouse, w.id AS warehouse_id, b.on_hand, p.avg_cost,
             (l.expires_at - ${today}::date)::int AS days_left
      FROM stock_balances b
      JOIN lots l ON l.id = b.lot_id
      JOIN products p ON p.id = b.product_id
      JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.tenant_id = ${actor.tenantId}::uuid AND b.on_hand > 0 AND l.expires_at IS NOT NULL
        AND l.expires_at <= ${today}::date + ${days}::int
        ${opts.warehouseId ? Prisma.sql`AND b.warehouse_id = ${opts.warehouseId}::uuid` : Prisma.empty}
        ${warehouseScope(actor, "w")}
      ORDER BY l.expires_at, p.sku`;
    return rows.map((r) => ({
      lotId: r.lot_id,
      lotNumber: r.lot_number,
      expiresAt: r.expires_at.toISOString().slice(0, 10),
      daysLeft: r.days_left,
      expired: r.days_left < 0,
      status: r.status,
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      baseUnit: r.base_unit,
      warehouse: r.warehouse,
      warehouseId: r.warehouse_id,
      onHand: r.on_hand.toString(),
      value: r.on_hand.times(r.avg_cost).toDecimalPlaces(2).toString(),
    }));
  });
}

export async function getInventoryDashboard(actor: TenantActor) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone);
    const scope = warehouseScope(actor, "w");
    const [low] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM products p
      LEFT JOIN (
        SELECT b.product_id, SUM(b.on_hand - b.reserved) AS available FROM stock_balances b
        JOIN warehouses w ON w.id = b.warehouse_id WHERE b.tenant_id = ${actor.tenantId}::uuid ${scope} GROUP BY b.product_id
      ) s ON s.product_id = p.id
      WHERE p.tenant_id = ${actor.tenantId}::uuid AND p.status = 'ACTIVE' AND p.min_stock IS NOT NULL
        AND COALESCE(s.available, 0) < p.min_stock`;
    const [exp] = await tx.$queryRaw<{ n: bigint; value: Decimal | null; expired: bigint }[]>`
      SELECT COUNT(*) AS n, SUM(b.on_hand * p.avg_cost) AS value, COUNT(*) FILTER (WHERE l.expires_at < ${today}::date) AS expired
      FROM stock_balances b JOIN lots l ON l.id = b.lot_id JOIN products p ON p.id = b.product_id
      JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.tenant_id = ${actor.tenantId}::uuid AND b.on_hand > 0 AND l.expires_at <= ${today}::date + 30 ${scope}`;
    const [val] = await tx.$queryRaw<{ value: Decimal | null }[]>`
      SELECT SUM(b.on_hand * p.avg_cost) AS value FROM stock_balances b
      JOIN products p ON p.id = b.product_id JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.tenant_id = ${actor.tenantId}::uuid AND b.on_hand > 0 ${scope}`;
    const recent = await tx.$queryRaw<{ created_at: Date; type: string; sku: string; name: string; quantity: Decimal; base_unit: string; warehouse: string }[]>`
      SELECT m.created_at, m.type::text AS type, p.sku, p.name, m.quantity, p.base_unit, w.name AS warehouse
      FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id
      WHERE m.tenant_id = ${actor.tenantId}::uuid ${scope}
      ORDER BY m.created_at DESC, m.id DESC LIMIT 8`;
    const pending = await tx.stockAdjustment.count({ where: { tenantId: actor.tenantId, status: "PENDING" } });
    return {
      currency: policy.baseCurrency,
      lowStock: Number(low?.n ?? 0),
      expiring30: { lots: Number(exp?.n ?? 0), expired: Number(exp?.expired ?? 0), value: (exp?.value ?? D(0)).toDecimalPlaces(2).toString() },
      inventoryValue: (val?.value ?? D(0)).toDecimalPlaces(2).toString(),
      pendingAdjustments: pending,
      recent: recent.map((r) => ({ ...r, quantity: r.quantity.toString() })),
    };
  });
}
