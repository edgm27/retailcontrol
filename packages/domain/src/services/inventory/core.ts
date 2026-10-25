import { randomUUID } from "node:crypto";
import { Prisma, type Tx } from "@rc/db";
import { insufficientStock, notFound, validation } from "../../errors";
import { assertPermission, type Permission } from "../../rbac";
import type { TenantActor } from "../types";

type Decimal = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export interface InventoryPolicy {
  allowNegativeStock: boolean;
  approvalThreshold: Decimal;
  timezone: string;
  baseCurrency: "USD" | "VES";
}

export async function getInventoryPolicy(tx: Tx, tenantId: string): Promise<InventoryPolicy> {
  const s = await tx.tenantSettings.findUnique({ where: { tenantId } });
  return {
    allowNegativeStock: s?.allowNegativeStock ?? false,
    approvalThreshold: s?.adjustmentApprovalThreshold ?? D(100),
    timezone: s?.timezone ?? "America/Caracas",
    baseCurrency: (s?.baseCurrency ?? "USD") as "USD" | "VES",
  };
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de la empresa. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Un lote vence al FINAL del día indicado (zona de la empresa): vencido si expiresAt < hoy. */
export function isExpired(expiresAt: Date | null, today: string): boolean {
  return !!expiresAt && expiresAt.toISOString().slice(0, 10) < today;
}

/** Almacén activo de la empresa + verificación de permiso en su sucursal. */
export async function loadWarehouseFor(tx: Tx, actor: TenantActor, warehouseId: string, permission: Permission) {
  const wh = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId: actor.tenantId } });
  if (!wh) throw notFound("Almacén no encontrado.");
  if (!wh.active) throw validation("El almacén está inactivo.");
  assertPermission(actor, permission, { branchId: wh.branchId });
  return wh;
}

export async function loadProduct(tx: Tx, tenantId: string, productId: string, opts: { lock?: boolean } = {}) {
  if (opts.lock) {
    // Serializa operaciones del mismo producto (costo promedio, FEFO).
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`;
  }
  const p = await tx.product.findFirst({ where: { id: productId, tenantId }, include: { units: true } });
  if (!p) throw notFound("Producto no encontrado.");
  return p;
}

export type LoadedProduct = Awaited<ReturnType<typeof loadProduct>>;

export function packagingOf(p: LoadedProduct) {
  return p.units.map((u) => ({ code: u.code, factorToBase: u.factorToBase }));
}

/**
 * Aplica una variación al saldo (almacén, producto, lote).
 * - Entradas: INSERT … ON CONFLICT DO UPDATE (atómico).
 * - Salidas: UPDATE condicional `disponible + delta >= 0`. Con dos salidas
 *   simultáneas, la segunda espera el bloqueo de fila y re-evalúa la
 *   condición con el saldo ya descontado: nunca queda negativo indebidamente.
 */
export async function applyBalanceDelta(
  tx: Tx,
  args: { tenantId: string; warehouseId: string; productId: string; lotId: string | null; delta: Decimal; allowNegative: boolean },
): Promise<Decimal> {
  const lotKey = args.lotId ?? ZERO_UUID;
  const delta = args.delta.toString();
  if (args.delta.greaterThan(0)) {
    const rows = await tx.$queryRaw<{ on_hand: Decimal }[]>`
      INSERT INTO stock_balances (id, tenant_id, warehouse_id, product_id, lot_id, lot_key, on_hand, updated_at)
      VALUES (gen_random_uuid(), ${args.tenantId}::uuid, ${args.warehouseId}::uuid, ${args.productId}::uuid,
              ${args.lotId}::uuid, ${lotKey}::uuid, ${delta}::numeric, now())
      ON CONFLICT (tenant_id, warehouse_id, product_id, lot_key)
      DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now()
      RETURNING on_hand`;
    return rows[0]!.on_hand;
  }
  const rows = await tx.$queryRaw<{ on_hand: Decimal }[]>`
    UPDATE stock_balances
    SET on_hand = on_hand + ${delta}::numeric, updated_at = now()
    WHERE tenant_id = ${args.tenantId}::uuid AND warehouse_id = ${args.warehouseId}::uuid
      AND product_id = ${args.productId}::uuid AND lot_key = ${lotKey}::uuid
      AND (on_hand - reserved + ${delta}::numeric >= 0 OR ${args.allowNegative})
    RETURNING on_hand`;
  if (rows.length) return rows[0]!.on_hand;
  if (args.allowNegative) {
    const ins = await tx.$queryRaw<{ on_hand: Decimal }[]>`
      INSERT INTO stock_balances (id, tenant_id, warehouse_id, product_id, lot_id, lot_key, on_hand, updated_at)
      VALUES (gen_random_uuid(), ${args.tenantId}::uuid, ${args.warehouseId}::uuid, ${args.productId}::uuid,
              ${args.lotId}::uuid, ${lotKey}::uuid, ${delta}::numeric, now())
      RETURNING on_hand`;
    return ins[0]!.on_hand;
  }
  const available = await currentAvailable(tx, args.tenantId, args.warehouseId, args.productId, args.lotId);
  throw insufficientStock(
    `Existencia insuficiente: disponible ${available.toString()}, se requieren ${args.delta.abs().toString()}.`,
    { available: available.toString(), required: args.delta.abs().toString() },
  );
}

export async function currentAvailable(tx: Tx, tenantId: string, warehouseId: string, productId: string, lotId: string | null) {
  const rows = await tx.$queryRaw<{ available: Decimal }[]>`
    SELECT on_hand - reserved AS available FROM stock_balances
    WHERE tenant_id = ${tenantId}::uuid AND warehouse_id = ${warehouseId}::uuid
      AND product_id = ${productId}::uuid AND lot_key = ${lotId ?? ZERO_UUID}::uuid`;
  return rows[0]?.available ?? D(0);
}

export interface Allocation {
  lotId: string;
  quantity: Decimal;
}

/**
 * FEFO: toma primero el lote elegible que vence antes. Desempate determinista:
 * fecha de recepción y luego id. Lotes sin vencimiento van al final (FIFO por
 * recepción). Excluye lotes vencidos y en cuarentena/dañados/retirados.
 * Los saldos elegidos quedan bloqueados (FOR UPDATE) hasta el fin de la transacción.
 */
export async function allocateFefo(
  tx: Tx,
  args: { tenantId: string; warehouseId: string; productId: string; quantity: Decimal; today: string },
): Promise<Allocation[]> {
  const rows = await tx.$queryRaw<{ lot_id: string; available: Decimal }[]>`
    SELECT b.lot_id, (b.on_hand - b.reserved) AS available
    FROM stock_balances b
    JOIN lots l ON l.id = b.lot_id AND l.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${args.tenantId}::uuid AND b.warehouse_id = ${args.warehouseId}::uuid
      AND b.product_id = ${args.productId}::uuid
      AND b.on_hand - b.reserved > 0
      AND l.status = 'AVAILABLE'
      AND (l.expires_at IS NULL OR l.expires_at >= ${args.today}::date)
    ORDER BY l.expires_at ASC NULLS LAST, l.received_at ASC, l.id ASC
    FOR UPDATE OF b`;
  const out: Allocation[] = [];
  let remaining = args.quantity;
  for (const r of rows) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const take = Prisma.Decimal.min(remaining, r.available);
    out.push({ lotId: r.lot_id, quantity: take });
    remaining = remaining.minus(take);
  }
  if (remaining.greaterThan(0)) {
    const total = rows.reduce((a, r) => a.plus(r.available), D(0));
    throw insufficientStock(
      `Existencia insuficiente en lotes despachables: disponible ${total.toString()}, se requieren ${args.quantity.toString()}.`,
      { available: total.toString(), required: args.quantity.toString() },
    );
  }
  return out;
}

/** Verifica que un lote pueda despacharse (no vencido, no bloqueado). */
export async function assertLotDispatchable(tx: Tx, tenantId: string, productId: string, lotId: string, today: string) {
  const lot = await tx.lot.findFirst({ where: { id: lotId, tenantId, productId } });
  if (!lot) throw notFound("Lote no encontrado para este producto.");
  const LABELS: Record<string, string> = {
    QUARANTINE: "en cuarentena",
    DAMAGED: "dañado",
    RECALLED: "retirado",
    EXPIRED: "vencido",
    DEPLETED: "agotado",
  };
  if (lot.status !== "AVAILABLE") throw validation(`El lote ${lot.lotNumber} está ${LABELS[lot.status]} y no puede despacharse.`);
  if (isExpired(lot.expiresAt, today)) throw validation(`El lote ${lot.lotNumber} está vencido y no puede despacharse.`);
  return lot;
}

export interface MovementInsert {
  tenantId: string;
  operationId: string;
  type: Prisma.StockMovementCreateManyInput["type"];
  warehouseId: string;
  productId: string;
  lotId: string | null;
  quantity: Decimal;
  enteredQuantity: Decimal;
  enteredUnit: string;
  unitCost: Decimal | null;
  currency: "USD" | "VES" | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reversesMovementId?: string | null;
  actorUserId: string;
}

export async function insertMovement(tx: Tx, m: MovementInsert) {
  return tx.stockMovement.create({
    data: {
      tenantId: m.tenantId,
      operationId: m.operationId,
      type: m.type,
      warehouseId: m.warehouseId,
      productId: m.productId,
      lotId: m.lotId,
      quantity: m.quantity,
      enteredQuantity: m.enteredQuantity,
      enteredUnit: m.enteredUnit,
      unitCost: m.unitCost,
      currency: m.currency,
      reason: m.reason ?? null,
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      reversesMovementId: m.reversesMovementId ?? null,
      actorUserId: m.actorUserId,
    },
  });
}

/** Total en mano del producto en todos los almacenes (para costo promedio). */
export async function totalOnHand(tx: Tx, tenantId: string, productId: string): Promise<Decimal> {
  const rows = await tx.$queryRaw<{ total: Decimal | null }[]>`
    SELECT SUM(on_hand) AS total FROM stock_balances WHERE tenant_id = ${tenantId}::uuid AND product_id = ${productId}::uuid`;
  return rows[0]?.total ?? D(0);
}

/** Costo promedio ponderado tras una entrada valorizada. */
export function weightedAverage(prevQty: Decimal, prevAvg: Decimal, inQty: Decimal, inCost: Decimal): Decimal {
  const q = prevQty.greaterThan(0) ? prevQty : D(0);
  const total = q.plus(inQty);
  if (total.lessThanOrEqualTo(0)) return inCost;
  return q.times(prevAvg).plus(inQty.times(inCost)).dividedBy(total).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

export const newOperationId = () => randomUUID();
