import { withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { documentTotals } from "../../money";
import { parseQuantity, toBaseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertPlanFeature, assertTenantWritable } from "../entitlements";
import { getInventoryPolicy, loadProduct, loadWarehouseFor, packagingOf, todayIn } from "../inventory/core";
import type { TenantActor } from "../types";
import { nextDocumentNumber } from "./numbering";
import { currentRate } from "./rates";

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string().trim().min(1).max(16),
  unitPrice: z.union([z.string(), z.number()]),
  taxRate: z.union([z.string(), z.number()]).optional(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.enum(["USD", "VES"]),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(lineSchema).min(1, "Agregue al menos un producto.").max(200),
});

/** Crea una orden de compra en BORRADOR. No afecta el inventario. */
export async function createPurchaseOrder(actor: TenantActor, raw: z.input<typeof purchaseOrderSchema>) {
  assertPermission(actor, "purchases.write");
  const input = purchaseOrderSchema.parse(raw);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    await assertPlanFeature(tx, actor.tenantId, "compras", "Las órdenes de compra");
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: actor.tenantId, active: true } });
    if (!supplier) throw notFound("Proveedor no encontrado o inactivo.");
    const wh = await loadWarehouseFor(tx, actor, input.warehouseId, "purchases.write");
    const seen = new Set<string>();
    const lines = [];
    for (const l of input.lines) {
      if (seen.has(l.productId)) throw validation("Un producto aparece dos veces en la orden; sume las cantidades en una línea.");
      seen.add(l.productId);
      const p = await loadProduct(tx, actor.tenantId, l.productId);
      if (p.status !== "ACTIVE") throw validation(`El producto ${p.sku} está inactivo.`);
      const entered = parseQuantity(l.quantity);
      if (entered.lessThanOrEqualTo(0)) throw validation("Las cantidades deben ser mayores que cero.");
      const unitPrice = parseQuantity(l.unitPrice);
      if (unitPrice.lessThan(0)) throw validation("El precio no puede ser negativo.");
      const taxRate = l.taxRate !== undefined && l.taxRate !== "" ? parseQuantity(l.taxRate) : parseQuantity(0);
      if (taxRate.lessThan(0) || taxRate.greaterThan(100)) throw validation("Alícuota fuera de rango.");
      lines.push({
        productId: p.id,
        quantity: toBaseQuantity(entered, l.unit, { baseUnit: p.baseUnit, packaging: packagingOf(p) }),
        enteredQuantity: entered,
        enteredUnit: l.unit.toUpperCase(),
        unitPrice,
        taxRate,
      });
    }
    const totals = documentTotals(lines.map((l) => ({ quantity: l.enteredQuantity, unitPrice: l.unitPrice, taxRate: l.taxRate })));
    const number = await nextDocumentNumber(tx, actor.tenantId, "purchase_orders");
    const po = await tx.purchaseOrder.create({
      data: {
        tenantId: actor.tenantId,
        number,
        supplierId: supplier.id,
        warehouseId: wh.id,
        currency: input.currency,
        expectedDate: input.expectedDate ? new Date(`${input.expectedDate}T00:00:00Z`) : null,
        notes: input.notes || null,
        subtotal: totals.subtotal,
        taxTotal: totals.tax,
        total: totals.total,
        createdById: actor.userId,
        lines: { createMany: { data: lines } },
      },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "purchase_order.created",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { number, supplier: supplier.name, currency: input.currency, total: totals.total.toString(), lines: lines.length },
      meta: actor.meta,
    });
    return po;
  });
}

/** Aprueba la orden y CONGELA la tasa vigente si la moneda difiere de la base. */
export async function approvePurchaseOrder(actor: TenantActor, purchaseOrderId: string, now = new Date()) {
  assertPermission(actor, "purchases.approve");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId, now);
    const po = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId: actor.tenantId } });
    if (!po) throw notFound("Orden no encontrada.");
    await loadWarehouseFor(tx, actor, po.warehouseId, "purchases.approve");
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    let rate = null;
    if (po.currency !== policy.baseCurrency) {
      rate = await currentRate(tx, actor.tenantId, todayIn(policy.timezone, now));
      if (!rate) throw validation("Registre la tasa de cambio del día antes de aprobar una orden en otra moneda.");
    }
    const res = await tx.purchaseOrder.updateMany({
      where: { id: po.id, status: "DRAFT" },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: now, exchangeRateId: rate?.id ?? null, exchangeRate: rate?.rate ?? null },
    });
    if (res.count !== 1) throw conflict("Solo se puede aprobar una orden en borrador.");
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "purchase_order.approved",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { number: po.number, exchangeRate: rate?.rate.toString() ?? null },
      meta: actor.meta,
    });
  });
}

/** Cancela un borrador o una aprobada; si ya tiene recepciones, cierra lo pendiente (lo recibido se conserva). */
export async function cancelPurchaseOrder(actor: TenantActor, purchaseOrderId: string, reason: string) {
  assertPermission(actor, "purchases.write");
  if (reason.trim().length < 5) throw validation("Indique el motivo (mínimo 5 caracteres).");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId: actor.tenantId } });
    if (!po) throw notFound("Orden no encontrada.");
    const res = await tx.purchaseOrder.updateMany({
      where: { id: po.id, status: { in: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"] } },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    if (res.count !== 1) throw conflict("La orden ya está recibida o cancelada.");
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "purchase_order.cancelled",
      entityType: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status },
      after: { status: "CANCELLED" },
      metadata: { reason: reason.trim() },
      meta: actor.meta,
    });
  });
}

export async function getPurchaseOrder(actor: TenantActor, purchaseOrderId: string) {
  assertPermission(actor, "purchases.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId: actor.tenantId },
      include: {
        supplier: true,
        warehouse: { select: { id: true, name: true, branchId: true } },
        lines: { include: { product: { select: { id: true, sku: true, name: true, baseUnit: true, lotTracking: true, requiresExpiry: true } } } },
        receipts: { orderBy: { receivedAt: "desc" }, select: { id: true, number: true, receivedAt: true, supplierInvoice: true, totalBase: true, baseCurrency: true } },
      },
    });
    if (!po) throw notFound("Orden no encontrada.");
    return po;
  });
}

export async function listPurchaseOrders(actor: TenantActor, opts: { status?: string } = {}) {
  assertPermission(actor, "purchases.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.purchaseOrder.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(opts.status ? { status: opts.status as "DRAFT" } : {}),
        ...(actor.branchIds.length ? { warehouse: { branchId: { in: [...actor.branchIds] } } } : {}),
      },
      include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } } },
      orderBy: { number: "desc" },
      take: 100,
    }),
  );
}
