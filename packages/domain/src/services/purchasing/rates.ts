import { Prisma, withTenant, type Tx } from "@rc/db";
import { z } from "zod";
import { validation } from "../../errors";
import { assertPermission } from "../../rbac";
import { parseQuantity } from "../../units";
import { recordAudit } from "../audit";
import { assertTenantWritable } from "../entitlements";
import { getInventoryPolicy, todayIn } from "../inventory/core";
import type { TenantActor } from "../types";

/**
 * Tasas de cambio (Bs. por 1 USD). Fuente predeterminada: carga manual auditada
 * declarando la fuente (p. ej. BCV). No hay integración automática con el BCV:
 * no existe, hasta donde sabemos, una API oficial documentada (ver docs).
 * Las tasas son de solo inserción; corregir = registrar una nueva.
 */
export const rateInputSchema = z.object({
  rate: z.union([z.string(), z.number()]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD"),
  source: z.enum(["BCV_MANUAL", "INTERNAL"]).default("BCV_MANUAL"),
  sourceReference: z.string().trim().max(300).optional(),
});

export async function recordExchangeRate(actor: TenantActor, raw: z.input<typeof rateInputSchema>) {
  assertPermission(actor, "exchange_rates.manage");
  const input = rateInputSchema.parse(raw);
  const rate = parseQuantity(input.rate);
  if (rate.lessThanOrEqualTo(0)) throw validation("La tasa debe ser mayor que cero.");
  if (rate.decimalPlaces() > 8) throw validation("La tasa admite hasta 8 decimales.");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    await assertTenantWritable(tx, actor.tenantId);
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    if (input.effectiveDate > todayIn(policy.timezone)) throw validation("No se registran tasas con fecha futura.");
    const previous = await currentRate(tx, actor.tenantId, input.effectiveDate);
    const r = await tx.exchangeRate.create({
      data: {
        tenantId: actor.tenantId,
        rate,
        effectiveDate: new Date(`${input.effectiveDate}T00:00:00Z`),
        source: input.source,
        sourceReference: input.sourceReference || null,
        createdById: actor.userId,
      },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "exchange_rate.recorded",
      entityType: "ExchangeRate",
      entityId: r.id,
      before: previous ? { rate: previous.rate.toString(), effectiveDate: previous.effectiveDate.toISOString().slice(0, 10) } : null,
      after: { rate: rate.toString(), effectiveDate: input.effectiveDate, source: input.source, reference: input.sourceReference ?? null },
      meta: actor.meta,
    });
    return r;
  });
}

/** Tasa vigente para una fecha: la de fecha efectiva más reciente ≤ fecha; si hay varias, la última registrada. */
export async function currentRate(tx: Tx, tenantId: string, date: string) {
  return tx.exchangeRate.findFirst({
    where: { tenantId, effectiveDate: { lte: new Date(`${date}T00:00:00Z`) } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getRateStatus(actor: TenantActor) {
  assertPermission(actor, "exchange_rates.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const policy = await getInventoryPolicy(tx, actor.tenantId);
    const today = todayIn(policy.timezone);
    const r = await currentRate(tx, actor.tenantId, today);
    const daysOld = r ? Math.round((Date.parse(`${today}T00:00:00Z`) - r.effectiveDate.getTime()) / 86_400_000) : null;
    return {
      baseCurrency: policy.baseCurrency,
      today,
      current: r ? { id: r.id, rate: r.rate.toString(), effectiveDate: r.effectiveDate.toISOString().slice(0, 10), source: r.source, sourceReference: r.sourceReference, createdAt: r.createdAt } : null,
      daysOld,
      upToDate: daysOld === 0,
    };
  });
}

export async function listExchangeRates(actor: TenantActor, take = 60) {
  assertPermission(actor, "exchange_rates.read");
  return withTenant(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.exchangeRate.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      take: Math.min(take, 365),
    });
    const users = await tx.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ ...r, createdBy: r.createdById ? byId.get(r.createdById) ?? null : null }));
  });
}

export type RateValue = Prisma.Decimal;
