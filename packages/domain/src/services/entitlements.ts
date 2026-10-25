import type { Tx } from "@rc/db";
import { limitExceeded, readOnly } from "../errors";
import { subscriptionAccessMode } from "./subscription-access";

export interface TenantLimits {
  planCode: string;
  maxUsers: number | null;
  maxBranches: number | null;
}

/**
 * Toma un candado transaccional (pg_advisory_xact_lock) por empresa para
 * serializar las verificaciones de cuota: dos invitaciones o sucursales
 * simultáneas no pueden superar el límite. Se libera al terminar la transacción.
 */
async function lockSubscription(tx: Tx, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"quota:" + tenantId}, 0))`;
  return tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
}

export async function getTenantLimits(tx: Tx, tenantId: string): Promise<TenantLimits | null> {
  const sub = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!sub) return null;
  return {
    planCode: sub.plan.code,
    maxUsers: sub.maxUsersOverride ?? sub.plan.maxUsers,
    maxBranches: sub.maxBranchesOverride ?? sub.plan.maxBranches,
  };
}

export async function assertTenantWritable(tx: Tx, tenantId: string, now = new Date()): Promise<void> {
  const sub = await tx.subscription.findUnique({ where: { tenantId } });
  if (subscriptionAccessMode(sub, now) !== "full") throw readOnly();
}

/** Usuarios = membresías activas + invitaciones vigentes pendientes. */
export async function assertCanAddUser(
  tx: Tx,
  tenantId: string,
  opts: { excludeInvitationId?: string } = {},
): Promise<void> {
  const sub = await lockSubscription(tx, tenantId);
  if (subscriptionAccessMode(sub) !== "full") throw readOnly();
  const max = sub!.maxUsersOverride ?? sub!.plan.maxUsers;
  if (max == null) return;
  const [members, pending] = await Promise.all([
    tx.membership.count({ where: { tenantId, status: "ACTIVE" } }),
    tx.invitation.count({
      where: {
        tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(opts.excludeInvitationId ? { id: { not: opts.excludeInvitationId } } : {}),
      },
    }),
  ]);
  if (members + pending >= max) {
    throw limitExceeded(
      `Su plan permite hasta ${max} usuario(s). Actualice el plan para agregar más.`,
      { resource: "users", max, used: members + pending },
    );
  }
}

export async function assertCanAddBranch(tx: Tx, tenantId: string): Promise<void> {
  const sub = await lockSubscription(tx, tenantId);
  if (subscriptionAccessMode(sub) !== "full") throw readOnly();
  const max = sub!.maxBranchesOverride ?? sub!.plan.maxBranches;
  if (max == null) return;
  const used = await tx.branch.count({ where: { tenantId, active: true } });
  if (used >= max) {
    throw limitExceeded(
      `Su plan permite hasta ${max} sucursal(es). Actualice el plan para agregar más.`,
      { resource: "branches", max, used },
    );
  }
}
