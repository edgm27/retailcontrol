import { Prisma, withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { UNITS, parseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Ajustes de inventario del producto. La unidad base no cambia si ya hay movimientos. */
export async function updateProductInventorySettings(
  actor: TenantActor,
  productId: string,
  input: { baseUnit?: string; lotTracking?: boolean; requiresExpiry?: boolean; minStock?: string | null },
) {
  assertPermission(actor, "products.write");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId } });
    if (!p) throw notFound("Producto no encontrado.");
    const hasMovements = (await tx.stockMovement.count({ where: { tenantId: actor.tenantId, productId } })) > 0;
    if (input.baseUnit && input.baseUnit !== p.baseUnit) {
      if (!UNITS[input.baseUnit]) throw validation("Unidad base inválida.");
      if (hasMovements) throw conflict("No se puede cambiar la unidad base de un producto con movimientos.");
    }
    if (input.lotTracking === false && p.lotTracking && hasMovements) {
      throw conflict("No se puede desactivar el manejo de lotes de un producto con movimientos.");
    }
    if (input.lotTracking === true && !p.lotTracking && hasMovements) {
      throw conflict("No se puede activar el manejo de lotes en un producto que ya tiene movimientos sin lote.");
    }
    const lotTracking = (input.lotTracking ?? p.lotTracking) || (input.requiresExpiry ?? false);
    const data = {
      baseUnit: input.baseUnit ?? p.baseUnit,
      lotTracking,
      requiresExpiry: lotTracking ? (input.requiresExpiry ?? p.requiresExpiry) : false,
      minStock: input.minStock === undefined ? p.minStock : input.minStock === null || input.minStock === "" ? null : parseQuantity(input.minStock),
    };
    const updated = await tx.product.update({ where: { id: productId }, data });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "product.inventory_settings_changed",
      entityType: "Product",
      entityId: productId,
      before: { baseUnit: p.baseUnit, lotTracking: p.lotTracking, requiresExpiry: p.requiresExpiry, minStock: p.minStock },
      after: data,
      meta: actor.meta,
    });
    return updated;
  });
}

const unitSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{0,15}$/, "Código: letras y números, máx. 16"),
  name: z.string().trim().min(2).max(60),
  factorToBase: z.union([z.string(), z.number()]),
});

/** Presentación del producto (CAJA, BULTO…) con su factor exacto en unidad base. */
export async function addProductUnit(actor: TenantActor, productId: string, input: z.input<typeof unitSchema>) {
  assertPermission(actor, "products.write");
  const data = unitSchema.parse(input);
  if (UNITS[data.code]) throw validation(`${data.code} es una unidad del catálogo; use otro nombre para la presentación.`);
  const factor = parseQuantity(data.factorToBase);
  if (factor.lessThanOrEqualTo(0)) throw validation("El factor debe ser mayor que cero.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId } });
    if (!p) throw notFound("Producto no encontrado.");
    if (factor.decimalPlaces() > (UNITS[p.baseUnit]?.decimals ?? 0)) {
      throw validation(`El factor debe ser compatible con la unidad base ${p.baseUnit}.`);
    }
    try {
      const u = await tx.productUnit.create({ data: { tenantId: actor.tenantId, productId, code: data.code, name: data.name, factorToBase: factor } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "product.unit_added",
        entityType: "Product",
        entityId: productId,
        after: { code: data.code, factorToBase: factor.toString(), base: p.baseUnit },
        meta: actor.meta,
      });
      return u;
    } catch (e) {
      if (isUnique(e)) throw conflict("Ya existe esa presentación para el producto.");
      throw e;
    }
  });
}

/** Valida EAN-13 / UPC-A / EAN-8 por dígito verificador; otros códigos internos se aceptan sin cálculo. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export async function addProductBarcode(actor: TenantActor, productId: string, input: { code: string; unitCode?: string }) {
  assertPermission(actor, "products.write");
  const code = input.code.trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(code)) throw validation("Código de barras inválido.");
  if (/^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length) && !isValidGtin(code)) {
    throw validation("El dígito verificador del código EAN/UPC no es válido.");
  }
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId }, include: { units: true } });
    if (!p) throw notFound("Producto no encontrado.");
    const unitCode = input.unitCode?.trim().toUpperCase() || null;
    if (unitCode && unitCode !== p.baseUnit && !p.units.some((u) => u.code === unitCode)) {
      throw validation("La unidad del código debe ser la base o una presentación del producto.");
    }
    try {
      const b = await tx.productBarcode.create({ data: { tenantId: actor.tenantId, productId, code, unitCode } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "product.barcode_added",
        entityType: "Product",
        entityId: productId,
        after: { code, unitCode },
        meta: actor.meta,
      });
      return b;
    } catch (e) {
      if (isUnique(e)) throw conflict("Ese código ya está asignado a un producto de su empresa.");
      throw e;
    }
  });
}

/** Búsqueda por SKU o código de barras (lector USB = teclado + Enter). */
export async function findProductByCode(actor: TenantActor, code: string) {
  assertPermission(actor, "products.read");
  const c = code.trim();
  if (!c) return null;
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const bySku = await tx.product.findUnique({ where: { tenantId_sku: { tenantId: actor.tenantId, sku: c.toUpperCase() } } });
    if (bySku) return { product: bySku, unitCode: null as string | null };
    const bc = await tx.productBarcode.findUnique({ where: { tenantId_code: { tenantId: actor.tenantId, code: c } }, include: { product: true } });
    return bc ? { product: bc.product, unitCode: bc.unitCode } : null;
  });
}

export async function getProductDetail(actor: TenantActor, productId: string) {
  assertPermission(actor, "products.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const p = await tx.product.findFirst({
      where: { id: productId, tenantId: actor.tenantId },
      include: { units: { orderBy: { code: "asc" } }, barcodes: { orderBy: { createdAt: "asc" } } },
    });
    if (!p) throw notFound("Producto no encontrado.");
    return p;
  });
}

const LOT_STATUS_CHANGEABLE = ["AVAILABLE", "QUARANTINE", "DAMAGED", "RECALLED"] as const;

/** Bloquea o libera un lote (cuarentena, dañado, retirado). Requiere motivo y queda auditado. */
export async function setLotStatus(
  actor: TenantActor,
  lotId: string,
  status: (typeof LOT_STATUS_CHANGEABLE)[number],
  reason: string,
) {
  assertPermission(actor, "inventory.adjust");
  if (!LOT_STATUS_CHANGEABLE.includes(status)) throw validation("Estado de lote no permitido.");
  if (reason.trim().length < 5) throw validation("Indique el motivo (mínimo 5 caracteres).");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const lot = await tx.lot.findFirst({ where: { id: lotId, tenantId: actor.tenantId } });
    if (!lot) throw notFound("Lote no encontrado.");
    const updated = await tx.lot.update({ where: { id: lotId }, data: { status } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "lot.status_changed",
      entityType: "Lot",
      entityId: lotId,
      before: { status: lot.status },
      after: { status },
      metadata: { reason: reason.trim() },
      meta: actor.meta,
    });
    return updated;
  });
}
