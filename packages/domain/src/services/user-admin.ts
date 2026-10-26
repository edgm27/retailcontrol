import { prisma, withContext, withTenant, type Tx } from "@rc/db";
import { conflict, forbidden, notFound, validation } from "../errors";
import { assertPermission, canAssignRole, roleRequiresMfa, type Role } from "../rbac";
import { hashPassword, validatePasswordPolicy } from "../security/password";
import { emailSchema, roleSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { assertCanAddUser, assertTenantWritable } from "./entitlements";
import { enforceRateLimit } from "./rate-limit";
import type { TenantActor } from "./types";

/*
 * Gestión de usuarios por el propietario/administrador de la empresa, SIN invitación:
 * el administrador crea la cuenta con una clave temporal que la persona debe cambiar
 * en su primer ingreso.
 *
 * Una cuenta de usuario es global (puede pertenecer a varias empresas). Para evitar que
 * una empresa tome el control de una cuenta ajena, solo se puede restablecer la clave,
 * restablecer la 2FA o desactivar la cuenta si es "administrada" por esta empresa:
 * la creó esta empresa (managed_by_tenant_id) y la persona no pertenece a ninguna otra.
 */

export interface MemberRow {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  mfaRequired: boolean;
  /** 2FA exigida por el rol o por la configuración de la empresa (no se puede desactivar aquí). */
  mfaRequiredByPolicy: boolean;
  mfaEnrolled: boolean;
  mustChangePassword: boolean;
  managed: boolean;
  isSelf: boolean;
  createdAt: Date;
}

const nameSchema = (v: string | undefined | null) => {
  const t = (v ?? "").trim();
  if (t.length > 120) throw validation("El nombre es demasiado largo.");
  return t || null;
};

function checkTempPassword(password: string, email: string) {
  const p = password.trim();
  const err = validatePasswordPolicy(p, email);
  if (err) throw validation(`Clave temporal: ${err}`);
  return p;
}

/** Membresías del usuario en TODAS las empresas (lectura acotada con el contexto del propio usuario). */
async function otherTenantCount(userId: string, tenantId: string): Promise<number> {
  return withContext({ userId }, (tx) => tx.membership.count({ where: { userId, tenantId: { not: tenantId } } }));
}

async function isManagedBy(userId: string, tenantId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { managedByTenantId: true, platformRole: true } });
  if (!u || u.managedByTenantId !== tenantId || u.platformRole !== "NONE") return false;
  return (await otherTenantCount(userId, tenantId)) === 0;
}

/** Estado de 2FA de los miembros (la tabla mfa_totp solo es visible para su dueño: lectura acotada a ids de miembros). */
async function enrolledUserIds(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await withContext({ platformAdmin: true }, (tx) =>
    tx.mfaTotp.findMany({ where: { userId: { in: userIds }, confirmedAt: { not: null } }, select: { userId: true } }),
  );
  return new Set(rows.map((r) => r.userId));
}

async function loadTarget(tx: Tx, actor: TenantActor, membershipId: string) {
  const m = await tx.membership.findFirst({
    where: { id: membershipId, tenantId: actor.tenantId },
    include: { user: { select: { id: true, email: true, name: true, managedByTenantId: true } } },
  });
  if (!m) throw notFound("Usuario no encontrado.");
  if (!canAssignRole(actor.role, m.role as Role)) throw forbidden("No puede modificar a un usuario con ese rol.");
  return m;
}

async function countActiveOwners(tx: Tx, tenantId: string): Promise<number> {
  await tx.$queryRaw`SELECT id FROM memberships WHERE tenant_id = ${tenantId}::uuid AND role = 'OWNER' AND status = 'ACTIVE' FOR UPDATE`;
  return tx.membership.count({ where: { tenantId, role: "OWNER", status: "ACTIVE" } });
}

export async function listMemberRows(actor: TenantActor): Promise<MemberRow[]> {
  assertPermission(actor, "members.read");
  const { members, mfaForAll } = await withTenant(actor.tenantId, actor.userId, async (tx) => ({
    members: await tx.membership.findMany({
      where: { tenantId: actor.tenantId },
      include: { user: { select: { id: true, email: true, name: true, mustChangePassword: true, managedByTenantId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    mfaForAll: (await tx.tenantSettings.findUnique({ where: { tenantId: actor.tenantId } }))?.mfaRequiredForAll ?? false,
  }));
  const enrolled = await enrolledUserIds(members.map((m) => m.userId));
  const managed = await Promise.all(
    members.map(async (m) => m.user.managedByTenantId === actor.tenantId && (await otherTenantCount(m.userId, actor.tenantId)) === 0),
  );
  return members.map((m, i) => ({
    membershipId: m.id,
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role as Role,
    status: m.status,
    mfaRequired: m.mfaRequired,
    mfaRequiredByPolicy: roleRequiresMfa(m.role as Role, mfaForAll),
    mfaEnrolled: enrolled.has(m.userId),
    mustChangePassword: m.user.mustChangePassword,
    managed: managed[i]!,
    isSelf: m.userId === actor.userId,
    createdAt: m.createdAt,
  }));
}

export async function getMemberRow(actor: TenantActor, membershipId: string): Promise<MemberRow> {
  const row = (await listMemberRows(actor)).find((r) => r.membershipId === membershipId);
  if (!row) throw notFound("Usuario no encontrado.");
  return row;
}

export type CreateMemberResult =
  | { kind: "created"; membershipId: string }
  | { kind: "reactivated"; membershipId: string }
  /** El correo ya tenía cuenta propia: se agregó a la empresa y entra con su clave actual. */
  | { kind: "existing_account"; membershipId: string };

/** Crea un usuario con clave temporal (o agrega a la empresa una cuenta existente). */
export async function createMemberUser(
  actor: TenantActor,
  input: { email: string; name?: string; role: string; tempPassword: string; mfaRequired?: boolean },
): Promise<CreateMemberResult> {
  assertPermission(actor, "members.manage");
  const email = emailSchema.parse(input.email);
  const role = roleSchema.parse(input.role) as Role;
  if (!canAssignRole(actor.role, role)) throw forbidden("No puede asignar ese rol.");
  const name = nameSchema(input.name);
  const password = checkTempPassword(input.tempPassword, email);
  await enforceRateLimit(`member-create:${actor.tenantId}`, 50, 3600);

  const existing = await prisma.user.findUnique({ where: { email } });
  const managed = existing ? await isManagedBy(existing.id, actor.tenantId) : false;
  const passwordHash = !existing || managed ? await hashPassword(password) : null;

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const prior = existing
      ? await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: existing.id } } })
      : null;
    if (prior?.status === "ACTIVE") throw conflict("Ese correo ya es un usuario activo de la empresa.");
    await assertCanAddUser(tx, actor.tenantId);

    let userId: string;
    let kind: CreateMemberResult["kind"];
    if (!existing) {
      const u = await tx.user.create({
        data: {
          email,
          name,
          emailVerified: new Date(),
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
          managedByTenantId: actor.tenantId,
        },
      });
      userId = u.id;
      kind = "created";
    } else if (managed) {
      await tx.user.update({
        where: { id: existing.id },
        data: { name: name ?? existing.name, passwordHash, passwordChangedAt: new Date(), mustChangePassword: true, disabledAt: null },
      });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      userId = existing.id;
      kind = "reactivated";
    } else {
      userId = existing.id;
      kind = "existing_account";
    }

    const membership = prior
      ? await tx.membership.update({ where: { id: prior.id }, data: { status: "ACTIVE", role, mfaRequired: !!input.mfaRequired } })
      : await tx.membership.create({ data: { tenantId: actor.tenantId, userId, role, mfaRequired: !!input.mfaRequired } });
    // Una invitación pendiente al mismo correo ya no hace falta.
    await tx.invitation.updateMany({
      where: { tenantId: actor.tenantId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.user_created",
      entityType: "Membership",
      entityId: membership.id,
      after: { email, role, mfaRequired: !!input.mfaRequired, resultado: kind },
      meta: actor.meta,
    });
    return { kind, membershipId: membership.id };
  });
}

/** Modifica nombre, rol, estado y exigencia de 2FA. */
export async function updateMemberUser(
  actor: TenantActor,
  membershipId: string,
  input: { name?: string; role?: string; status?: "ACTIVE" | "DISABLED"; mfaRequired?: boolean },
) {
  assertPermission(actor, "members.manage");
  const role = input.role ? (roleSchema.parse(input.role) as Role) : undefined;
  if (role && !canAssignRole(actor.role, role)) throw forbidden("No puede asignar ese rol.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const m = await loadTarget(tx, actor, membershipId);
    const self = m.userId === actor.userId;
    if (self && ((role && role !== m.role) || input.status === "DISABLED")) {
      throw validation("No puede cambiar su propio rol ni desactivarse. Pida a otro propietario que lo haga.");
    }
    const losesOwner = m.role === "OWNER" && m.status === "ACTIVE" && ((role && role !== "OWNER") || input.status === "DISABLED");
    if (losesOwner && (await countActiveOwners(tx, actor.tenantId)) <= 1) {
      throw validation("La empresa debe conservar al menos un propietario activo.");
    }
    if (input.status === "ACTIVE" && m.status !== "ACTIVE") await assertCanAddUser(tx, actor.tenantId);

    const before = { role: m.role, status: m.status, mfaRequired: m.mfaRequired, name: m.user.name };
    const updated = await tx.membership.update({
      where: { id: m.id },
      data: {
        ...(role ? { role } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.mfaRequired !== undefined ? { mfaRequired: input.mfaRequired } : {}),
      },
    });
    let name = m.user.name;
    if (input.name !== undefined && m.user.managedByTenantId === actor.tenantId) {
      name = nameSchema(input.name);
      await tx.user.update({ where: { id: m.userId }, data: { name } });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.updated",
      entityType: "Membership",
      entityId: m.id,
      before,
      after: { role: updated.role, status: updated.status, mfaRequired: updated.mfaRequired, name },
      meta: actor.meta,
    });
    return updated;
  });
}

/** Asigna una nueva clave temporal (cuentas administradas por la empresa) y cierra sus sesiones. */
export async function resetMemberPassword(actor: TenantActor, membershipId: string, tempPassword: string) {
  assertPermission(actor, "members.manage");
  const m = await withTenant(actor.tenantId, actor.userId, (tx) => loadTarget(tx, actor, membershipId));
  if (m.userId === actor.userId) throw validation("Cambie su propia clave desde Seguridad.");
  if (!(await isManagedBy(m.userId, actor.tenantId))) {
    throw forbidden("Esta cuenta no es administrada por la empresa (la persona usa su propia cuenta). Solo ella puede cambiar su clave.");
  }
  const passwordHash = await hashPassword(checkTempPassword(tempPassword, m.user.email));
  await withTenant(actor.tenantId, actor.userId, async (tx) => {
    await tx.user.update({ where: { id: m.userId }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true } });
    const revoked = await tx.session.deleteMany({ where: { userId: m.userId } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.password_reset",
      entityType: "Membership",
      entityId: m.id,
      metadata: { sessionsRevoked: revoked.count },
      meta: actor.meta,
    });
  });
}

/**
 * Desactiva la 2FA del usuario: deja de exigirla en la empresa y, si la cuenta es
 * administrada, borra su app vinculada y códigos de recuperación (deberá configurarla
 * de nuevo si se vuelve a exigir). Se cierran sus sesiones.
 */
export async function resetMemberMfa(actor: TenantActor, membershipId: string): Promise<{ factorRemoved: boolean }> {
  assertPermission(actor, "members.manage");
  const m = await withTenant(actor.tenantId, actor.userId, (tx) => loadTarget(tx, actor, membershipId));
  if (m.userId === actor.userId) throw validation("Administre su propia verificación en dos pasos desde Seguridad.");
  const managed = await isManagedBy(m.userId, actor.tenantId);
  if (!managed) {
    throw forbidden("Esta cuenta no es administrada por la empresa. La persona debe desactivar su 2FA desde Seguridad.");
  }
  const removed = await withContext({ platformAdmin: true }, async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId: m.userId } });
    return (await tx.mfaTotp.deleteMany({ where: { userId: m.userId } })).count > 0;
  });
  await withTenant(actor.tenantId, actor.userId, async (tx) => {
    await tx.membership.update({ where: { id: m.id }, data: { mfaRequired: false } });
    const revoked = await tx.session.deleteMany({ where: { userId: m.userId } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.mfa_reset",
      entityType: "Membership",
      entityId: m.id,
      metadata: { factorRemoved: removed, sessionsRevoked: revoked.count },
      meta: actor.meta,
    });
  });
  return { factorRemoved: removed };
}

/**
 * Elimina al usuario de la empresa. Su historial (movimientos, auditoría) se conserva.
 * Si la cuenta era administrada por la empresa, además queda deshabilitada y sin clave.
 */
export async function removeMemberUser(actor: TenantActor, membershipId: string): Promise<{ accountDisabled: boolean }> {
  assertPermission(actor, "members.manage");
  const pre = await withTenant(actor.tenantId, actor.userId, (tx) => loadTarget(tx, actor, membershipId));
  if (pre.userId === actor.userId) throw validation("No puede eliminarse a sí mismo.");
  const managed = await isManagedBy(pre.userId, actor.tenantId);
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const m = await loadTarget(tx, actor, membershipId);
    if (m.role === "OWNER" && m.status === "ACTIVE" && (await countActiveOwners(tx, actor.tenantId)) <= 1) {
      throw validation("La empresa debe conservar al menos un propietario activo.");
    }
    await tx.membership.delete({ where: { id: m.id } });
    if (managed) {
      await tx.user.update({ where: { id: m.userId }, data: { disabledAt: new Date(), passwordHash: null, mustChangePassword: false } });
      await tx.session.deleteMany({ where: { userId: m.userId } });
    } else {
      await tx.session.updateMany({ where: { userId: m.userId, activeTenantId: actor.tenantId }, data: { activeTenantId: null } });
    }
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.removed",
      entityType: "Membership",
      entityId: m.id,
      before: { email: m.user.email, role: m.role, status: m.status },
      metadata: { accountDisabled: managed },
      meta: actor.meta,
    });
    return { accountDisabled: managed };
  });
}
