import {
  acceptInvitation,
  createBranch,
  createProduct,
  inviteMember,
  setMemberStatus,
  type TenantActor,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser, setSubscription } from "./helpers";

describe("Límites del plan aplicados en backend (aceptación 9)", () => {
  it("Básico: 1 sucursal (la principal) — una segunda es rechazada", async () => {
    const o = await createUser("basico-suc");
    const t = (await createCompany(o, "BASICO")).tenant.id;
    const owner = await actorFor(o, t);
    await expect(createBranch(owner, { code: "S2", name: "Segunda" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      details: { resource: "branches", max: 1 },
    });
  });

  it("Básico: 2 usuarios — el propietario + 1 invitación; la tercera es rechazada", async () => {
    const o = await createUser("basico-usr");
    const t = (await createCompany(o, "BASICO")).tenant.id;
    const owner = await actorFor(o, t);
    await expect(inviteMember(owner, { email: "segundo@example.com", role: "WAREHOUSE" })).resolves.toBeTruthy();
    await expect(inviteMember(owner, { email: "tercero@example.com", role: "WAREHOUSE" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      details: { resource: "users", max: 2 },
    });
  });

  it("invitaciones concurrentes no superan el límite (candado por empresa)", async () => {
    const o = await createUser("basico-conc");
    const t = (await createCompany(o, "BASICO")).tenant.id;
    const owner = await actorFor(o, t);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => inviteMember(owner, { email: `conc${i}@example.com`, role: "READONLY" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("Profesional: hasta 3 sucursales", async () => {
    const o = await createUser("pro-suc");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    const owner = await actorFor(o, t);
    await createBranch(owner, { code: "S2", name: "Segunda" });
    await createBranch(owner, { code: "S3", name: "Tercera" });
    await expect(createBranch(owner, { code: "S4", name: "Cuarta" })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("aceptar una invitación vuelve a validar el límite (si el plan bajó entretanto)", async () => {
    const o = await createUser("downgrade");
    const t = (await createCompany(o, "PROFESIONAL")).tenant.id;
    const owner = await actorFor(o, t);
    const invitee = await createUser("invitado");
    const inv = await inviteMember(owner, { email: invitee.email, role: "READONLY" });
    // Otro miembro entra directamente y la empresa baja a Básico (2 usuarios).
    await addMember(t, await createUser("otro"), "READONLY");
    await setSubscription(t, { planCode: "BASICO" });
    await expect(acceptInvitation(invitee, inv.token)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("reactivar un miembro cuenta contra el límite", async () => {
    const o = await createUser("reactivar");
    const t = (await createCompany(o, "BASICO")).tenant.id;
    const owner = await actorFor(o, t);
    const u1 = await createUser("u1");
    const m1 = await addMember(t, u1, "READONLY");
    await setMemberStatus(owner, m1.id, "DISABLED");
    const u2 = await createUser("u2");
    await addMember(t, u2, "READONLY");
    await expect(setMemberStatus(owner, m1.id, "ACTIVE")).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("Empresarial: sin límite fijo salvo override de contrato", async () => {
    const o = await createUser("empresarial");
    const t = (await createCompany(o, "EMPRESARIAL")).tenant.id;
    const owner = await actorFor(o, t);
    for (let i = 2; i <= 5; i++) await createBranch(owner, { code: `S${i}`, name: `Sucursal ${i}` });
  });
});

describe("Estado de suscripción: solo lectura sin borrar datos", () => {
  async function company(): Promise<{ owner: TenantActor; tenantId: string }> {
    const o = await createUser("estado");
    const tenantId = (await createCompany(o, "PROFESIONAL")).tenant.id;
    return { owner: await actorFor(o, tenantId), tenantId };
  }

  it("suspendida => no se puede escribir, sí leer", async () => {
    const { owner, tenantId } = await company();
    await createProduct(owner, { sku: "ANTES", name: "Creado antes" });
    await setSubscription(tenantId, { status: "SUSPENDED" });
    await expect(createProduct(owner, { sku: "DESPUES", name: "No debe crearse" })).rejects.toMatchObject({ code: "READ_ONLY" });
    await expect(createBranch(owner, { code: "S2", name: "x2" })).rejects.toMatchObject({ code: "READ_ONLY" });
  });

  it("prueba vencida => solo lectura; en período de gracia => escritura", async () => {
    const { owner, tenantId } = await company();
    await setSubscription(tenantId, { trialEndsAt: new Date(Date.now() - 1000) });
    await expect(createProduct(owner, { sku: "T1", name: "Prueba vencida" })).rejects.toMatchObject({ code: "READ_ONLY" });
    await setSubscription(tenantId, { status: "PAST_DUE", graceEndsAt: new Date(Date.now() + 86_400_000) });
    await expect(createProduct(owner, { sku: "T2", name: "En gracia" })).resolves.toBeTruthy();
  });

  it("la empresa no puede modificar su propia suscripción (solo la plataforma)", async () => {
    const { tenantId } = await company();
    const { withContext } = await import("@rc/db");
    const res = await withContext({ tenantId }, (tx) =>
      tx.subscription.updateMany({ where: { tenantId }, data: { status: "ACTIVE", maxUsersOverride: 999 } }),
    );
    expect(res.count).toBe(0);
  });
});
