import { Prisma, withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, notFound } from "../../errors";
import { assertPermission } from "../../rbac";
import { rifSchema } from "../../validation/schemas";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import type { TenantActor } from "../types";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: opt(200),
  rif: rifSchema.optional().transform((v) => v ?? null),
  contactName: opt(120),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(254).optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  phone: opt(40),
  address: opt(300),
  paymentTermsDays: z.union([z.number(), z.string()]).optional().transform((v) => (v === undefined || v === "" ? null : Number(v))).pipe(z.number().int().min(0).max(365).nullable()),
  notes: opt(500),
});

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createSupplier(actor: TenantActor, raw: z.input<typeof supplierSchema>) {
  assertPermission(actor, "suppliers.write");
  const data = supplierSchema.parse(raw);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    try {
      const s = await tx.supplier.create({ data: { tenantId: actor.tenantId, ...data } });
      await recordAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, action: "supplier.created", entityType: "Supplier", entityId: s.id, after: data, meta: actor.meta });
      return s;
    } catch (e) {
      if (isUnique(e)) throw conflict("Ya existe un proveedor con ese RIF.");
      throw e;
    }
  });
}

export async function updateSupplier(actor: TenantActor, supplierId: string, raw: z.input<typeof supplierSchema> & { active?: boolean }) {
  assertPermission(actor, "suppliers.write");
  const data = supplierSchema.parse(raw);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const before = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: actor.tenantId } });
    if (!before) throw notFound("Proveedor no encontrado.");
    try {
      const s = await tx.supplier.update({ where: { id: supplierId }, data: { ...data, active: raw.active ?? before.active } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "supplier.updated",
        entityType: "Supplier",
        entityId: s.id,
        before: { name: before.name, rif: before.rif, active: before.active },
        after: { ...data, active: s.active },
        meta: actor.meta,
      });
      return s;
    } catch (e) {
      if (isUnique(e)) throw conflict("Ya existe un proveedor con ese RIF.");
      throw e;
    }
  });
}

export async function listSuppliers(actor: TenantActor, opts: { search?: string; includeInactive?: boolean } = {}) {
  assertPermission(actor, "suppliers.read");
  const q = opts.search?.trim();
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.supplier.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(opts.includeInactive ? {} : { active: true }),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { rif: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { name: "asc" },
      take: 500,
    }),
  );
}
