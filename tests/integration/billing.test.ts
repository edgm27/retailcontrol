import { prisma, withContext } from "@rc/db";
import {
  ensurePlatformSuperadmins,
  getBillingOverview,
  getPlatformMetrics,
  listPlatformPayments,
  listPlatformTenants,
  resolveTenantAccess,
  reviewPayment,
  setPaymentInstructions,
  getPaymentInstructions,
  submitPayment,
  updatePlan,
  updateTenantSubscription,
  type PaymentInput,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser, setSubscription } from "./helpers";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
let n = 0;
const ref = () => `REF${Date.now().toString().slice(-6)}${n++}`;
const pay = (over: Partial<PaymentInput> = {}): PaymentInput => ({
  planCode: "PROFESIONAL", method: "PAGO_MOVIL", reference: ref(), amount: "39,00", currency: "USD", paidOn: today(), periodMonths: 1, ...over,
});

async function setup(plan = "BASICO") {
  const o = await createUser("cobro-dueno");
  const c = await createCompany(o, plan, "Abastos Cobro");
  return { owner: await actorFor(o, c.tenant.id), tenantId: c.tenant.id, ownerUser: o };
}

async function platformUser(role: "SUPERADMIN" | "SUPPORT" = "SUPERADMIN") {
  const u = await createUser(`plataforma-${role.toLowerCase()}`);
  await prisma.user.update({ where: { id: u.userId }, data: { platformRole: role } });
  return { userId: u.userId, email: u.email };
}

describe("Cobro manual: la empresa registra pagos", () => {
  it("registra un pago en revisión; valida referencia, fecha y duplicados; solo el propietario paga", async () => {
    const { owner } = await setup();
    const r = await submitPayment(owner, pay({ reference: "  123 456 " }));
    expect(r.expectedUsd).toBe("39");
    const o = await getBillingOverview(owner);
    expect(o.payments).toHaveLength(1);
    expect(o.payments[0]).toMatchObject({ status: "PENDING", reference: "123456" });

    await expect(submitPayment(owner, pay({ reference: "123456" }))).rejects.toThrow(/Ya registró/);
    await expect(submitPayment(owner, pay({ reference: "x" }))).rejects.toThrow();
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await expect(submitPayment(owner, pay({ paidOn: tomorrow }))).rejects.toThrow(/futura/);
    await expect(submitPayment(owner, pay({ planCode: "EMPRESARIAL" }))).rejects.toThrow(/acuerdo/);

    const adminU = await createUser("cobro-admin");
    await addMember(owner.tenantId, adminU, "ADMIN");
    const admin = await actorFor(adminU, owner.tenantId);
    await expect(submitPayment(admin, pay())).rejects.toThrow(); // billing.manage es solo del propietario
    expect((await getBillingOverview(admin)).payments).toHaveLength(1); // pero puede consultar
  });

  it("convierte pagos en bolívares con la tasa registrada por la empresa", async () => {
    const { owner } = await setup("PROFESIONAL");
    const { recordExchangeRate } = await import("@rc/domain");
    await recordExchangeRate(owner, { rate: "40", effectiveDate: today() });
    const r = await submitPayment(owner, pay({ currency: "VES", amount: "1.560,00" }));
    expect(r.amountUsd).toBe("39");
  });

  it("una empresa vencida (solo lectura) puede registrar su pago", async () => {
    const { owner, tenantId } = await setup();
    await setSubscription(tenantId, { status: "TRIALING", trialEndsAt: new Date(Date.now() - 86_400_000) });
    expect((await resolveTenantAccess(owner.userId, tenantId))!.accessMode).toBe("read_only");
    await expect(submitPayment(owner, pay())).resolves.toBeTruthy();
  });

  it("RLS: la empresa no puede aprobar su propio pago ni ver pagos ajenos", async () => {
    const a = await setup();
    const b = await setup();
    await submitPayment(a.owner, pay());
    const updated = await withContext({ tenantId: a.tenantId, userId: a.owner.userId }, (tx) =>
      tx.payment.updateMany({ where: { tenantId: a.tenantId }, data: { status: "APPROVED", reviewedById: b.owner.userId, reviewedAt: new Date() } }),
    );
    expect(updated.count).toBe(0);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "PROFESIONAL" } });
    await expect(
      withContext({ tenantId: a.tenantId, userId: a.owner.userId }, (tx) =>
        tx.payment.create({
          data: { tenantId: a.tenantId, planId: plan.id, method: "OTHER", reference: ref(), amount: 1, currency: "USD", paidOn: new Date(), periodMonths: 1, submittedById: a.owner.userId, status: "APPROVED", reviewedById: b.owner.userId, reviewedAt: new Date() },
        }),
      ),
    ).rejects.toThrow();
    expect((await getBillingOverview(b.owner)).payments).toHaveLength(0);
    const visible = await withContext({ tenantId: b.tenantId, userId: b.owner.userId }, (tx) => tx.payment.count({ where: { tenantId: a.tenantId } }));
    expect(visible).toBe(0);
  });
});

describe("Panel de plataforma", () => {
  it("solo usuarios de plataforma acceden; soporte consulta pero no concilia", async () => {
    const { owner } = await setup();
    const p = await submitPayment(owner, pay());
    await expect(getPlatformMetrics({ userId: owner.userId, email: owner.email })).rejects.toThrow(/plataforma/);
    const support = await platformUser("SUPPORT");
    expect((await listPlatformPayments(support, { status: "PENDING" })).some((x) => x.id === p.paymentId)).toBe(true);
    await expect(reviewPayment(support, p.paymentId, { decision: "APPROVE" })).rejects.toThrow(/superadministrador/);
  });

  it("aprobar activa el plan pagado y extiende el período; el pago queda inmutable", async () => {
    const { owner, tenantId } = await setup("BASICO");
    const admin = await platformUser();
    const p1 = await submitPayment(owner, pay({ periodMonths: 3 }));
    const r = await reviewPayment(admin, p1.paymentId, { decision: "APPROVE", note: "Verificado" });
    expect(r.status).toBe("APPROVED");
    const sub1 = await withContext({ tenantId }, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } }));
    expect(sub1).toMatchObject({ status: "ACTIVE" });
    expect(sub1.plan.code).toBe("PROFESIONAL");
    const months = (sub1.currentPeriodEnd!.getTime() - Date.now()) / (30 * 86_400_000);
    expect(months).toBeGreaterThan(2.8);
    expect(months).toBeLessThan(3.2);

    // Un segundo pago extiende desde el fin vigente, no desde hoy.
    const p2 = await submitPayment(owner, pay({ periodMonths: 1 }));
    await reviewPayment(admin, p2.paymentId, { decision: "APPROVE" });
    const sub2 = await withContext({ tenantId }, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId } }));
    expect(sub2.currentPeriodEnd!.getTime()).toBeGreaterThan(sub1.currentPeriodEnd!.getTime() + 27 * 86_400_000);

    await expect(reviewPayment(admin, p1.paymentId, { decision: "REJECT", note: "otra vez" })).rejects.toThrow(/ya fue revisado/);
    await expect(
      withContext({ platformAdmin: true }, (tx) => tx.payment.update({ where: { id: p1.paymentId }, data: { status: "REJECTED" } })),
    ).rejects.toThrow();
    await expect(withContext({ platformAdmin: true }, (tx) => tx.payment.delete({ where: { id: p1.paymentId } }))).rejects.toThrow();

    const tenants = await listPlatformTenants(admin, { tenantId });
    expect(tenants[0]).toMatchObject({ planCode: "PROFESIONAL", phase: "active", activeUsers: 1, branches: 1 });
    expect(tenants[0]!.owners).toEqual([owner.email]);
  });

  it("rechazo exige motivo; nadie concilia un pago que registró", async () => {
    const { owner, ownerUser } = await setup();
    const admin = await platformUser();
    const p = await submitPayment(owner, pay());
    await expect(reviewPayment(admin, p.paymentId, { decision: "REJECT" })).rejects.toThrow(/motivo/);
    await reviewPayment(admin, p.paymentId, { decision: "REJECT", note: "Referencia no encontrada" });
    expect((await getBillingOverview(owner)).payments[0]).toMatchObject({ status: "REJECTED", reviewNote: "Referencia no encontrada" });

    // El propietario también es superadministrador: no puede aprobar su propio pago.
    await prisma.user.update({ where: { id: ownerUser.userId }, data: { platformRole: "SUPERADMIN" } });
    const own = await submitPayment(owner, pay());
    await expect(reviewPayment({ userId: owner.userId, email: owner.email }, own.paymentId, { decision: "APPROVE" })).rejects.toThrow(/usted mismo/);
  });

  it("extender prueba, suspender y reactivar cambian el acceso; todo con motivo", async () => {
    const { owner, tenantId } = await setup();
    const admin = await platformUser();
    await expect(updateTenantSubscription(admin, tenantId, { extendTrialDays: 7, reason: "" })).rejects.toThrow();
    const before = (await withContext({ tenantId }, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId } }))).trialEndsAt!;
    await updateTenantSubscription(admin, tenantId, { extendTrialDays: 7, reason: "Solicitud del cliente" });
    const after = (await withContext({ tenantId }, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId } }))).trialEndsAt!;
    expect(after.getTime() - before.getTime()).toBe(7 * 86_400_000);

    await updateTenantSubscription(admin, tenantId, { status: "SUSPENDED", reason: "Prueba de suspensión" });
    expect((await resolveTenantAccess(owner.userId, tenantId))!.accessMode).toBe("read_only");
    await updateTenantSubscription(admin, tenantId, { status: "REACTIVATE", reason: "Regulariza" });
    const sub = await withContext({ tenantId }, (tx) => tx.subscription.findUniqueOrThrow({ where: { tenantId } }));
    expect(sub.status).toBe("TRIALING");
    expect((await resolveTenantAccess(owner.userId, tenantId))!.accessMode).toBe("full");
    const audit = await withContext({ tenantId }, (tx) => tx.auditEvent.count({ where: { tenantId, action: "platform.subscription_changed" } }));
    expect(audit).toBe(3);
    await expect(updateTenantSubscription({ userId: owner.userId, email: owner.email }, tenantId, { status: "SUSPENDED", reason: "no autorizado" })).rejects.toThrow();
  });

  it("métricas, planes, instrucciones de pago y alta de superadministradores", async () => {
    const admin = await platformUser();
    const m = await getPlatformMetrics(admin);
    expect(m.tenants).toBeGreaterThan(0);
    expect(typeof m.mrr).toBe("number");

    await updatePlan(admin, "BASICO", { name: "Básico", description: "Para un comercio con una sola tienda.", priceMonthly: "15,00", maxUsers: "2", maxBranches: "1", active: true });
    const { owner } = await setup();
    await expect(updatePlan({ userId: owner.userId, email: owner.email }, "BASICO", { name: "Gratis", priceMonthly: "0", active: true })).rejects.toThrow();

    await setPaymentInstructions(admin, "Banco Ejemplo, cuenta 0000-0000 (datos ficticios de prueba).");
    expect(await getPaymentInstructions()).toContain("Banco Ejemplo");

    const u = await createUser("futuro-superadmin");
    expect(await ensurePlatformSuperadmins([u.email.toUpperCase(), "no-existe@example.com"])).toEqual([u.email]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).platformRole).toBe("SUPERADMIN");
    expect(await ensurePlatformSuperadmins([u.email])).toEqual([]);
  });
});
