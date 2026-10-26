import { Prisma, withContext, withTenant } from "@rc/db";
import { z } from "zod";
import { conflict, validation } from "../errors";
import { assertPermission } from "../rbac";
import { recordAudit } from "./audit";
import { currentRate } from "./purchasing/rates";
import { enforceRateLimit } from "./rate-limit";
import { subscriptionAccessMode, subscriptionPhase } from "./subscription-access";
import type { TenantActor } from "./types";

/*
 * Cobro manual (Fase 4): la empresa elige plan y registra el pago (transferencia o pago móvil)
 * con su referencia; la plataforma lo concilia contra el extracto y lo aprueba o rechaza.
 * Registrar un pago está permitido aun en modo solo lectura (así se reactiva una cuenta vencida).
 */

export const PAYMENT_METHOD_LABELS = {
  TRANSFER: "Transferencia bancaria",
  PAGO_MOVIL: "Pago móvil",
  OTHER: "Otro",
} as const;

export const PAYMENT_STATUS_LABELS = {
  PENDING: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
} as const;

export const PAYMENT_INSTRUCTIONS_KEY = "payment_instructions";
export const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Las instrucciones de pago aún no han sido configuradas. Escríbanos para recibir los datos bancarios.";

/** Planes que se pueden contratar en línea (con precio; el Empresarial es por contrato). */
export async function listPublicPlans() {
  return withContext({}, (tx) =>
    tx.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  );
}

export async function getPaymentInstructions(): Promise<string> {
  const row = await withContext({}, (tx) => tx.platformSetting.findUnique({ where: { key: PAYMENT_INSTRUCTIONS_KEY } }));
  return row?.value ?? DEFAULT_PAYMENT_INSTRUCTIONS;
}

export async function getBillingOverview(actor: TenantActor, now = new Date()) {
  assertPermission(actor, "billing.read");
  const [data, plans, instructions] = await Promise.all([
    withTenant(actor.tenantId, actor.userId, async (tx) => {
      const subscription = await tx.subscription.findUnique({ where: { tenantId: actor.tenantId }, include: { plan: true } });
      const [activeUsers, branches, payments] = await Promise.all([
        tx.membership.count({ where: { tenantId: actor.tenantId, status: "ACTIVE" } }),
        tx.branch.count({ where: { tenantId: actor.tenantId, active: true } }),
        tx.payment.findMany({ where: { tenantId: actor.tenantId }, include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
      ]);
      return { subscription, activeUsers, branches, payments };
    }),
    listPublicPlans(),
    getPaymentInstructions(),
  ]);
  const sub = data.subscription;
  return {
    ...data,
    plans,
    instructions,
    accessMode: subscriptionAccessMode(sub, now),
    phase: subscriptionPhase(sub, now),
    limits: {
      maxUsers: sub ? (sub.maxUsersOverride ?? sub.plan.maxUsers) : null,
      maxBranches: sub ? (sub.maxBranchesOverride ?? sub.plan.maxBranches) : null,
    },
  };
}

const paymentSchema = z.object({
  planCode: z.string().trim().min(1, "Elija un plan"),
  method: z.enum(["TRANSFER", "PAGO_MOVIL", "OTHER"]),
  reference: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]{4,60}$/, "La referencia debe tener entre 4 y 60 letras o números")),
  amount: z
    .string()
    .trim()
    // "1.234,56" (es-VE) o "1234.56"
    .transform((v) => (v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
    .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Monto inválido (máximo 2 decimales)")),
  currency: z.enum(["USD", "VES"]),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  periodMonths: z.coerce.number().int().min(1).max(12),
  payerName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type PaymentInput = z.input<typeof paymentSchema>;

/** La empresa registra un pago (queda "En revisión"). */
export async function submitPayment(actor: TenantActor, raw: PaymentInput, now = new Date()) {
  assertPermission(actor, "billing.manage");
  const input = paymentSchema.parse(raw);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw validation("El monto debe ser mayor que cero.");
  const today = now.toISOString().slice(0, 10);
  if (input.paidOn > today) throw validation("La fecha del pago no puede ser futura.");
  if (input.paidOn < new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)) {
    throw validation("La fecha del pago no puede tener más de 90 días.");
  }
  await enforceRateLimit(`payment-submit:${actor.tenantId}`, 10, 24 * 3600);

  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const plan = await tx.plan.findFirst({ where: { code: input.planCode, active: true } });
    if (!plan) throw validation("Plan no disponible.");
    if (plan.priceMonthly.lessThanOrEqualTo(0)) throw validation("Este plan se contrata por acuerdo: contáctenos.");

    let exchangeRate: Prisma.Decimal | null = null;
    let amountUsd: Prisma.Decimal | null = amount;
    if (input.currency === "VES") {
      const r = await currentRate(tx, actor.tenantId, input.paidOn);
      exchangeRate = r?.rate ?? null;
      amountUsd = r ? amount.dividedBy(r.rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null;
    }
    try {
      const p = await tx.payment.create({
        data: {
          tenantId: actor.tenantId,
          planId: plan.id,
          method: input.method,
          reference: input.reference,
          amount,
          currency: input.currency,
          exchangeRate,
          amountUsd,
          paidOn: new Date(`${input.paidOn}T00:00:00Z`),
          periodMonths: input.periodMonths,
          payerName: input.payerName || null,
          notes: input.notes || null,
          submittedById: actor.userId,
        },
      });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "billing.payment_submitted",
        entityType: "Payment",
        entityId: p.id,
        after: { plan: plan.code, method: p.method, reference: p.reference, amount: amount.toString(), currency: p.currency, months: p.periodMonths },
        meta: actor.meta,
      });
      return { paymentId: p.id, expectedUsd: plan.priceMonthly.times(input.periodMonths).toString(), amountUsd: amountUsd?.toString() ?? null };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("Ya registró un pago con esa referencia y medio de pago.");
      }
      throw e;
    }
  });
}

/** Resumen liviano para el aviso de la barra superior (todas las páginas). */
export async function getSubscriptionBanner(actor: TenantActor, now = new Date()) {
  const sub = await withTenant(actor.tenantId, actor.userId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId: actor.tenantId }, include: { plan: { select: { name: true } } } }),
  );
  return { planName: sub?.plan.name ?? null, ...subscriptionPhase(sub, now) };
}
