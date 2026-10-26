import { Prisma, withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { convertAmount, prorateByValue, roundDoc, roundUnitCost } from "../../money";
import { parseQuantity, toBaseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertPlanFeature, assertTenantWritable } from "../entitlements";
import { D, getInventoryPolicy, loadProduct, loadWarehouseFor, newOperationId, packagingOf, todayIn } from "../inventory/core";
import { claimIdempotencyKey, storeIdempotencyResult } from "../inventory/idempotency";
import { receiveIntoStock, resolveInboundLot } from "../inventory/movements";
import type { TenantActor } from "../types";
import { nextDocumentNumber } from "./numbering";
import { currentRate } from "./rates";

const receiptLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string().trim().min(1).max(16),
  unitPrice: z.union([z.string(), z.number()]),
  lotNumber: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});

export const receiptSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  purchaseOrderId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.enum(["USD", "VES"]),
  supplierInvoice: z.string().trim().max(60).optional(),
  additionalCosts: z.union([z.string(), z.number()]).optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(receiptLineSchema).min(1, "Indique al menos un producto recibido.").max(200),
});

export interface ReceiptResult {
  receiptId: string;
  number: number;
  operationId: string;
  exchangeRate: string | null;
  totalBase: string;
  replayed?: boolean;
}

/**
 * Recepción de mercancía (con o sin orden de compra), parcial o completa, por lote.
 * - Congela la tasa vigente en el documento si la moneda difiere de la base.
 * - Costo puesto en almacén = precio + gastos adicionales prorrateados por valor,
 *   convertido a moneda base con la tasa CONGELADA; actualiza el costo promedio.
 * - No permite recibir más de lo pendiente en la orden.
 * - Atómica e idempotente: reintentos con la misma clave no duplican.
 */
export async function receiveGoods(actor: TenantActor, raw: z.input<typeof receiptSchema>, now = new Date()): Promise<ReceiptResult> {
  assertPermission(actor, "purchases.receive");
  const input = receiptSchema.parse(raw);
  const additional = input.additionalCosts !== undefined && input.additionalCosts !== "" ? parseQuantity(input.additionalCosts) : D(0);
  if (additional.lessThan(0)) throw validation("Los gastos adicionales no pueden ser negativos.");

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const { idempotencyKey, ...payload } = input;
    const claim = await claimIdempotencyKey<ReceiptResult>(tx, { tenantId: actor.tenantId, key: idempotencyKey, operation: "purchase.receipt", payload });
    if ("replay" in claim) return { ...claim.replay, replayed: true };

    await assertTenantWritable(tx, actor.tenantId, now);
    await assertPlanFeature(tx, actor.tenantId, "compras", "La recepción de compras");
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone, now);
    const wh = await loadWarehouseFor(tx, actor, input.warehouseId, "purchases.receive");
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: actor.tenantId } });
    if (!supplier) throw notFound("Proveedor no encontrado.");

    // Orden de compra (opcional): bloqueada para serializar recepciones simultáneas.
    let po: Prisma.PurchaseOrderGetPayload<{ include: { lines: true } }> | null = null;
    if (input.purchaseOrderId) {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.purchaseOrderId}::uuid AND tenant_id = ${actor.tenantId}::uuid FOR UPDATE`;
      po = await tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, tenantId: actor.tenantId }, include: { lines: true } });
      if (!po) throw notFound("Orden de compra no encontrada.");
      if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED") throw conflict("La orden debe estar aprobada y con pendientes para recibir.");
      if (po.supplierId !== supplier.id) throw validation("El proveedor no coincide con el de la orden.");
      if (po.currency !== input.currency) throw validation("La moneda no coincide con la de la orden.");
    }

    // Tasa congelada del documento.
    let rate: { id: string; rate: Prisma.Decimal } | null = null;
    if (input.currency !== policy.baseCurrency) {
      const r = await currentRate(tx, actor.tenantId, today);
      if (!r) throw validation("Registre la tasa de cambio del día antes de recibir en otra moneda.");
      rate = { id: r.id, rate: r.rate };
    }

    // Preparar líneas (conversión a unidad base y validación contra la orden).
    const prepared = [];
    for (const l of input.lines) {
      const product = await loadProduct(tx, actor.tenantId, l.productId, { lock: true });
      if (product.status !== "ACTIVE") throw validation(`El producto ${product.sku} está inactivo.`);
      const entered = parseQuantity(l.quantity);
      if (entered.lessThanOrEqualTo(0)) continue; // líneas en cero = no recibidas
      const unitPrice = parseQuantity(l.unitPrice);
      if (unitPrice.lessThan(0)) throw validation("El precio no puede ser negativo.");
      const baseQty = toBaseQuantity(entered, l.unit, { baseUnit: product.baseUnit, packaging: packagingOf(product) });
      let poLine = null;
      if (po) {
        if (!l.purchaseOrderLineId) throw validation("Cada línea debe referirse a una línea de la orden.");
        poLine = po.lines.find((x) => x.id === l.purchaseOrderLineId);
        if (!poLine || poLine.productId !== product.id) throw validation("La línea no corresponde a la orden.");
        const pending = poLine.quantity.minus(poLine.receivedQuantity);
        if (baseQty.greaterThan(pending)) {
          throw validation(`Se reciben ${baseQty.toString()} ${product.baseUnit} de ${product.sku}, pero solo quedan ${pending.toString()} pendientes en la orden.`);
        }
      }
      prepared.push({ l, product, entered, unitPrice, baseQty, poLine });
    }
    if (!prepared.length) throw validation("Ninguna línea tiene cantidad recibida.");

    const values = prepared.map((p) => p.entered.times(p.unitPrice)); // en moneda del documento
    const shares = prorateByValue(values, additional);
    const merchandise = values.reduce((a, v) => a.plus(v), D(0));
    const number = await nextDocumentNumber(tx, actor.tenantId, "goods_receipts");
    const operationId = newOperationId();
    const receiptId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid() AS id`)[0]!.id;

    const lineRows: Prisma.GoodsReceiptLineCreateManyInput[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i]!;
      const landedDoc = values[i]!.plus(shares[i]!); // total de la línea con gastos, moneda del documento
      const landedBaseTotal = convertAmount(landedDoc, input.currency, policy.baseCurrency, rate?.rate ?? null);
      const unitCostBase = roundUnitCost(landedBaseTotal.dividedBy(p.baseQty));
      const lotId = await resolveInboundLot(
        tx,
        actor,
        p.product,
        { type: "RECEIPT", lotNumber: p.l.lotNumber, expiresAt: p.l.expiresAt, lotId: undefined } as Parameters<typeof resolveInboundLot>[3],
        today,
      );
      const m = await receiveIntoStock(tx, {
        actor,
        product: p.product,
        warehouseId: wh.id,
        lotId,
        baseQty: p.baseQty,
        enteredQty: p.entered,
        enteredUnit: p.l.unit.toUpperCase(),
        unitCostBase,
        baseCurrency: policy.baseCurrency,
        operationId,
        type: "RECEIPT",
        reason: input.supplierInvoice ? `Factura ${input.supplierInvoice}` : null,
        referenceType: "GOODS_RECEIPT",
        referenceId: receiptId,
      });
      if (p.poLine) {
        await tx.purchaseOrderLine.update({ where: { id: p.poLine.id }, data: { receivedQuantity: { increment: p.baseQty } } });
      }
      lineRows.push({
        tenantId: actor.tenantId,
        receiptId,
        purchaseOrderLineId: p.poLine?.id ?? null,
        productId: p.product.id,
        lotId,
        quantity: p.baseQty,
        enteredQuantity: p.entered,
        enteredUnit: p.l.unit.toUpperCase(),
        unitPrice: p.unitPrice,
        orderedUnitPrice: p.poLine?.unitPrice ?? null,
        landedUnitCost: unitCostBase,
        movementId: m.id,
      });
    }

    const totalDoc = merchandise.plus(additional);
    const totalBase = roundDoc(convertAmount(totalDoc, input.currency, policy.baseCurrency, rate?.rate ?? null));
    await tx.goodsReceipt.create({
      data: {
        id: receiptId,
        tenantId: actor.tenantId,
        number,
        purchaseOrderId: po?.id ?? null,
        supplierId: supplier.id,
        warehouseId: wh.id,
        currency: input.currency,
        baseCurrency: policy.baseCurrency,
        exchangeRateId: rate?.id ?? null,
        exchangeRate: rate?.rate ?? null,
        supplierInvoice: input.supplierInvoice || null,
        additionalCosts: roundDoc(additional),
        merchandiseTotal: roundDoc(merchandise),
        totalBase,
        notes: input.notes || null,
        operationId,
        createdById: actor.userId,
        receivedAt: now,
      },
    });
    await tx.goodsReceiptLine.createMany({ data: lineRows });

    if (po) {
      const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
      const complete = lines.every((x) => x.receivedQuantity.greaterThanOrEqualTo(x.quantity));
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", closedAt: complete ? now : null } });
    }

    const result: ReceiptResult = { receiptId, number, operationId, exchangeRate: rate?.rate.toString() ?? null, totalBase: totalBase.toString() };
    await storeIdempotencyResult(tx, actor.tenantId, idempotencyKey, result);
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "goods_receipt.posted",
      entityType: "GoodsReceipt",
      entityId: receiptId,
      after: {
        number,
        purchaseOrder: po?.number ?? null,
        supplier: supplier.name,
        currency: input.currency,
        exchangeRate: rate?.rate.toString() ?? null,
        totalBase: totalBase.toString(),
        lines: lineRows.length,
      },
      meta: actor.meta,
    });
    return result;
  });
}

export async function getGoodsReceipt(actor: TenantActor, receiptId: string) {
  assertPermission(actor, "purchases.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const r = await tx.goodsReceipt.findFirst({
      where: { id: receiptId, tenantId: actor.tenantId },
      include: {
        supplier: { select: { name: true, rif: true } },
        warehouse: { select: { name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        lines: { include: { product: { select: { sku: true, name: true, baseUnit: true } } } },
      },
    });
    if (!r) throw notFound("Recepción no encontrada.");
    const lotIds = r.lines.map((l) => l.lotId).filter((x): x is string => !!x);
    const lots = lotIds.length ? await tx.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, lotNumber: true, expiresAt: true } }) : [];
    return { ...r, lots: Object.fromEntries(lots.map((l) => [l.id, l])) };
  });
}

export async function listGoodsReceipts(actor: TenantActor) {
  assertPermission(actor, "purchases.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.goodsReceipt.findMany({
      where: { tenantId: actor.tenantId, ...(actor.branchIds.length ? { warehouse: { branchId: { in: [...actor.branchIds] } } } : {}) },
      include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, purchaseOrder: { select: { number: true } } },
      orderBy: { number: "desc" },
      take: 100,
    }),
  );
}
