import { prisma, withContext } from "@rc/db";
import { DomainError, forbidden, validation } from "../errors";
import { randomToken } from "../security/crypto";
import {
  getDummyPasswordHash,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "../security/password";
import { emailSchema } from "../validation/schemas";
import { recordAudit } from "./audit";
import { hitRateLimit } from "./rate-limit";
import type { RequestMeta, UserActor } from "./types";

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const GENERIC = "Correo o contraseña incorrectos.";

/**
 * Verifica correo + contraseña. Mensaje genérico (no revela si el correo existe),
 * tiempo similar en ambos casos y límites por correo y por IP.
 * Devuelve el id de usuario; el segundo factor se exige después si está activo.
 */
export async function authenticateWithPassword(
  emailInput: string,
  password: string,
  meta: RequestMeta = {},
): Promise<{ userId: string }> {
  const email = emailSchema.safeParse(emailInput);
  if (!email.success || !password) throw new DomainError("UNAUTHENTICATED", GENERIC);

  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(`pwd-login:${email.data}`, 15 * 60),
    hitRateLimit(`pwd-login-ip:${meta.ipAddress ?? "desconocida"}`, 15 * 60),
  ]);
  if (byEmail > 10 || byIp > 50) {
    throw new DomainError("RATE_LIMITED", "Demasiados intentos. Espere 15 minutos o entre con un enlace por correo.");
  }

  const user = await prisma.user.findUnique({
    where: { email: email.data },
    select: { id: true, passwordHash: true, disabledAt: true },
  });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()));

  if (!user || !user.passwordHash || !ok || user.disabledAt) {
    if (user) {
      await withContext({ userId: user.id }, (tx) =>
        recordAudit(tx, {
          tenantId: null,
          actorUserId: user.id,
          action: "auth.password_failed",
          entityType: "User",
          entityId: user.id,
          meta,
        }),
      );
    }
    throw new DomainError("UNAUTHENTICATED", GENERIC);
  }

  await withContext({ userId: user.id }, (tx) =>
    recordAudit(tx, {
      tenantId: null,
      actorUserId: user.id,
      action: "auth.signed_in",
      entityType: "User",
      entityId: user.id,
      metadata: { provider: "password" },
      meta,
    }),
  );
  return { userId: user.id };
}

/** Crea una sesión en BD compatible con Auth.js (misma tabla, misma cookie). */
export async function createUserSession(userId: string, meta: RequestMeta = {}) {
  const sessionToken = randomToken(32);
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { sessionToken, expires };
}

export async function userHasPassword(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return !!u?.passwordHash;
}

/**
 * Define o cambia la contraseña. Si ya tenía una, exige la actual.
 * Cierra las demás sesiones del usuario por seguridad.
 */
export async function setPassword(
  actor: UserActor & { sessionId: string },
  input: { current?: string; next: string; confirm: string },
): Promise<{ otherSessionsRevoked: number }> {
  if (input.next !== input.confirm) throw validation("La confirmación no coincide con la nueva contraseña.");
  const policy = validatePasswordPolicy(input.next, actor.email);
  if (policy) throw validation(policy);

  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
  if (!user) throw forbidden();
  if (user.passwordHash) {
    if (!input.current || !(await verifyPassword(input.current, user.passwordHash))) {
      throw validation("La contraseña actual no es correcta.");
    }
  }
  const passwordHash = await hashPassword(input.next);
  return withContext({ userId: actor.userId }, async (tx) => {
    await tx.user.update({ where: { id: actor.userId }, data: { passwordHash, passwordChangedAt: new Date() } });
    const revoked = await tx.session.deleteMany({ where: { userId: actor.userId, id: { not: actor.sessionId } } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: user.passwordHash ? "auth.password_changed" : "auth.password_set",
      entityType: "User",
      entityId: actor.userId,
      metadata: { otherSessionsRevoked: revoked.count },
      meta: actor.meta,
    });
    return { otherSessionsRevoked: revoked.count };
  });
}

/**
 * Administrador inicial para pruebas (se ejecuta al desplegar).
 * - Si no existe: crea el usuario con su empresa de pruebas (Propietario).
 * - Si existe SIN contraseña (p. ej. entró antes con Google/enlace): le asigna la inicial.
 * - Si existe CON contraseña: no la toca, salvo `resetPassword` (ADMIN_RESET_PASSWORD=true),
 *   que la restablece, cierra sus sesiones y queda auditado.
 * Nunca registra la contraseña.
 */
export type BootstrapResult =
  | { status: "created"; userId: string; tenantId: string }
  | { status: "password_set" | "password_reset" | "unchanged"; userId: string; tenantId?: string };

export async function ensureBootstrapAdmin(input: {
  email: string;
  password: string;
  name?: string;
  companyName?: string;
  resetPassword?: boolean;
}): Promise<BootstrapResult> {
  const email = emailSchema.parse(input.email.trim());
  const password = input.password.trim(); // espacios al pegar en el panel = casi siempre accidentales
  const policy = validatePasswordPolicy(password, email);
  if (policy) throw validation(`ADMIN_INITIAL_PASSWORD: ${policy}`);

  const { createTenantWithOwner, listUserTenants } = await import("./tenants");
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name ?? "Administrador",
        emailVerified: new Date(),
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
      },
    });
    const { tenant } = await createTenantWithOwner(
      { userId: user.id, email },
      { name: input.companyName ?? "Empresa de pruebas" },
      { planCode: "PROFESIONAL", trialDays: 30 },
    );
    return { status: "created", userId: user.id, tenantId: tenant.id };
  }

  // Asegura que tenga al menos una empresa donde entrar.
  let tenantId = (await listUserTenants(existing.id))[0]?.tenantId;
  if (!tenantId) {
    tenantId = (
      await createTenantWithOwner(
        { userId: existing.id, email },
        { name: input.companyName ?? "Empresa de pruebas" },
        { planCode: "PROFESIONAL", trialDays: 30 },
      )
    ).tenant.id;
  }

  const action = !existing.passwordHash ? "password_set" : input.resetPassword ? "password_reset" : "unchanged";
  if (action === "unchanged") return { status: "unchanged", userId: existing.id, tenantId };

  const passwordHash = await hashPassword(password);
  await withContext({ userId: existing.id }, async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: { passwordHash, passwordChangedAt: new Date(), disabledAt: null },
    });
    const revoked = action === "password_reset" ? await tx.session.deleteMany({ where: { userId: existing.id } }) : { count: 0 };
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: existing.id,
      action: action === "password_reset" ? "auth.admin_password_reset_by_deploy" : "auth.admin_password_set_by_deploy",
      entityType: "User",
      entityId: existing.id,
      metadata: { origen: "despliegue", sessionsRevoked: revoked.count },
    });
  });
  return { status: action, userId: existing.id, tenantId };
}
