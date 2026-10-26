import { randomUUID } from "node:crypto";
import { withContext, type Tenant } from "@rc/db";
import { validation } from "../errors";
import { roleRequiresMfa, type Role } from "../rbac";
import { createTenantSchema, type CreateTenantInput } from "../validation/schemas";
import { recordAudit } from "./audit";
import { enforceRateLimit } from "./rate-limit";
import { subscriptionAccessMode, type AccessMode } from "./subscription-access";
import type { UserActor } from "./types";

export const DEFAULT_TRIAL_DAYS = 14;
export const DEFAULT_PLAN_CODE = "BASICO";

export interface CreatedTenant {
  tenant: Tenant;
  membershipId: string;
  branchId: string;
  warehouseId: string;
}

/**
 * Onboarding autoservicio: crea empresa, configuración, membresía de
 * propietario, suscripción de prueba, sucursal y almacén principales.
 * Todo en una transacción; el contexto RLS se fija con el id nuevo.
 */
export async function createTenantWithOwner(
  actor: UserActor,
  input: CreateTenantInput,
  opts: { planCode?: string; trialDays?: number; now?: Date } = {},
): Promise<CreatedTenant> {
  const data = createTenantSchema.parse(input);
  await enforceRateLimit(`tenant-create:${actor.userId}`, 5, 24 * 3600);
  const now = opts.now ?? new Date();
  const tenantId = randomUUID();

  return withContext({ tenantId, userId: actor.userId, userEmail: actor.email }, async (tx) => {
    const plan = await tx.plan.findFirst({
      where: { code: opts.planCode ?? DEFAULT_PLAN_CODE, active: true },
    });
    if (!plan) throw validation("Plan no disponible.");

    const tenant = await tx.tenant.create({
      data: { id: tenantId, name: data.name, legalName: data.legalName, rif: data.rif },
    });
    await tx.tenantSettings.create({ data: { tenantId } });
    const membership = await tx.membership.create({
      data: { tenantId, userId: actor.userId, role: "OWNER" },
    });
    const trialDays = opts.trialDays ?? DEFAULT_TRIAL_DAYS;
    await tx.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: "TRIALING",
        trialEndsAt: new Date(now.getTime() + trialDays * 86_400_000),
      },
    });
    const branch = await tx.branch.create({ data: { tenantId, code: "PRINCIPAL", name: "Sucursal principal" } });
    const warehouse = await tx.warehouse.create({
      data: { tenantId, branchId: branch.id, code: "ALM-01", name: "Almacén principal" },
    });

    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "tenant.created",
      entityType: "Tenant",
      entityId: tenantId,
      after: { name: tenant.name, legalName: tenant.legalName, rif: tenant.rif, plan: plan.code },
      meta: actor.meta,
    });

    return { tenant, membershipId: membership.id, branchId: branch.id, warehouseId: warehouse.id };
  });
}

export interface UserTenantSummary {
  tenantId: string;
  name: string;
  role: Role;
}

/** Empresas donde el usuario tiene membresía activa. */
export async function listUserTenants(userId: string): Promise<UserTenantSummary[]> {
  return withContext({ userId }, async (tx) => {
    const rows = await tx.membership.findMany({
      where: { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((m) => ({ tenantId: m.tenant.id, name: m.tenant.name, role: m.role as Role }));
  });
}

export interface ResolvedTenantAccess {
  tenantId: string;
  tenantName: string;
  membershipId: string;
  role: Role;
  branchIds: string[];
  mfaRequired: boolean;
  accessMode: AccessMode;
}

/**
 * Fuente única de autorización de empresa: devuelve el acceso SOLO si existe
 * una membresía ACTIVA del usuario en una empresa ACTIVA. Nunca se confía en
 * un tenant_id recibido del navegador sin pasar por aquí.
 */
export async function resolveTenantAccess(
  userId: string,
  tenantId: string,
  now = new Date(),
): Promise<ResolvedTenantAccess | null> {
  // Paso 1: sin contexto de empresa. RLS solo deja ver las membresías propias,
  // así que nunca se fija app.tenant_id para una empresa ajena.
  const m = await withContext({ userId }, (tx) =>
    tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } }),
  );
  if (!m || m.userId !== userId || m.status !== "ACTIVE") return null;

  // Paso 2: membresía confirmada => ya se puede fijar el contexto de la empresa.
  return withContext({ userId, tenantId }, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, status: true } });
    if (!tenant || tenant.status !== "ACTIVE") return null;
    const [settings, subscription, branches] = await Promise.all([
      tx.tenantSettings.findUnique({ where: { tenantId } }),
      tx.subscription.findUnique({ where: { tenantId } }),
      tx.membershipBranch.findMany({ where: { membershipId: m.id }, select: { branchId: true } }),
    ]);
    const role = m.role as Role;
    return {
      tenantId,
      tenantName: tenant.name,
      membershipId: m.id,
      role,
      branchIds: branches.map((b) => b.branchId),
      mfaRequired: m.mfaRequired || roleRequiresMfa(role, settings?.mfaRequiredForAll ?? false),
      accessMode: subscriptionAccessMode(subscription, now),
    };
  });
}
