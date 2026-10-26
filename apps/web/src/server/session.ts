import "server-only";
import { prisma } from "@rc/db";
import {
  getMfaStatus,
  hasPermission,
  listUserTenants,
  resolveTenantAccess,
  setActiveTenant,
  touchSession,
  type Permission,
  type RequestMeta,
  type ResolvedTenantAccess,
  type TenantActor,
  type UserActor,
} from "@rc/domain";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;

export interface SessionContext {
  sessionId: string;
  userId: string;
  email: string;
  name: string | null;
  platformRole: "NONE" | "SUPPORT" | "SUPERADMIN";
  mfaVerified: boolean;
  activeTenantId: string | null;
  /** Clave temporal asignada por un administrador: debe cambiarse antes de seguir. */
  mustChangePassword: boolean;
}

export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: fwd || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
    correlationId: h.get("x-correlation-id"),
  };
});

/**
 * Lee la sesión directamente de la base de datos en cada petición: una sesión
 * revocada (fila borrada) deja de funcionar de inmediato.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const jar = await cookies();
  const token = SESSION_COOKIES.map((n) => jar.get(n)?.value).find(Boolean);
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { sessionToken: token }, include: { user: true } });
  if (!s || s.expires.getTime() <= Date.now() || s.user.disabledAt) return null;
  const meta = await getRequestMeta();
  await touchSession(s.id, meta).catch(() => undefined);
  return {
    sessionId: s.id,
    userId: s.userId,
    email: s.user.email,
    name: s.user.name,
    platformRole: s.user.platformRole,
    mfaVerified: s.mfaVerifiedAt !== null,
    activeTenantId: s.activeTenantId,
    mustChangePassword: s.user.mustChangePassword,
  };
});

export async function toUserActor(s: SessionContext): Promise<UserActor> {
  return { userId: s.userId, email: s.email, meta: await getRequestMeta() };
}

/** Requiere sesión válida (sin exigir aún el segundo factor). */
export async function requireSession(): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export interface VerifiedUser extends SessionContext {
  mfaEnrolled: boolean;
}

/**
 * Requiere sesión y segundo factor satisfecho:
 * - Si el usuario tiene MFA configurado, la sesión debe estar verificada.
 * - Los roles de plataforma deben tener MFA configurado siempre.
 */
export async function requireVerifiedUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<VerifiedUser> {
  const s = await requireSession();
  const mfa = await getMfaStatus(s.userId);
  if (mfa.enrolled && !s.mfaVerified) redirect("/mfa/verificar");
  if (s.mustChangePassword && !opts.allowPendingPasswordChange) redirect("/cuenta/cambiar-clave");
  if (!mfa.enrolled && s.platformRole !== "NONE") redirect("/mfa/configurar?motivo=plataforma");
  return { ...s, mfaEnrolled: mfa.enrolled };
}

export interface TenantContext {
  user: VerifiedUser;
  access: ResolvedTenantAccess;
  actor: TenantActor;
}

/**
 * Contexto de empresa autorizado. La empresa activa se guarda en la fila de
 * sesión (servidor) y SIEMPRE se revalida contra la membresía activa.
 */
export async function requireTenant(permission?: Permission): Promise<TenantContext> {
  const user = await requireVerifiedUser();
  let tenantId = user.activeTenantId;
  if (!tenantId) {
    const tenants = await listUserTenants(user.userId);
    if (tenants.length === 0) redirect("/onboarding");
    if (tenants.length > 1) redirect("/empresas");
    tenantId = tenants[0]!.tenantId;
    await setActiveTenant(user.userId, user.sessionId, tenantId);
  }
  const access = await resolveTenantAccess(user.userId, tenantId);
  if (!access) {
    await prisma.session.updateMany({ where: { id: user.sessionId }, data: { activeTenantId: null } });
    redirect("/empresas");
  }
  if (access.mfaRequired && !user.mfaEnrolled) redirect("/mfa/configurar?motivo=rol");
  if (permission && !hasPermission(access.role, permission)) redirect("/app?error=permiso");
  const actor: TenantActor = {
    userId: user.userId,
    email: user.email,
    tenantId: access.tenantId,
    membershipId: access.membershipId,
    role: access.role,
    branchIds: access.branchIds,
    meta: await getRequestMeta(),
  };
  return { user, access, actor };
}
