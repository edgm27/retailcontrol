import { withTenant, type Tx } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { parseQuantity, toBaseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";
import {
  D,
  allocateFefo,
  applyBalanceDelta,
  assertLotDispatchable,
  getInventoryPolicy,
  insertMovement,
  isExpired,
  loadProduct,
  loadWarehouseFor,
  newOperationId,
  packagingOf,
  todayIn,
  totalOnHand,
  weightedAverage,
} from "./core";
import { claimIdempotencyKey, storeIdempotencyResult } from "./idempotency";

export const OPERATIONAL_TYPES = ["RECEIPT", "ISSUE", "RETURN_IN", "RETURN_OUT"] as const;
export type OperationalType = (typeof OPERATIONAL_TYPES)[number];
const INBOUND = new Set<OperationalType>(["RECEIPT", "RETURN_IN"]);

const dateStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const movementInputSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  type: z.enum(OPERATIONAL_TYPES),
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string().trim().min(1).max(16),
  lotId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  lotNumber: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  expiresAt: dateStr,
  manufacturedAt: dateStr,
  unitCost: z.union([z.string(), z.number()]).optional().or(z.literal("").transform(() => undefined)),
  reason: z.string().trim().max(300).optional(),
  referenceType: z.string().trim().max(40).optional(),
  referenceId: z.string().trim().max(80).optional(),
});
export type MovementInput = z.input<typeof movementInputSchema>;

/**
 * Entrada valorizada al almacén (usada por movimientos y recepciones de compra):
 * actualiza costo promedio, saldo e inserta el movimiento. Debe llamarse con el
 * producto ya bloqueado (loadProduct(..., { lock: true })).
 */
export async function receiveIntoStock(
  tx: Tx,
  args: {
    actor: TenantActor;
    product: Awaited<ReturnType<typeof loadProduct>>;
    warehouseId: string;
    lotId: string | null;
    baseQty: ReturnType<typeof D>;
    enteredQty: ReturnType<typeof D>;
    enteredUnit: string;
    /** Costo por unidad BASE en moneda base; null = no valoriza (usa el promedio actual). */
    unitCostBase: ReturnType<typeof D> | null;
    baseCurrency: "USD" | "VES";
    operationId: string;
    type: "RECEIPT" | "RETURN_IN";
    reason?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
  },
) {
  const { actor, product } = args;
  let unitCost = product.avgCost;
  if (args.unitCostBase) {
    const prevQty = await totalOnHand(tx, actor.tenantId, product.id);
    const avg = weightedAverage(prevQty, product.avgCost, args.baseQty, args.unitCostBase);
    await tx.product.update({ where: { id: product.id }, data: { avgCost: avg } });
    product.avgCost = avg;
    unitCost = args.unitCostBase.toDecimalPlaces(6);
  }
  await applyBalanceDelta(tx, { tenantId: actor.tenantId, warehouseId: args.warehouseId, productId: product.id, lotId: args.lotId, delta: args.baseQty, allowNegative: false });
  return insertMovement(tx, {
    tenantId: actor.tenantId,
    operationId: args.operationId,
    type: args.type,
    warehouseId: args.warehouseId,
    productId: product.id,
    lotId: args.lotId,
    quantity: args.baseQty,
    enteredQuantity: args.enteredQty,
    enteredUnit: args.enteredUnit,
    unitCost,
    currency: args.baseCurrency,
    reason: args.reason ?? null,
    referenceType: args.referenceType ?? null,
    referenceId: args.referenceId ?? null,
    actorUserId: actor.userId,
  });
}

export interface MovementResult {
  operationId: string;
  movements: { id: string; lotId: string | null; quantity: string }[];
  replayed?: boolean;
}

/** Resuelve (o crea, en entradas) el lote de una línea. */
export async function resolveInboundLot(
  tx: Tx,
  actor: TenantActor,
  product: Awaited<ReturnType<typeof loadProduct>>,
  input: z.output<typeof movementInputSchema>,
  today: string,
): Promise<string | null> {
  if (!product.lotTracking) {
    if (input.lotId || input.lotNumber) throw validation("Este producto no maneja lotes.");
    return null;
  }
  if (input.lotId) {
    const lot = await tx.lot.findFirst({ where: { id: input.lotId, tenantId: actor.tenantId, productId: product.id } });
    if (!lot) throw notFound("Lote no encontrado para este producto.");
    return lot.id;
  }
  if (!input.lotNumber) throw validation("Indique el número de lote: este producto exige trazabilidad por lote.");
  if (product.requiresExpiry && !input.expiresAt) throw validation("Indique la fecha de vencimiento del lote.");
  const expires = input.expiresAt ? new Date(`${input.expiresAt}T00:00:00Z`) : null;
  if (expires && isExpired(expires, today)) throw validation("No se puede recibir un lote ya vencido.");

  const existing = await tx.lot.findUnique({
    where: { tenantId_productId_lotNumber: { tenantId: actor.tenantId, productId: product.id, lotNumber: input.lotNumber } },
  });
  if (existing) {
    const prev = existing.expiresAt?.toISOString().slice(0, 10);
    if (input.expiresAt && prev && prev !== input.expiresAt) {
      throw conflict(`El lote ${input.lotNumber} ya existe con vencimiento ${prev}.`);
    }
    return existing.id;
  }
  if (input.type === "RETURN_IN") throw validation("Una devolución debe referirse a un lote existente.");
  const created = await tx.lot.create({
    data: {
      tenantId: actor.tenantId,
      productId: product.id,
      lotNumber: input.lotNumber,
      expiresAt: expires,
      manufacturedAt: input.manufacturedAt ? new Date(`${input.manufacturedAt}T00:00:00Z`) : null,
    },
  });
  await recordAudit(tx, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "lot.created",
    entityType: "Lot",
    entityId: created.id,
    after: { productId: product.id, lotNumber: created.lotNumber, expiresAt: input.expiresAt ?? null },
    meta: actor.meta,
  });
  return created.id;
}

/**
 * Registra una entrada o salida operativa. Atómica, idempotente y auditada.
 * Salidas de productos con lote sin lote indicado → asignación FEFO.
 */
export async function postStockMovement(actor: TenantActor, raw: MovementInput, now = new Date()): Promise<MovementResult> {
  const input = movementInputSchema.parse(raw);
  assertPermission(actor, "inventory.move");
  const qty = parseQuantity(input.quantity);
  if (qty.lessThanOrEqualTo(0)) throw validation("La cantidad debe ser mayor que cero.");
  const cost = input.unitCost !== undefined ? parseQuantity(input.unitCost) : null;
  if (cost && cost.lessThan(0)) throw validation("El costo no puede ser negativo.");

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const { idempotencyKey, ...payload } = input;
    const claim = await claimIdempotencyKey<MovementResult>(tx, {
      tenantId: actor.tenantId,
      key: idempotencyKey,
      operation: "stock.movement",
      payload,
    });
    if ("replay" in claim) return { ...claim.replay, replayed: true };

    await assertTenantWritable(tx, actor.tenantId, now);
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone, now);
    const wh = await loadWarehouseFor(tx, actor, input.warehouseId, "inventory.move");
    const product = await loadProduct(tx, actor.tenantId, input.productId, { lock: true });
    if (product.status !== "ACTIVE") throw validation("El producto está inactivo.");
    const baseQty = toBaseQuantity(qty, input.unit, { baseUnit: product.baseUnit, packaging: packagingOf(product) });
    const operationId = newOperationId();
    const inbound = INBOUND.has(input.type);
    const out: MovementResult["movements"] = [];

    if (inbound) {
      const lotId = await resolveInboundLot(tx, actor, product, input, today);
      // El costo se expresa por unidad ingresada; se convierte a costo por unidad base.
      const costPerBase = input.type === "RECEIPT" && cost ? cost.times(qty).dividedBy(baseQty) : null;
      const m = await receiveIntoStock(tx, {
        actor,
        product,
        warehouseId: wh.id,
        lotId,
        baseQty,
        enteredQty: qty,
        enteredUnit: input.unit.toUpperCase(),
        unitCostBase: costPerBase,
        baseCurrency: policy.baseCurrency,
        operationId,
        type: input.type === "RETURN_IN" ? "RETURN_IN" : "RECEIPT",
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      });
      out.push({ id: m.id, lotId, quantity: baseQty.toString() });
    } else {
      let allocations: { lotId: string | null; quantity: typeof baseQty }[];
      if (!product.lotTracking) {
        if (input.lotId || input.lotNumber) throw validation("Este producto no maneja lotes.");
        allocations = [{ lotId: null, quantity: baseQty }];
      } else if (input.lotId || input.lotNumber) {
        const lot = input.lotId
          ? await assertLotDispatchable(tx, actor.tenantId, product.id, input.lotId, today)
          : await (async () => {
              const l = await tx.lot.findUnique({
                where: { tenantId_productId_lotNumber: { tenantId: actor.tenantId, productId: product.id, lotNumber: input.lotNumber! } },
              });
              if (!l) throw notFound("Lote no encontrado para este producto.");
              return assertLotDispatchable(tx, actor.tenantId, product.id, l.id, today);
            })();
        allocations = [{ lotId: lot.id, quantity: baseQty }];
      } else {
        allocations = await allocateFefo(tx, { tenantId: actor.tenantId, warehouseId: wh.id, productId: product.id, quantity: baseQty, today });
      }
      for (const a of allocations) {
        await applyBalanceDelta(tx, {
          tenantId: actor.tenantId,
          warehouseId: wh.id,
          productId: product.id,
          lotId: a.lotId,
          delta: a.quantity.negated(),
          allowNegative: policy.allowNegativeStock && !product.lotTracking,
        });
        const m = await insertMovement(tx, {
          tenantId: actor.tenantId,
          operationId,
          type: input.type,
          warehouseId: wh.id,
          productId: product.id,
          lotId: a.lotId,
          quantity: a.quantity.negated(),
          enteredQuantity: allocations.length === 1 ? qty : a.quantity,
          enteredUnit: allocations.length === 1 ? input.unit.toUpperCase() : product.baseUnit,
          unitCost: product.avgCost,
          currency: policy.baseCurrency,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actorUserId: actor.userId,
        });
        out.push({ id: m.id, lotId: a.lotId, quantity: a.quantity.negated().toString() });
      }
    }

    const result: MovementResult = { operationId, movements: out };
    await storeIdempotencyResult(tx, actor.tenantId, idempotencyKey, result);
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `stock.${input.type.toLowerCase()}`,
      entityType: "StockOperation",
      entityId: operationId,
      after: { warehouse: wh.code, sku: product.sku, quantity: qty.toString(), unit: input.unit, lots: out.map((o) => o.lotId) },
      metadata: { reason: input.reason ?? null },
      meta: actor.meta,
    });
    return result;
  });
}

const REVERSIBLE = new Set(["RECEIPT", "ISSUE", "RETURN_IN", "RETURN_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"]);

/**
 * Corrige una operación creando movimientos opuestos (los originales no se
 * tocan). Una operación solo puede revertirse una vez (índice único).
 */
export async function reverseOperation(actor: TenantActor, operationId: string, reason: string, now = new Date()) {
  assertPermission(actor, "inventory.adjust");
  if (reason.trim().length < 5) throw validation("Indique el motivo del reverso (mínimo 5 caracteres).");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId, now);
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const originals = await tx.stockMovement.findMany({ where: { tenantId: actor.tenantId, operationId }, orderBy: { createdAt: "asc" } });
    if (!originals.length) throw notFound("Operación no encontrada.");
    if (originals.some((m) => m.referenceType === "GOODS_RECEIPT")) {
      throw validation("Una recepción de compra no se revierte: registre una devolución a proveedor para corregirla.");
    }
    if (originals.some((m) => !REVERSIBLE.has(m.type))) {
      throw validation("Esta operación no se revierte aquí (transferencias y conteos tienen su propio flujo).");
    }
    const already = await tx.stockMovement.count({ where: { tenantId: actor.tenantId, reversesMovementId: { in: originals.map((m) => m.id) } } });
    if (already) throw conflict("La operación ya fue revertida.");

    const reversalOp = newOperationId();
    for (const m of originals) {
      const wh = await loadWarehouseFor(tx, actor, m.warehouseId, "inventory.adjust");
      const product = await loadProduct(tx, actor.tenantId, m.productId, { lock: true });
      const delta = m.quantity.negated();
      if (m.type === "RECEIPT" && m.unitCost) {
        // Revertir una recepción valorizada recalcula el promedio sin ella.
        const prevQty = await totalOnHand(tx, actor.tenantId, product.id);
        const remaining = prevQty.minus(m.quantity);
        const avg = remaining.greaterThan(0)
          ? prevQty.times(product.avgCost).minus(m.quantity.times(m.unitCost)).dividedBy(remaining).toDecimalPlaces(6)
          : product.avgCost;
        await tx.product.update({ where: { id: product.id }, data: { avgCost: avg.lessThan(0) ? D(0) : avg } });
      }
      await applyBalanceDelta(tx, { tenantId: actor.tenantId, warehouseId: wh.id, productId: product.id, lotId: m.lotId, delta, allowNegative: policy.allowNegativeStock && !product.lotTracking });
      await insertMovement(tx, {
        tenantId: actor.tenantId,
        operationId: reversalOp,
        type: "REVERSAL",
        warehouseId: m.warehouseId,
        productId: m.productId,
        lotId: m.lotId,
        quantity: delta,
        enteredQuantity: m.enteredQuantity,
        enteredUnit: m.enteredUnit,
        unitCost: m.unitCost,
        currency: m.currency,
        reason: reason.trim(),
        referenceType: "REVERSAL",
        referenceId: operationId,
        reversesMovementId: m.id,
        actorUserId: actor.userId,
      });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "stock.reversed",
      entityType: "StockOperation",
      entityId: operationId,
      after: { reversalOperationId: reversalOp },
      metadata: { reason: reason.trim() },
      meta: actor.meta,
    });
    return { operationId: reversalOp };
  });
}
