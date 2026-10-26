import { prisma, Prisma, withContext, type Tx } from "@rc/db";
import { z } from "zod";
import { conflict, forbidden, notFound, validation } from "../errors";
import { recordAudit } from "./audit";
import { PAYMENT_INSTRUCTIONS_KEY } from "./billing";
import { subscriptionAccessMode, subscriptionPhase } from "./subscription-access";
import type { RequestMeta } from "./types";

/*
 * Panel de plataforma (superadministrador). Muestra METADATOS de las empresas
 * (plan, estado, uso, pagos), nunca inventarios. Cada llamada vuelve a leer el rol
 * de plataforma en la base de datos: no se confía en lo que diga la sesión.
 * SUPPORT puede consultar; solo SUPERADMIN modifica.
 */

export interface PlatformActor {
  userId: string;
  email: string;
  meta?: RequestMeta;
}

async function assertPlatform(actor: PlatformActor, level: "read" | "manage") {
  const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { platformRole: true, disabledAt: true } });
  if (!u || u.disabledAt || u.platformRole === "NONE") throw forbidden("Acceso solo para la plataforma.");
  if (level === "manage" && u.platformRole !== "SUPERADMIN") throw forbidden("Requiere rol de superadministrador.");
}

const asPlatform = <T>(actor: PlatformActor, fn: (tx: Tx) => Promise<T>, tenantId?: string) =>
  withContext({ platformAdmin: true, userId: actor.userId, tenantId: tenantId ?? null }, fn);

/** Métricas de negocio (ver docs/billing-strategy.md §5). Montos en USD. */
export async function getPlatformMetrics(actor: PlatformActor, now = new Date()) {
  await assertPlatform(actor, "read");
  return asPlatform(actor, async (tx) => {
    const subs = await tx.subscription.findMany({ include: { plan: true, tenant: { select: { createdAt: true, status: true } } } });
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [pending, approvedMonth, tenantsWithPayment] = await Promise.all([
      tx.payment.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amountUsd: true } }),
      tx.payment.aggregate({ where: { status: "APPROVED", reviewedAt: { gte: monthStart } }, _count: true, _sum: { amountUsd: true } }),
      tx.payment.groupBy({ by: ["tenantId"], where: { status: "APPROVED" } }),
    ]);
    const byPhase: Record<string, number> = {};
    let mrr = new Prisma.Decimal(0);
    let trialsEnding7 = 0;
    for (const s of subs) {
      const ph = subscriptionPhase(s, now);
      byPhase[ph.phase] = (byPhase[ph.phase] ?? 0) + 1;
      if (s.status === "ACTIVE" && subscriptionAccessMode(s, now) === "full") mrr = mrr.plus(s.plan.priceMonthly);
      if (ph.phase === "trial" && ph.daysLeft !== null && ph.daysLeft <= 7) trialsEnding7++;
    }
    const new30 = subs.filter((s) => s.tenant.createdAt.getTime() >= now.getTime() - 30 * 86_400_000).length;
    return {
      tenants: subs.length,
      new30,
      byPhase,
      trialsEnding7,
      mrr: Number(mrr),
      pendingPayments: { count: pending._count, usd: Number(pending._sum.amountUsd ?? 0) },
      approvedThisMonth: { count: approvedMonth._count, usd: Number(approvedMonth._sum.amountUsd ?? 0) },
      conversionRate: subs.length ? tenantsWithPayment.length / subs.length : 0,
    };
  });
}

export interface PlatformTenantRow {
  tenantId: string;
  name: string;
  rif: string | null;
  createdAt: Date;
  tenantStatus: string;
  planCode: string;
  planName: string;
  status: string;
  phase: string;
  daysLeft: number | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  activeUsers: number;
  branches: number;
  products: number;
  owners: string[];
  pendingPayments: number;
}

/** Empresas con plan, estado y uso. Los conteos se hacen con el contexto de cada empresa (RLS). */
export async function listPlatformTenants(actor: PlatformActor, opts: { q?: string; tenantId?: string } = {}, now = new Date()): Promise<PlatformTenantRow[]> {
  await assertPlatform(actor, "read");
  const q = opts.q?.trim();
  return asPlatform(actor, async (tx) => {
    const tenants = await tx.tenant.findMany({
      where: {
        ...(opts.tenantId ? { id: opts.tenantId } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { rif: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const pendingByTenant = await tx.payment.groupBy({ by: ["tenantId"], where: { status: "PENDING" }, _count: true });
    const rows: PlatformTenantRow[] = [];
    for (const t of tenants) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
      const [activeUsers, branches, products, owners] = await Promise.all([
        tx.membership.count({ where: { tenantId: t.id, status: "ACTIVE" } }),
        tx.branch.count({ where: { tenantId: t.id, active: true } }),
        tx.product.count({ where: { tenantId: t.id } }),
        tx.membership.findMany({ where: { tenantId: t.id, role: "OWNER", status: "ACTIVE" }, select: { user: { select: { email: true } } } }),
      ]);
      const s = t.subscription;
      const ph = subscriptionPhase(s, now);
      rows.push({
        tenantId: t.id,
        name: t.name,
        rif: t.rif,
        createdAt: t.createdAt,
        tenantStatus: t.status,
        planCode: s?.plan.code ?? "—",
        planName: s?.plan.name ?? "—",
        status: s?.status ?? "—",
        phase: ph.phase,
        daysLeft: ph.daysLeft,
        trialEndsAt: s?.trialEndsAt ?? null,
        currentPeriodEnd: s?.currentPeriodEnd ?? null,
        activeUsers,
        branches,
        products,
        owners: owners.map((o) => o.user.email),
        pendingPayments: pendingByTenant.find((p) => p.tenantId === t.id)?._count ?? 0,
      });
    }
    await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
    return rows;
  });
}

const tenantChangeSchema = z.object({
  planCode: z.string().trim().optional(),
  extendTrialDays: z.coerce.number().int().min(1).max(90).optional(),
  status: z.enum(["REACTIVATE", "SUSPENDED", "CANCELED"]).optional(),
  reason: z.string().trim().min(5, "Indique el motivo (mínimo 5 caracteres)").max(300),
});

/** Cambia plan, extiende la prueba o suspende/reactiva/cancela. Siempre con motivo y auditoría. */
export async function updateTenantSubscription(actor: PlatformActor, tenantId: string, raw: z.input<typeof tenantChangeSchema>, now = new Date()) {
  await assertPlatform(actor, "manage");
  const input = tenantChangeSchema.parse(raw);
  if (!input.planCode && !input.extendTrialDays && !input.status) throw validation("No hay cambios que aplicar.");
  return asPlatform(actor, async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub) throw notFound("Empresa no encontrada.");
    const data: Prisma.SubscriptionUpdateInput = {};
    if (input.planCode && input.planCode !== sub.plan.code) {
      const plan = await tx.plan.findFirst({ where: { code: input.planCode } });
      if (!plan) throw validation("Plan no encontrado.");
      data.plan = { connect: { id: plan.id } };
    }
    if (input.extendTrialDays) {
      if (sub.status !== "TRIALING") throw validation("Solo se puede extender una prueba (la empresa no está en prueba).");
      const base = sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
      data.trialEndsAt = new Date(base.getTime() + input.extendTrialDays * 86_400_000);
    }
    if (input.status === "REACTIVATE") {
      // Vuelve a su estado natural: activa si tiene un período pagado, en prueba si no.
      data.status = sub.currentPeriodEnd ? "ACTIVE" : "TRIALING";
    } else if (input.status) {
      data.status = input.status;
    }
    const updated = await tx.subscription.update({ where: { tenantId }, data, include: { plan: true } });
    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "platform.subscription_changed",
      entityType: "Subscription",
      entityId: sub.id,
      before: { plan: sub.plan.code, status: sub.status, trialEndsAt: sub.trialEndsAt },
      after: { plan: updated.plan.code, status: updated.status, trialEndsAt: updated.trialEndsAt },
      metadata: { reason: input.reason },
      meta: actor.meta,
    });
    return updated;
  }, tenantId);
}

export async function listPlatformPayments(actor: PlatformActor, opts: { status?: "PENDING" | "APPROVED" | "REJECTED"; tenantId?: string } = {}) {
  await assertPlatform(actor, "read");
  return asPlatform(actor, (tx) =>
    tx.payment.findMany({
      where: { ...(opts.status ? { status: opts.status } : {}), ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      include: { tenant: { select: { name: true, rif: true } }, plan: { select: { code: true, name: true, priceMonthly: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
  );
}

const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * Concilia un pago. Aprobar activa la suscripción con el plan pagado y extiende el
 * período desde el fin vigente (o desde hoy si ya venció). Segregación de funciones:
 * nadie revisa un pago que registró (también lo impide la base de datos).
 */
export async function reviewPayment(actor: PlatformActor, paymentId: string, raw: z.input<typeof reviewSchema>, now = new Date()) {
  await assertPlatform(actor, "manage");
  const input = reviewSchema.parse(raw);
  if (input.decision === "REJECT" && (!input.note || input.note.length < 5)) {
    throw validation("Indique el motivo del rechazo (mínimo 5 caracteres).");
  }
  const pre = await asPlatform(actor, (tx) => tx.payment.findUnique({ where: { id: paymentId }, select: { tenantId: true } }));
  if (!pre) throw notFound("Pago no encontrado.");

  return asPlatform(actor, async (tx) => {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { plan: true } });
    if (p.status !== "PENDING") throw conflict("El pago ya fue revisado.");
    if (p.submittedById === actor.userId) throw forbidden("No puede conciliar un pago que usted mismo registró.");

    const reviewed = await tx.payment.update({
      where: { id: p.id },
      data: { status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedById: actor.userId, reviewedAt: now, reviewNote: input.note || null },
    });
    let periodEnd: Date | null = null;
    if (input.decision === "APPROVE") {
      const sub = await tx.subscription.findUniqueOrThrow({ where: { tenantId: p.tenantId } });
      const base = sub.status === "ACTIVE" && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      periodEnd = new Date(base);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + p.periodMonths);
      await tx.subscription.update({
        where: { tenantId: p.tenantId },
        data: { planId: p.planId, status: "ACTIVE", currentPeriodEnd: periodEnd, graceEndsAt: null },
      });
    }
    await recordAudit(tx, {
      tenantId: p.tenantId,
      actorUserId: actor.userId,
      action: input.decision === "APPROVE" ? "platform.payment_approved" : "platform.payment_rejected",
      entityType: "Payment",
      entityId: p.id,
      after: { status: reviewed.status, plan: p.plan.code, months: p.periodMonths, periodEnd, note: input.note ?? null },
      meta: actor.meta,
    });
    return { status: reviewed.status, periodEnd };
  }, pre.tenantId);
}

const planSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  priceMonthly: z
    .string()
    .trim()
    .transform((v) => (v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
    .pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Precio inválido")),
  maxUsers: z.union([z.literal(""), z.coerce.number().int().min(1).max(10_000)]).optional(),
  maxBranches: z.union([z.literal(""), z.coerce.number().int().min(1).max(1_000)]).optional(),
  active: z.boolean(),
});

export async function updatePlan(actor: PlatformActor, code: string, raw: z.input<typeof planSchema>) {
  await assertPlatform(actor, "manage");
  const input = planSchema.parse(raw);
  return asPlatform(actor, async (tx) => {
    const plan = await tx.plan.findUnique({ where: { code } });
    if (!plan) throw notFound("Plan no encontrado.");
    const updated = await tx.plan.update({
      where: { code },
      data: {
        name: input.name,
        description: input.description || null,
        priceMonthly: new Prisma.Decimal(input.priceMonthly),
        maxUsers: input.maxUsers === "" || input.maxUsers === undefined ? null : input.maxUsers,
        maxBranches: input.maxBranches === "" || input.maxBranches === undefined ? null : input.maxBranches,
        active: input.active,
      },
    });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "platform.plan_updated",
      entityType: "Plan",
      entityId: plan.id,
      before: { name: plan.name, price: plan.priceMonthly.toString(), maxUsers: plan.maxUsers, maxBranches: plan.maxBranches, active: plan.active },
      after: { name: updated.name, price: updated.priceMonthly.toString(), maxUsers: updated.maxUsers, maxBranches: updated.maxBranches, active: updated.active },
      meta: actor.meta,
    });
    return updated;
  });
}

export async function listPlansAdmin(actor: PlatformActor) {
  await assertPlatform(actor, "read");
  return asPlatform(actor, (tx) => tx.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } }));
}

export async function setPaymentInstructions(actor: PlatformActor, text: string) {
  await assertPlatform(actor, "manage");
  const value = text.trim();
  if (value.length < 10 || value.length > 2000) throw validation("Las instrucciones deben tener entre 10 y 2000 caracteres.");
  return asPlatform(actor, async (tx) => {
    await tx.platformSetting.upsert({
      where: { key: PAYMENT_INSTRUCTIONS_KEY },
      create: { key: PAYMENT_INSTRUCTIONS_KEY, value, updatedById: actor.userId },
      update: { value, updatedById: actor.userId },
    });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "platform.payment_instructions_updated",
      entityType: "PlatformSetting",
      entityId: null,
      meta: actor.meta,
    });
  });
}

/** Asigna el rol de superadministrador a los correos indicados (variable de entorno al desplegar). */
export async function ensurePlatformSuperadmins(emails: string[]): Promise<string[]> {
  const applied: string[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || u.platformRole === "SUPERADMIN") continue;
    await withContext({ userId: u.id }, async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { platformRole: "SUPERADMIN" } });
      await recordAudit(tx, {
        tenantId: null,
        actorUserId: u.id,
        action: "platform.superadmin_granted",
        entityType: "User",
        entityId: u.id,
        metadata: { origen: "despliegue (PLATFORM_SUPERADMIN_EMAILS)" },
      });
    });
    applied.push(email);
  }
  return applied;
}
