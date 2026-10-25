import { prisma, withContext } from "@rc/db";
import { forbidden, notFound } from "../errors";
import { recordAudit } from "./audit";
import { resolveTenantAccess } from "./tenants";
import type { UserActor } from "./types";

export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expires: { gt: new Date() } },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expires: true,
      userAgent: true,
      ipAddress: true,
      mfaVerifiedAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeSession(actor: UserActor, sessionId: string): Promise<void> {
  await withContext({ userId: actor.userId }, async (tx) => {
    const res = await tx.session.deleteMany({ where: { id: sessionId, userId: actor.userId } });
    if (res.count !== 1) throw notFound("Sesión no encontrada.");
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "session.revoked",
      entityType: "Session",
      entityId: sessionId,
      meta: actor.meta,
    });
  });
}

export async function revokeOtherSessions(actor: UserActor, currentSessionId: string): Promise<number> {
  return withContext({ userId: actor.userId }, async (tx) => {
    const res = await tx.session.deleteMany({ where: { userId: actor.userId, id: { not: currentSessionId } } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "session.revoked_others",
      entityType: "User",
      entityId: actor.userId,
      metadata: { count: res.count },
      meta: actor.meta,
    });
    return res.count;
  });
}

export async function revokeAllSessions(actor: UserActor): Promise<number> {
  return withContext({ userId: actor.userId }, async (tx) => {
    const res = await tx.session.deleteMany({ where: { userId: actor.userId } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "session.revoked_all",
      entityType: "User",
      entityId: actor.userId,
      metadata: { count: res.count },
      meta: actor.meta,
    });
    return res.count;
  });
}

/** Cambia la empresa activa de la sesión tras verificar la membresía. */
export async function setActiveTenant(userId: string, sessionId: string, tenantId: string): Promise<void> {
  const access = await resolveTenantAccess(userId, tenantId);
  if (!access) throw forbidden("No pertenece a esa empresa.");
  const res = await prisma.session.updateMany({
    where: { id: sessionId, userId },
    data: { activeTenantId: tenantId },
  });
  if (res.count !== 1) throw notFound("Sesión no encontrada.");
}

/** Actualiza last_seen como máximo una vez por minuto (evita escrituras por request). */
export async function touchSession(sessionId: string, meta: { ipAddress?: string | null; userAgent?: string | null }) {
  await prisma.session.updateMany({
    where: { id: sessionId, lastSeenAt: { lt: new Date(Date.now() - 60_000) } },
    data: { lastSeenAt: new Date(), ipAddress: meta.ipAddress ?? undefined, userAgent: meta.userAgent?.slice(0, 300) },
  });
}
