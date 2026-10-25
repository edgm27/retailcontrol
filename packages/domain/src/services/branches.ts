import { Prisma, withTenant } from "@rc/db";
import { conflict, forbidden, notFound } from "../errors";
import { assertPermission, canAccessBranch } from "../rbac";
import { createBranchSchema, createWarehouseSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { assertCanAddBranch, assertTenantWritable } from "./entitlements";
import type { TenantActor } from "./types";

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function listBranches(actor: TenantActor) {
  assertPermission(actor, "branches.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.branch.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(actor.branchIds.length ? { id: { in: [...actor.branchIds] } } : {}),
      },
      include: { warehouses: { orderBy: { code: "asc" } } },
      orderBy: { code: "asc" },
    }),
  );
}

export async function createBranch(actor: TenantActor, input: { code: string; name: string; address?: string }) {
  assertPermission(actor, "branches.manage");
  if (actor.branchIds.length) throw forbidden("Su acceso está limitado a sucursales específicas.");
  const data = createBranchSchema.parse(input);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertCanAddBranch(tx, actor.tenantId);
    try {
      const branch = await tx.branch.create({ data: { tenantId: actor.tenantId, ...data } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "branch.created",
        entityType: "Branch",
        entityId: branch.id,
        after: data,
        meta: actor.meta,
      });
      return branch;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("Ya existe una sucursal con ese código.");
      throw e;
    }
  });
}

export async function createWarehouse(actor: TenantActor, input: { branchId: string; code: string; name: string }) {
  const data = createWarehouseSchema.parse(input);
  assertPermission(actor, "branches.manage", { branchId: data.branchId });
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const branch = await tx.branch.findFirst({ where: { id: data.branchId, tenantId: actor.tenantId } });
    if (!branch || !canAccessBranch(actor, branch.id)) throw notFound("Sucursal no encontrada.");
    try {
      const wh = await tx.warehouse.create({ data: { tenantId: actor.tenantId, ...data } });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "warehouse.created",
        entityType: "Warehouse",
        entityId: wh.id,
        after: data,
        meta: actor.meta,
      });
      return wh;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("Ya existe un almacén con ese código.");
      throw e;
    }
  });
}
