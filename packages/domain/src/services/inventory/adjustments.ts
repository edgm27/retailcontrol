import { Prisma, withTenant, type Tx } from "@rc/db";
import { z } from "zod";
import { conflict, forbidden, notFound, validation } from "../../errors";
import { assertPermission, hasPermission } from "../../rbac";
import { parseQuantity, toBaseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";
import {
  applyBalanceDelta,
  getInventoryPolicy,
  insertMovement,
  loadProduct,
  loadWarehouseFor,
  newOperationId,
  packagingOf,
} from "./core";

export const adjustmentInputSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  lotId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  direction: z.enum(["IN", "OUT"]),
  kind: z.enum(["ADJUSTMENT", "WASTE"]).default("ADJUSTMENT"),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string().trim().min(1).max(16),
  reason: z.string().trim().min(5, "Indique el motivo (mínimo 5 caracteres)").max(300),
});

async function applyAdjustment(tx: Tx, actor: TenantActor, adj: Prisma.StockAdjustmentGetPayload<object>) {
  const policy = await getInventoryPolicy(tx, actor.tenantId);
  const product = await loadProduct(tx, actor.tenantId, adj.productId, { lock: true });
  const operationId = newOperationId();
  // Las correcciones autorizadas pueden afectar lotes bloqueados (cuarentena, vencido…).
  await applyBalanceDelta(tx, {
    tenantId: actor.tenantId,
    warehouseId: adj.warehouseId,
    productId: adj.productId,
    lotId: adj.lotId,
    delta: adj.quantity,
    allowNegative: policy.allowNegativeStock && !product.lotTracking,
  });
  await insertMovement(tx, {
    tenantId: actor.tenantId,
    operationId,
    type: adj.kind === "WASTE" ? "WASTE" : adj.quantity.greaterThan(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    warehouseId: adj.warehouseId,
    productId: adj.productId,
    lotId: adj.lotId,
    quantity: adj.quantity,
    enteredQuantity: adj.enteredQuantity,
    enteredUnit: adj.enteredUnit,
    unitCost: product.avgCost,
    currency: policy.baseCurrency,
    reason: adj.reason,
    referenceType: "ADJUSTMENT",
    referenceId: adj.id,
    actorUserId: actor.userId,
  });
  return operationId;
}

/**
 * Solicita un ajuste o merma. Si el valor estimado (cantidad × costo promedio)
 * no supera el umbral de la empresa, se aplica de inmediato; si lo supera,
 * queda PENDIENTE hasta que OTRO usuario con permiso lo apruebe.
 */
export async function requestAdjustment(actor: TenantActor, raw: z.input<typeof adjustmentInputSchema>) {
  assertPermission(actor, "inventory.adjust");
  const input = adjustmentInputSchema.parse(raw);
  if (input.kind === "WASTE" && input.direction !== "OUT") throw validation("Una merma siempre es una salida.");
  const qty = parseQuantity(input.quantity);
  if (qty.lessThanOrEqualTo(0)) throw validation("La cantidad debe ser mayor que cero.");

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const wh = await loadWarehouseFor(tx, actor, input.warehouseId, "inventory.adjust");
    const product = await loadProduct(tx, actor.tenantId, input.productId);
    if (product.lotTracking && !input.lotId) throw validation("Indique el lote a ajustar.");
    if (!product.lotTracking && input.lotId) throw validation("Este producto no maneja lotes.");
    if (input.lotId) {
      const lot = await tx.lot.findFirst({ where: { id: input.lotId, tenantId: actor.tenantId, productId: product.id } });
      if (!lot) throw notFound("Lote no encontrado para este producto.");
    }
    const base = toBaseQuantity(qty, input.unit, { baseUnit: product.baseUnit, packaging: packagingOf(product) });
    const signed = input.direction === "IN" ? base : base.negated();
    const value = base.times(product.avgCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const needsApproval = value.greaterThan(policy.approvalThreshold);

    const adj = await tx.stockAdjustment.create({
      data: {
        tenantId: actor.tenantId,
        warehouseId: wh.id,
        productId: product.id,
        lotId: input.lotId ?? null,
        kind: input.kind,
        quantity: signed,
        enteredQuantity: qty,
        enteredUnit: input.unit.toUpperCase(),
        estimatedValue: value,
        reason: input.reason,
        requestedById: actor.userId,
      },
    });
    let status: "PENDING" | "APPLIED" = "PENDING";
    if (!needsApproval) {
      const operationId = await applyAdjustment(tx, actor, adj);
      await tx.stockAdjustment.update({
        where: { id: adj.id },
        data: { status: "APPLIED", operationId, decidedAt: new Date(), decisionNote: "Aplicado automáticamente: bajo el umbral de aprobación." },
      });
      status = "APPLIED";
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: status === "APPLIED" ? "adjustment.applied" : "adjustment.requested",
      entityType: "StockAdjustment",
      entityId: adj.id,
      after: { sku: product.sku, quantity: signed.toString(), kind: input.kind, estimatedValue: value.toString(), threshold: policy.approvalThreshold.toString() },
      metadata: { reason: input.reason },
      meta: actor.meta,
    });
    return { id: adj.id, status, estimatedValue: value.toString(), needsApproval };
  });
}

export async function decideAdjustment(actor: TenantActor, adjustmentId: string, decision: "APPROVE" | "REJECT", note?: string) {
  assertPermission(actor, "inventory.adjust.approve");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const adj = await tx.stockAdjustment.findFirst({ where: { id: adjustmentId, tenantId: actor.tenantId } });
    if (!adj) throw notFound("Ajuste no encontrado.");
    const wh = await loadWarehouseFor(tx, actor, adj.warehouseId, "inventory.adjust.approve");
    void wh;
    if (adj.requestedById === actor.userId) throw forbidden("Un ajuste debe aprobarlo un usuario distinto de quien lo solicitó.");
    // Reclamo atómico: solo una decisión gana aunque dos aprobadores actúen a la vez.
    const claimed = await tx.stockAdjustment.updateMany({
      where: { id: adj.id, status: "PENDING" },
      data: { status: decision === "APPROVE" ? "APPLIED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
    });
    if (claimed.count !== 1) throw conflict("El ajuste ya fue decidido.");
    let operationId: string | null = null;
    if (decision === "APPROVE") {
      operationId = await applyAdjustment(tx, actor, adj);
      await tx.stockAdjustment.update({ where: { id: adj.id }, data: { operationId } });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: decision === "APPROVE" ? "adjustment.approved" : "adjustment.rejected",
      entityType: "StockAdjustment",
      entityId: adj.id,
      before: { status: "PENDING" },
      after: { status: decision === "APPROVE" ? "APPLIED" : "REJECTED", operationId },
      metadata: { note: note ?? null, requestedBy: adj.requestedById },
      meta: actor.meta,
    });
    return { status: decision === "APPROVE" ? "APPLIED" : "REJECTED", operationId };
  });
}

export async function listAdjustments(actor: TenantActor, opts: { status?: "PENDING" | "APPLIED" | "REJECTED"; take?: number } = {}) {
  if (!hasPermission(actor.role, "inventory.adjust") && !hasPermission(actor.role, "inventory.adjust.approve") && !hasPermission(actor.role, "audit.read")) {
    throw forbidden();
  }
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.stockAdjustment.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(actor.branchIds.length ? { warehouse: { branchId: { in: [...actor.branchIds] } } } : {}),
      },
      include: { product: { select: { sku: true, name: true, baseUnit: true } }, warehouse: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 50, 200),
    }),
  );
}
