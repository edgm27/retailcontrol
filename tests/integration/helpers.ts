import { randomUUID } from "node:crypto";
import { prisma, withContext } from "@rc/db";
import {
  createTenantWithOwner,
  resolveTenantAccess,
  type TenantActor,
  type UserActor,
} from "@rc/domain";

export async function createUser(prefix = "usuario"): Promise<UserActor & { id: string }> {
  const email = `${prefix}.${randomUUID().slice(0, 8)}@example.com`;
  const u = await prisma.user.create({ data: { email, name: prefix, emailVerified: new Date() } });
  return { id: u.id, userId: u.id, email };
}

export async function createSession(userId: string) {
  return prisma.session.create({
    data: { userId, sessionToken: randomUUID(), expires: new Date(Date.now() + 3_600_000) },
  });
}

export async function createCompany(owner: UserActor, planCode = "BASICO", name = "Empresa de prueba") {
  return createTenantWithOwner(owner, { name }, { planCode });
}

/** Construye el actor como lo haría el servidor: SOLO a partir de la membresía. */
export async function actorFor(user: UserActor, tenantId: string): Promise<TenantActor> {
  const access = await resolveTenantAccess(user.userId, tenantId);
  if (!access) throw new Error("Sin acceso a la empresa");
  return {
    userId: user.userId,
    email: user.email,
    tenantId,
    membershipId: access.membershipId,
    role: access.role,
    branchIds: access.branchIds,
  };
}

/** Agrega un miembro directamente (atajo de prueba, con contexto de la empresa). */
export async function addMember(tenantId: string, user: UserActor, role: TenantActor["role"]) {
  return withContext({ tenantId }, (tx) => tx.membership.create({ data: { tenantId, userId: user.userId, role } }));
}

/** Cambia la suscripción con contexto de plataforma (como haría el panel superadmin). */
export async function setSubscription(
  tenantId: string,
  data: { status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED"; planCode?: string; trialEndsAt?: Date | null; graceEndsAt?: Date | null },
) {
  await withContext({ platformAdmin: true }, async (tx) => {
    const plan = data.planCode ? await tx.plan.findUniqueOrThrow({ where: { code: data.planCode } }) : null;
    await tx.subscription.update({
      where: { tenantId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(plan ? { planId: plan.id } : {}),
        ...(data.trialEndsAt !== undefined ? { trialEndsAt: data.trialEndsAt } : {}),
        ...(data.graceEndsAt !== undefined ? { graceEndsAt: data.graceEndsAt } : {}),
      },
    });
  });
}
