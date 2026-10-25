import { Prisma, withTenant } from "@rc/db";
import { conflict, notFound } from "../errors";
import { assertPermission } from "../rbac";
import { createProductSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { assertTenantWritable } from "./entitlements";
import type { TenantActor } from "./types";

/**
 * Catálogo mínimo de Fase 1 (SKU + nombre + estado). Fase 2 añade unidades,
 * códigos de barra, variantes, categorías, precios e importación CSV.
 * Los productos no se borran: se inactivan para preservar el historial.
 */
export async function createProduct(actor: TenantActor, input: { sku: string; name: string }) {
  assertPermission(actor, "products.write");
  const data = createProductSchema.parse(input);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    try {
      const p = await tx.product.create({ data: { tenantId: actor.tenantId, ...data } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "product.created",
        entityType: "Product",
        entityId: p.id,
        after: data,
        meta: actor.meta,
      });
      return p;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("Ya existe un producto con ese SKU en su empresa.");
      }
      throw e;
    }
  });
}

export async function listProducts(
  actor: TenantActor,
  opts: { search?: string; page?: number; pageSize?: number } = {},
) {
  assertPermission(actor, "products.read");
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const q = opts.search?.trim();
  const where: Prisma.ProductWhereInput = {
    tenantId: actor.tenantId,
    ...(q
      ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.product.findMany({ where, orderBy: { sku: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      tx.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });
}

export async function getProductBySku(actor: TenantActor, sku: string) {
  assertPermission(actor, "products.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.product.findUnique({ where: { tenantId_sku: { tenantId: actor.tenantId, sku: sku.trim().toUpperCase() } } }),
  );
}

export async function renameProduct(actor: TenantActor, productId: string, name: string) {
  assertPermission(actor, "products.write");
  const parsed = createProductSchema.shape.name.parse(name);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const before = await tx.product.findFirst({ where: { id: productId, tenantId: actor.tenantId } });
    if (!before) throw notFound("Producto no encontrado.");
    const res = await tx.product.updateMany({
      where: { id: productId, tenantId: actor.tenantId },
      data: { name: parsed },
    });
    if (res.count !== 1) throw notFound("Producto no encontrado.");
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "product.updated",
      entityType: "Product",
      entityId: productId,
      before: { name: before.name },
      after: { name: parsed },
      meta: actor.meta,
    });
  });
}

export async function setProductStatus(actor: TenantActor, productId: string, status: "ACTIVE" | "INACTIVE") {
  assertPermission(actor, "products.write");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const res = await tx.product.updateMany({ where: { id: productId, tenantId: actor.tenantId }, data: { status } });
    if (res.count !== 1) throw notFound("Producto no encontrado.");
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "product.status_changed",
      entityType: "Product",
      entityId: productId,
      after: { status },
      meta: actor.meta,
    });
  });
}
