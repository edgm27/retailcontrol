import { Prisma, withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, notFound, validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { parseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";

export async function getTenantSettings(actor: TenantActor) {
  assertPermission(actor, "inventory.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const s = await tx.tenantSettings.findUnique({ where: { tenantId: actor.tenantId } });
    if (!s) throw notFound("Configuración no encontrada.");
    const hasMovements = (await tx.stockMovement.count({ where: { tenantId: actor.tenantId } })) > 0;
    return { ...s, hasMovements };
  });
}

export const settingsSchema = z.object({
  baseCurrency: z.enum(["USD", "VES"]),
  adjustmentApprovalThreshold: z.union([z.string(), z.number()]),
  allowNegativeStock: z.boolean(),
  mfaRequiredForAll: z.boolean(),
  expiryAlertDays: z.array(z.number().int().min(0).max(365)).max(10),
  alertEmailEnabled: z.boolean(),
});

/** Configuración de la empresa. La moneda base no cambia si ya hay movimientos (rompería la valoración). */
export async function updateTenantSettings(actor: TenantActor, raw: z.input<typeof settingsSchema>) {
  assertPermission(actor, "tenant.settings.manage");
  const input = settingsSchema.parse(raw);
  const threshold = parseQuantity(input.adjustmentApprovalThreshold);
  if (threshold.lessThan(0)) throw validation("El umbral no puede ser negativo.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const before = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: actor.tenantId } });
    if (input.baseCurrency !== before.baseCurrency && (await tx.stockMovement.count({ where: { tenantId: actor.tenantId } })) > 0) {
      throw conflict("No se puede cambiar la moneda base: ya hay inventario valorizado en la moneda actual.");
    }
    const days = [...new Set(input.expiryAlertDays)].sort((a, b) => b - a);
    const after = await tx.tenantSettings.update({
      where: { tenantId: actor.tenantId },
      data: {
        baseCurrency: input.baseCurrency,
        adjustmentApprovalThreshold: threshold.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        allowNegativeStock: input.allowNegativeStock,
        mfaRequiredForAll: input.mfaRequiredForAll,
        expiryAlertDays: days,
        alertEmailEnabled: input.alertEmailEnabled,
      },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "tenant.settings_changed",
      entityType: "TenantSettings",
      entityId: actor.tenantId,
      before: { ...before, createdAt: undefined, updatedAt: undefined },
      after: { ...after, createdAt: undefined, updatedAt: undefined },
      meta: actor.meta,
    });
    return after;
  });
}

const taxSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,16}$/, "Código: letras, números, guion; máx. 16"),
  name: z.string().trim().min(2).max(80),
  rate: z.union([z.string(), z.number()]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Alícuotas configurables por la empresa (no se precargan valores legales). */
export async function createTaxRate(actor: TenantActor, raw: z.input<typeof taxSchema>) {
  assertPermission(actor, "tenant.settings.manage");
  const input = taxSchema.parse(raw);
  const rate = parseQuantity(input.rate);
  if (rate.lessThan(0) || rate.greaterThan(100)) throw validation("El porcentaje debe estar entre 0 y 100.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    try {
      const t = await tx.taxRate.create({
        data: { tenantId: actor.tenantId, code: input.code, name: input.name, rate, validFrom: new Date(`${input.validFrom}T00:00:00Z`) },
      });
      await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: "tax_rate.created", entityType: "TaxRate", entityId: t.id, after: { ...input, rate: rate.toString() }, meta: actor.meta });
      return t;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Ya existe una alícuota con ese código.");
      throw e;
    }
  });
}

export async function setTaxRateActive(actor: TenantActor, taxRateId: string, active: boolean) {
  assertPermission(actor, "tenant.settings.manage");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const res = await tx.taxRate.updateMany({ where: { id: taxRateId, tenantId: actor.tenantId }, data: { active } });
    if (res.count !== 1) throw notFound("Alícuota no encontrada.");
    await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: active ? "tax_rate.activated" : "tax_rate.deactivated", entityType: "TaxRate", entityId: taxRateId, meta: actor.meta });
  });
}

export async function listTaxRates(actor: TenantActor, opts: { activeOnly?: boolean } = {}) {
  assertPermission(actor, "purchases.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.taxRate.findMany({ where: { tenantId: actor.tenantId, ...(opts.activeOnly ? { active: true } : {}) }, orderBy: { code: "asc" } }),
  );
}

/** Datos comerciales del producto: precio de referencia y proveedor preferido. */
export async function updateProductCommercial(
  actor: TenantActor,
  productId: string,
  input: { referencePrice?: string | null; referenceCurrency?: "USD" | "VES" | null; preferredSupplierId?: string | null },
) {
  assertPermission(actor, "products.write");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const p = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId } });
    if (!p) throw notFound("Producto no encontrado.");
    const price = input.referencePrice ? parseQuantity(input.referencePrice) : null;
    if (price && price.lessThan(0)) throw validation("El precio no puede ser negativo.");
    if (input.preferredSupplierId) {
      const s = await tx.supplier.findFirst({ where: { id: input.preferredSupplierId, tenantId: actor.tenantId } });
      if (!s) throw notFound("Proveedor no encontrado.");
    }
    const data = {
      referencePrice: price ? price.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null,
      referenceCurrency: price ? (input.referenceCurrency ?? "USD") : null,
      preferredSupplierId: input.preferredSupplierId || null,
    };
    const updated = await tx.product.update({ where: { id: productId }, data });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "product.price_changed",
      entityType: "Product",
      entityId: productId,
      before: { referencePrice: p.referencePrice, referenceCurrency: p.referenceCurrency, preferredSupplierId: p.preferredSupplierId },
      after: data,
      meta: actor.meta,
    });
    return updated;
  });
}
