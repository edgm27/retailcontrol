import { withTenant } from "@rc/db";
import { assertPermission } from "../rbac";
import type { TenantActor } from "./types";

export async function listAuditEvents(actor: TenantActor, opts: { page?: number; pageSize?: number } = {}) {
  assertPermission(actor, "audit.read");
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.auditEvent.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.auditEvent.count({ where: { tenantId: actor.tenantId } }),
    ]);
    return { items, total, page, pageSize };
  });
}
