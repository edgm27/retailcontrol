import { withContext, withTenant, type Tx } from "@rc/db";
import { conflict, forbidden, notFound, validation } from "../errors";
import { assertPermission, canAssignRole, type Role } from "../rbac";
import { randomToken, sha256Hex } from "../security/crypto";
import { inviteMemberSchema, roleSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { assertCanAddUser, assertTenantWritable } from "./entitlements";
import { enforceRateLimit } from "./rate-limit";
import type { TenantActor, UserActor } from "./types";

export const INVITATION_TTL_HOURS = 72;

export async function listMembers(actor: TenantActor) {
  assertPermission(actor, "members.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.membership.findMany({
      where: { tenantId: actor.tenantId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function listPendingInvitations(actor: TenantActor) {
  assertPermission(actor, "members.read");
  return withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.invitation.findMany({
      where: { tenantId: actor.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

/**
 * Crea una invitación. Devuelve el token en claro UNA vez (para el enlace);
 * en base de datos solo queda su hash SHA-256.
 */
export async function inviteMember(
  actor: TenantActor,
  input: { email: string; role: Role },
  now = new Date(),
): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
  assertPermission(actor, "members.manage");
  const data = inviteMemberSchema.parse(input);
  if (!canAssignRole(actor.role, data.role)) {
    throw forbidden("No puede asignar ese rol.");
  }
  await enforceRateLimit(`invite:${actor.tenantId}`, 50, 3600);

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const existing = await tx.membership.findFirst({
      where: { tenantId: actor.tenantId, status: "ACTIVE", user: { email: data.email } },
    });
    if (existing) throw conflict("Ese correo ya pertenece a un miembro activo.");

    // Una invitación vigente por correo: se revoca la anterior.
    await tx.invitation.updateMany({
      where: { tenantId: actor.tenantId, email: data.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await assertCanAddUser(tx, actor.tenantId);

    const token = randomToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000);
    const inv = await tx.invitation.create({
      data: {
        tenantId: actor.tenantId,
        email: data.email,
        role: data.role,
        tokenHash: sha256Hex(token),
        invitedById: actor.userId,
        expiresAt,
      },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.invited",
      entityType: "Invitation",
      entityId: inv.id,
      after: { email: data.email, role: data.role, expiresAt },
      meta: actor.meta,
    });
    return { invitationId: inv.id, token, expiresAt };
  });
}

export async function revokeInvitation(actor: TenantActor, invitationId: string) {
  assertPermission(actor, "members.manage");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const res = await tx.invitation.updateMany({
      where: { id: invitationId, tenantId: actor.tenantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count !== 1) throw notFound("Invitación no encontrada.");
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.invitation_revoked",
      entityType: "Invitation",
      entityId: invitationId,
      meta: actor.meta,
    });
  });
}

/**
 * Acepta una invitación. El token debe corresponder a una invitación dirigida
 * al MISMO correo verificado del usuario autenticado.
 */
export async function acceptInvitation(
  actor: UserActor,
  token: string,
  now = new Date(),
): Promise<{ tenantId: string; role: Role }> {
  await enforceRateLimit(`invite-accept:${actor.userId}`, 20, 3600);
  const tokenHash = sha256Hex(token);
  const email = actor.email.trim().toLowerCase();

  // 1) Buscar la invitación: RLS solo deja ver invitaciones dirigidas al correo del usuario.
  const inv = await withContext({ userId: actor.userId, userEmail: email }, (tx) =>
    tx.invitation.findUnique({ where: { tokenHash } }),
  );
  if (!inv || inv.email !== email) throw notFound("Invitación no válida para esta cuenta.");
  if (inv.revokedAt || inv.acceptedAt) throw conflict("La invitación ya no está disponible.");
  if (inv.expiresAt.getTime() < now.getTime()) throw conflict("La invitación expiró.");

  // 2) Aplicar dentro del contexto de la empresa que invita.
  return withContext({ tenantId: inv.tenantId, userId: actor.userId, userEmail: email }, async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) throw conflict("La invitación ya no está disponible.");
    await assertCanAddUser(tx, inv.tenantId, { excludeInvitationId: inv.id });

    const existing = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: inv.tenantId, userId: actor.userId } },
    });
    if (existing?.status === "ACTIVE") throw conflict("Ya es miembro de esta empresa.");
    const membership = existing
      ? await tx.membership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role: inv.role } })
      : await tx.membership.create({ data: { tenantId: inv.tenantId, userId: actor.userId, role: inv.role } });

    await recordAudit(tx, {
      tenantId: inv.tenantId,
      actorUserId: actor.userId,
      action: "member.joined",
      entityType: "Membership",
      entityId: membership.id,
      after: { role: inv.role, invitationId: inv.id },
      meta: actor.meta,
    });
    return { tenantId: inv.tenantId, role: inv.role as Role };
  });
}

async function countActiveOwners(tx: Tx, tenantId: string): Promise<number> {
  // Bloquea las membresías de propietario para evitar dejar la empresa sin dueño
  // por cambios concurrentes.
  await tx.$queryRaw`SELECT id FROM memberships WHERE tenant_id = ${tenantId}::uuid AND role = 'OWNER' AND status = 'ACTIVE' FOR UPDATE`;
  return tx.membership.count({ where: { tenantId, role: "OWNER", status: "ACTIVE" } });
}

export async function changeMemberRole(actor: TenantActor, membershipId: string, newRole: Role) {
  assertPermission(actor, "members.manage");
  const role = roleSchema.parse(newRole);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const target = await tx.membership.findFirst({ where: { id: membershipId, tenantId: actor.tenantId } });
    if (!target) throw notFound("Miembro no encontrado.");
    if (target.role === role) return target;
    // Para tocar a un propietario o crear uno, hay que ser propietario.
    if (!canAssignRole(actor.role, role) || !canAssignRole(actor.role, target.role as Role)) {
      throw forbidden("No puede modificar ese rol.");
    }
    if (target.role === "OWNER" && target.status === "ACTIVE" && (await countActiveOwners(tx, actor.tenantId)) <= 1) {
      throw validation("La empresa debe conservar al menos un propietario activo.");
    }
    const updated = await tx.membership.update({ where: { id: target.id }, data: { role } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.role_changed",
      entityType: "Membership",
      entityId: target.id,
      before: { role: target.role },
      after: { role },
      meta: actor.meta,
    });
    return updated;
  });
}

export async function setMemberStatus(actor: TenantActor, membershipId: string, status: "ACTIVE" | "DISABLED") {
  assertPermission(actor, "members.manage");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const target = await tx.membership.findFirst({ where: { id: membershipId, tenantId: actor.tenantId } });
    if (!target) throw notFound("Miembro no encontrado.");
    if (target.status === status) return target;
    if (!canAssignRole(actor.role, target.role as Role)) throw forbidden("No puede modificar ese miembro.");
    if (status === "DISABLED" && target.role === "OWNER" && (await countActiveOwners(tx, actor.tenantId)) <= 1) {
      throw validation("La empresa debe conservar al menos un propietario activo.");
    }
    if (status === "ACTIVE") await assertCanAddUser(tx, actor.tenantId);
    const updated = await tx.membership.update({ where: { id: target.id }, data: { status } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: status === "DISABLED" ? "member.disabled" : "member.enabled",
      entityType: "Membership",
      entityId: target.id,
      before: { status: target.status },
      after: { status },
      meta: actor.meta,
    });
    return updated;
  });
}
