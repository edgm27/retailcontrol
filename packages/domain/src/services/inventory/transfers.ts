import { withTenant, type Tx } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { parseQuantity, toBaseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertPlanFeature, assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";
import {
  allocateFefo,
  applyBalanceDelta,
  assertLotDispatchable,
  getInventoryPolicy,
  insertMovement,
  loadProduct,
  loadWarehouseFor,
  newOperationId,
  packagingOf,
  todayIn,
} from "./core";

const transferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.union([z.string(), z.number()]),
        unit: z.string().trim().min(1).max(16),
        lotId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
      }),
    )
    .min(1, "Agregue al menos un producto.")
    .max(200),
});

/**
 * Transferencia entre almacenes: BORRADOR → ENVIADA (sale del origen) →
 * RECIBIDA (entra al destino). Cancelar una ENVIADA devuelve la mercancía al
 * origen con movimientos trazables. Requiere la función "transferencias" del plan.
 */
export async function createTransfer(actor: TenantActor, raw: z.input<typeof transferSchema>) {
  assertPermission(actor, "inventory.transfer");
  const input = transferSchema.parse(raw);
  if (input.fromWarehouseId === input.toWarehouseId) throw validation("Elija almacenes de origen y destino distintos.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    await assertPlanFeature(tx, actor.tenantId, "transferencias", "Las transferencias entre almacenes");
    const from = await loadWarehouseFor(tx, actor, input.fromWarehouseId, "inventory.transfer");
    const to = await loadWarehouseFor(tx, actor, input.toWarehouseId, "inventory.transfer");
    const lines = [];
    for (const l of input.lines) {
      const p = await loadProduct(tx, actor.tenantId, l.productId);
      if (p.status !== "ACTIVE") throw validation(`El producto ${p.sku} está inactivo.`);
      if (!p.lotTracking && l.lotId) throw validation(`El producto ${p.sku} no maneja lotes.`);
      const q = toBaseQuantity(parseQuantity(l.quantity), l.unit, { baseUnit: p.baseUnit, packaging: packagingOf(p) });
      if (q.lessThanOrEqualTo(0)) throw validation("Las cantidades deben ser mayores que cero.");
      lines.push({ tenantId: actor.tenantId, productId: p.id, lotId: l.lotId ?? null, quantity: q });
    }
    const t = await tx.transfer.create({
      data: {
        tenantId: actor.tenantId,
        fromWarehouseId: from.id,
        toWarehouseId: to.id,
        note: input.note || null,
        createdById: actor.userId,
        lines: { createMany: { data: lines.map(({ tenantId: _t, ...r }) => r) } },
      },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "transfer.created",
      entityType: "Transfer",
      entityId: t.id,
      after: { from: from.code, to: to.code, lines: lines.length },
      meta: actor.meta,
    });
    return t;
  });
}

async function loadTransfer(tx: Tx, actor: TenantActor, id: string) {
  const t = await tx.transfer.findFirst({ where: { id, tenantId: actor.tenantId }, include: { lines: true } });
  if (!t) throw notFound("Transferencia no encontrada.");
  return t;
}

export async function sendTransfer(actor: TenantActor, transferId: string, now = new Date()) {
  assertPermission(actor, "inventory.transfer");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId, now);
    const t = await loadTransfer(tx, actor, transferId);
    await loadWarehouseFor(tx, actor, t.fromWarehouseId, "inventory.transfer");
    const claimed = await tx.transfer.updateMany({
      where: { id: t.id, status: "DRAFT" },
      data: { status: "SENT", sentById: actor.userId, sentAt: now },
    });
    if (claimed.count !== 1) throw conflict("Solo se puede enviar una transferencia en borrador.");
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone, now);
    const operationId = newOperationId();

    for (const line of t.lines) {
      const product = await loadProduct(tx, actor.tenantId, line.productId, { lock: true });
      let allocations: { lotId: string | null; quantity: typeof line.quantity }[];
      if (!product.lotTracking) allocations = [{ lotId: null, quantity: line.quantity }];
      else if (line.lotId) {
        await assertLotDispatchable(tx, actor.tenantId, product.id, line.lotId, today);
        allocations = [{ lotId: line.lotId, quantity: line.quantity }];
      } else {
        allocations = await allocateFefo(tx, { tenantId: actor.tenantId, warehouseId: t.fromWarehouseId, productId: product.id, quantity: line.quantity, today });
        // Guardar los lotes asignados para recibir exactamente los mismos.
        await tx.transferLine.delete({ where: { id: line.id } });
        await tx.transferLine.createMany({
          data: allocations.map((a) => ({ tenantId: actor.tenantId, transferId: t.id, productId: product.id, lotId: a.lotId, quantity: a.quantity })),
        });
      }
      for (const a of allocations) {
        await applyBalanceDelta(tx, {
          tenantId: actor.tenantId,
          warehouseId: t.fromWarehouseId,
          productId: product.id,
          lotId: a.lotId,
          delta: a.quantity.negated(),
          allowNegative: policy.allowNegativeStock && !product.lotTracking,
        });
        await insertMovement(tx, {
          tenantId: actor.tenantId,
          operationId,
          type: "TRANSFER_OUT",
          warehouseId: t.fromWarehouseId,
          productId: product.id,
          lotId: a.lotId,
          quantity: a.quantity.negated(),
          enteredQuantity: a.quantity,
          enteredUnit: product.baseUnit,
          unitCost: product.avgCost,
          currency: policy.baseCurrency,
          referenceType: "TRANSFER",
          referenceId: t.id,
          actorUserId: actor.userId,
        });
      }
    }
    await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: "transfer.sent", entityType: "Transfer", entityId: t.id, after: { operationId }, meta: actor.meta });
    return { operationId };
  });
}

async function moveIn(tx: Tx, actor: TenantActor, t: Awaited<ReturnType<typeof loadTransfer>>, warehouseId: string, reason: string | null) {
  const policy = await getInventoryPolicy(tx, actor.tenantId);
  const operationId = newOperationId();
  for (const line of t.lines) {
    const product = await loadProduct(tx, actor.tenantId, line.productId, { lock: true });
    await applyBalanceDelta(tx, { tenantId: actor.tenantId, warehouseId, productId: product.id, lotId: line.lotId, delta: line.quantity, allowNegative: false });
    await insertMovement(tx, {
      tenantId: actor.tenantId,
      operationId,
      type: "TRANSFER_IN",
      warehouseId,
      productId: product.id,
      lotId: line.lotId,
      quantity: line.quantity,
      enteredQuantity: line.quantity,
      enteredUnit: product.baseUnit,
      unitCost: product.avgCost,
      currency: policy.baseCurrency,
      reason,
      referenceType: "TRANSFER",
      referenceId: t.id,
      actorUserId: actor.userId,
    });
  }
  return operationId;
}

export async function receiveTransfer(actor: TenantActor, transferId: string, now = new Date()) {
  assertPermission(actor, "inventory.transfer");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId, now);
    const t = await loadTransfer(tx, actor, transferId);
    await loadWarehouseFor(tx, actor, t.toWarehouseId, "inventory.transfer");
    const claimed = await tx.transfer.updateMany({
      where: { id: t.id, status: "SENT" },
      data: { status: "RECEIVED", receivedById: actor.userId, receivedAt: now },
    });
    if (claimed.count !== 1) throw conflict("Solo se puede recibir una transferencia enviada.");
    const operationId = await moveIn(tx, actor, await loadTransfer(tx, actor, transferId), t.toWarehouseId, null);
    await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: "transfer.received", entityType: "Transfer", entityId: t.id, after: { operationId }, meta: actor.meta });
    return { operationId };
  });
}

export async function cancelTransfer(actor: TenantActor, transferId: string, reason: string) {
  assertPermission(actor, "inventory.transfer");
  if (reason.trim().length < 5) throw validation("Indique el motivo (mínimo 5 caracteres).");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const t = await loadTransfer(tx, actor, transferId);
    await loadWarehouseFor(tx, actor, t.fromWarehouseId, "inventory.transfer");
    const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: { in: ["DRAFT", "SENT"] } }, data: { status: "CANCELLED" } });
    if (claimed.count !== 1) throw conflict("La transferencia ya fue recibida o cancelada.");
    let operationId: string | null = null;
    // Si ya había salido del origen, la mercancía regresa al origen.
    if (t.status === "SENT") operationId = await moveIn(tx, actor, t, t.fromWarehouseId, `Cancelación: ${reason.trim()}`);
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "transfer.cancelled",
      entityType: "Transfer",
      entityId: t.id,
      before: { status: t.status },
      after: { status: "CANCELLED", returnOperationId: operationId },
      metadata: { reason: reason.trim() },
      meta: actor.meta,
    });
    return { operationId };
  });
}

export async function listTransfers(actor: TenantActor) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.transfer.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(actor.branchIds.length
          ? { OR: [{ fromWarehouse: { branchId: { in: [...actor.branchIds] } } }, { toWarehouse: { branchId: { in: [...actor.branchIds] } } }] }
          : {}),
      },
      include: {
        fromWarehouse: { select: { code: true, name: true } },
        toWarehouse: { select: { code: true, name: true } },
        lines: { include: { product: { select: { sku: true, name: true, baseUnit: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
}
