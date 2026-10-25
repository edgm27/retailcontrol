import { Prisma, withTenant, type Tx } from "@rc/db";
import { conflict, forbidden, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { parseQuantity, UNITS } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";
import { D, ZERO_UUID, applyBalanceDelta, getInventoryPolicy, insertMovement, loadProduct, loadWarehouseFor, newOperationId } from "./core";

/**
 * Conteo físico / cíclico.
 * 1. Se abre con una foto (snapshot) de las existencias del almacén.
 * 2. Se registran las cantidades contadas (en unidad base).
 * 3. Al enviarlo se valorizan las diferencias: bajo el umbral se aplica; sobre
 *    el umbral queda pendiente de aprobación por OTRO usuario.
 * 4. Se aplica como movimientos COUNT_ADJUSTMENT = contado − esperado.
 *    (Si hubo movimientos mientras se contaba, la diferencia se calcula contra
 *    la foto; por eso se recomienda contar sin despachar ese almacén.)
 */
export async function createStockCount(actor: TenantActor, input: { warehouseId: string; note?: string; productIds?: string[] }) {
  assertPermission(actor, "inventory.count");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const wh = await loadWarehouseFor(tx, actor, input.warehouseId, "inventory.count");
    const balances = await tx.stockBalance.findMany({
      where: {
        tenantId: actor.tenantId,
        warehouseId: wh.id,
        NOT: { onHand: 0 },
        ...(input.productIds?.length ? { productId: { in: input.productIds } } : {}),
      },
    });
    const count = await tx.stockCount.create({
      data: { tenantId: actor.tenantId, warehouseId: wh.id, note: input.note?.trim() || null, createdById: actor.userId },
    });
    if (balances.length) {
      await tx.stockCountLine.createMany({
        data: balances.map((b) => ({ tenantId: actor.tenantId, countId: count.id, productId: b.productId, lotId: b.lotId, expected: b.onHand })),
      });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "count.created",
      entityType: "StockCount",
      entityId: count.id,
      after: { warehouse: wh.code, lines: balances.length },
      meta: actor.meta,
    });
    return count;
  });
}

async function loadOpenCount(tx: Tx, actor: TenantActor, countId: string) {
  const c = await tx.stockCount.findFirst({ where: { id: countId, tenantId: actor.tenantId } });
  if (!c) throw notFound("Conteo no encontrado.");
  await loadWarehouseFor(tx, actor, c.warehouseId, "inventory.count");
  return c;
}

/** Agrega un producto/lote no incluido en la foto (p. ej. mercancía encontrada). */
export async function addCountLine(actor: TenantActor, countId: string, input: { productId: string; lotId?: string }) {
  assertPermission(actor, "inventory.count");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const c = await loadOpenCount(tx, actor, countId);
    if (c.status !== "OPEN") throw conflict("El conteo ya no está abierto.");
    const product = await loadProduct(tx, actor.tenantId, input.productId);
    if (product.lotTracking && !input.lotId) throw validation("Indique el lote.");
    const exists = await tx.stockCountLine.findFirst({ where: { countId, productId: product.id, lotId: input.lotId ?? null } });
    if (exists) throw conflict("Ese producto/lote ya está en el conteo.");
    const bal = await tx.stockBalance.findFirst({
      where: { tenantId: actor.tenantId, warehouseId: c.warehouseId, productId: product.id, lotKey: input.lotId ?? ZERO_UUID },
    });
    return tx.stockCountLine.create({
      data: { tenantId: actor.tenantId, countId, productId: product.id, lotId: input.lotId ?? null, expected: bal?.onHand ?? D(0) },
    });
  });
}

export async function recordCountQuantities(actor: TenantActor, countId: string, entries: { lineId: string; counted: string | number | null }[]) {
  assertPermission(actor, "inventory.count");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const c = await loadOpenCount(tx, actor, countId);
    if (c.status !== "OPEN") throw conflict("El conteo ya no está abierto.");
    const lines = await tx.stockCountLine.findMany({ where: { countId }, include: { product: { select: { baseUnit: true } } } });
    for (const e of entries) {
      const line = lines.find((l) => l.id === e.lineId);
      if (!line) throw notFound("Línea de conteo no encontrada.");
      let counted: Prisma.Decimal | null = null;
      if (e.counted !== null && e.counted !== "") {
        counted = parseQuantity(e.counted);
        if (counted.lessThan(0)) throw validation("La cantidad contada no puede ser negativa.");
        const decimals = UNITS[line.product.baseUnit]?.decimals ?? 0;
        if (counted.decimalPlaces() > decimals) throw validation(`Cantidad incompatible con ${line.product.baseUnit} (${decimals} decimales).`);
      }
      await tx.stockCountLine.update({ where: { id: line.id }, data: { counted } });
    }
  });
}

async function applyCount(tx: Tx, actor: TenantActor, countId: string) {
  const policy = await getInventoryPolicy(tx, actor.tenantId);
  const c = await tx.stockCount.findFirstOrThrow({ where: { id: countId }, include: { lines: true } });
  const operationId = newOperationId();
  for (const line of c.lines) {
    const delta = line.counted!.minus(line.expected);
    if (delta.isZero()) continue;
    const product = await loadProduct(tx, actor.tenantId, line.productId, { lock: true });
    await applyBalanceDelta(tx, {
      tenantId: actor.tenantId,
      warehouseId: c.warehouseId,
      productId: line.productId,
      lotId: line.lotId,
      delta,
      allowNegative: policy.allowNegativeStock && !product.lotTracking,
    });
    await insertMovement(tx, {
      tenantId: actor.tenantId,
      operationId,
      type: "COUNT_ADJUSTMENT",
      warehouseId: c.warehouseId,
      productId: line.productId,
      lotId: line.lotId,
      quantity: delta,
      enteredQuantity: delta.abs(),
      enteredUnit: product.baseUnit,
      unitCost: product.avgCost,
      currency: policy.baseCurrency,
      reason: `Conteo físico: esperado ${line.expected.toString()}, contado ${line.counted!.toString()}`,
      referenceType: "COUNT",
      referenceId: countId,
      actorUserId: actor.userId,
    });
  }
  return operationId;
}

export async function submitStockCount(actor: TenantActor, countId: string) {
  assertPermission(actor, "inventory.count");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const c = await loadOpenCount(tx, actor, countId);
    if (c.status !== "OPEN") throw conflict("El conteo ya fue enviado.");
    const lines = await tx.stockCountLine.findMany({ where: { countId }, include: { product: { select: { avgCost: true } } } });
    if (!lines.length) throw validation("El conteo no tiene líneas.");
    if (lines.some((l) => l.counted === null)) throw validation("Registre la cantidad contada de todas las líneas (use 0 si no hay).");
    const value = lines
      .reduce((acc, l) => acc.plus(l.counted!.minus(l.expected).abs().times(l.product.avgCost)), D(0))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const needsApproval = value.greaterThan(policy.approvalThreshold);
    const claimed = await tx.stockCount.updateMany({
      where: { id: countId, status: "OPEN" },
      data: { status: needsApproval ? "PENDING_APPROVAL" : "APPLIED", submittedById: actor.userId, submittedAt: new Date(), differenceValue: value },
    });
    if (claimed.count !== 1) throw conflict("El conteo ya fue enviado.");
    let operationId: string | null = null;
    if (!needsApproval) {
      operationId = await applyCount(tx, actor, countId);
      await tx.stockCount.update({ where: { id: countId }, data: { operationId, appliedAt: new Date() } });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: needsApproval ? "count.submitted_for_approval" : "count.applied",
      entityType: "StockCount",
      entityId: countId,
      after: { differenceValue: value.toString(), threshold: policy.approvalThreshold.toString(), operationId },
      meta: actor.meta,
    });
    return { status: needsApproval ? "PENDING_APPROVAL" : "APPLIED", differenceValue: value.toString(), operationId };
  });
}

export async function approveStockCount(actor: TenantActor, countId: string) {
  assertPermission(actor, "inventory.adjust.approve");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const c = await tx.stockCount.findFirst({ where: { id: countId, tenantId: actor.tenantId } });
    if (!c) throw notFound("Conteo no encontrado.");
    await loadWarehouseFor(tx, actor, c.warehouseId, "inventory.adjust.approve");
    if (c.submittedById === actor.userId) throw forbidden("El conteo debe aprobarlo un usuario distinto de quien lo envió.");
    const claimed = await tx.stockCount.updateMany({
      where: { id: countId, status: "PENDING_APPROVAL" },
      data: { status: "APPLIED", approvedById: actor.userId, appliedAt: new Date() },
    });
    if (claimed.count !== 1) throw conflict("El conteo no está pendiente de aprobación.");
    const operationId = await applyCount(tx, actor, countId);
    await tx.stockCount.update({ where: { id: countId }, data: { operationId } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "count.approved",
      entityType: "StockCount",
      entityId: countId,
      after: { operationId, submittedBy: c.submittedById },
      meta: actor.meta,
    });
    return { operationId };
  });
}

export async function cancelStockCount(actor: TenantActor, countId: string) {
  assertPermission(actor, "inventory.count");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const c = await loadOpenCount(tx, actor, countId);
    const res = await tx.stockCount.updateMany({ where: { id: c.id, status: { in: ["OPEN", "PENDING_APPROVAL"] } }, data: { status: "CANCELLED" } });
    if (res.count !== 1) throw conflict("El conteo ya fue aplicado o cancelado.");
    await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: "count.cancelled", entityType: "StockCount", entityId: countId, meta: actor.meta });
  });
}

export async function getStockCount(actor: TenantActor, countId: string) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const c = await tx.stockCount.findFirst({
      where: { id: countId, tenantId: actor.tenantId },
      include: {
        warehouse: { select: { code: true, name: true, branchId: true } },
        lines: {
          include: { product: { select: { sku: true, name: true, baseUnit: true, avgCost: true } } },
          orderBy: [{ product: { sku: "asc" } }],
        },
      },
    });
    if (!c) throw notFound("Conteo no encontrado.");
    const lotIds = c.lines.map((l) => l.lotId).filter((x): x is string => !!x);
    const lots = lotIds.length ? await tx.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, lotNumber: true, expiresAt: true } }) : [];
    return { ...c, lots: Object.fromEntries(lots.map((l) => [l.id, l])) };
  });
}

export async function listStockCounts(actor: TenantActor) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.stockCount.findMany({
      where: { tenantId: actor.tenantId, ...(actor.branchIds.length ? { warehouse: { branchId: { in: [...actor.branchIds] } } } : {}) },
      include: { warehouse: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
}
