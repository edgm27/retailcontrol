import { prisma, withContext } from "@rc/db";
import {
  authenticateWithPassword,
  beginTotpEnrollment,
  createMemberUser,
  getMfaStatus,
  isMfaMandatory,
  listMemberRows,
  removeMemberUser,
  resetMemberMfa,
  resetMemberPassword,
  resolveTenantAccess,
  setPassword,
  updateMemberUser,
  type TenantActor,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { actorFor, addMember, createCompany, createUser } from "./helpers";

// Claves ficticias solo para pruebas.
const TEMP = "Temporal-Segura-2026"; // gitleaks:allow
const OTHER_TEMP = ["Otra", "Clave", "Temporal", "1"].join("-");
const REENTRY_TEMP = ["Reingreso", "Temporal", "1"].join("-");
const uniq = (p: string) => `${p}.${Math.random().toString(36).slice(2, 8)}@example.com`;

async function setup() {
  const o = await createUser("ua-dueno");
  const c = await createCompany(o, "PROFESIONAL", "Abastos Usuarios");
  return { owner: await actorFor(o, c.tenant.id), tenantId: c.tenant.id };
}

/** Confirma el factor TOTP directamente (atajo de prueba). */
async function enrollFactor(userId: string, email: string) {
  await beginTotpEnrollment({ userId, email });
  await withContext({ userId }, (tx) => tx.mfaTotp.update({ where: { userId }, data: { confirmedAt: new Date() } }));
}

describe("Gestión de usuarios sin invitación", () => {
  it("crea un usuario con clave temporal, rol y 2FA exigida; debe cambiar la clave al entrar", async () => {
    const { owner, tenantId } = await setup();
    const email = uniq("cajero");
    const r = await createMemberUser(owner, { email, name: "Cajero Uno", role: "WAREHOUSE", tempPassword: TEMP, mfaRequired: true });
    expect(r.kind).toBe("created");

    const { userId } = await authenticateWithPassword(email, TEMP);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u).toMatchObject({ mustChangePassword: true, managedByTenantId: tenantId, name: "Cajero Uno" });
    const access = await resolveTenantAccess(userId, tenantId);
    expect(access).toMatchObject({ role: "WAREHOUSE", mfaRequired: true });
    expect(await isMfaMandatory(userId)).toBe(true);

    // Cambio obligatorio: no puede repetir la temporal; con una nueva queda limpio.
    const session = await prisma.session.create({ data: { userId, sessionToken: `t-${userId}`, expires: new Date(Date.now() + 3_600_000) } });
    const actor = { userId, email, sessionId: session.id };
    await expect(setPassword(actor, { current: TEMP, next: TEMP, confirm: TEMP })).rejects.toThrow(/distinta/);
    await setPassword(actor, { current: TEMP, next: "Mi-Clave-Personal-99", confirm: "Mi-Clave-Personal-99" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(false);
    await expect(authenticateWithPassword(email, TEMP)).rejects.toThrow();
    await authenticateWithPassword(email, "Mi-Clave-Personal-99");

    const rows = await listMemberRows(owner);
    expect(rows.find((x) => x.email === email)).toMatchObject({ managed: true, mfaRequired: true, mfaEnrolled: false, mustChangePassword: false });
  });

  it("valida la clave temporal, el rol asignable y no duplica miembros", async () => {
    const { owner } = await setup();
    await expect(createMemberUser(owner, { email: uniq("x"), role: "READONLY", tempPassword: "corta" })).rejects.toThrow(/Clave temporal/);
    const email = uniq("dup");
    await createMemberUser(owner, { email, role: "READONLY", tempPassword: TEMP });
    await expect(createMemberUser(owner, { email, role: "READONLY", tempPassword: TEMP })).rejects.toThrow(/ya es un usuario activo/);

    // Un administrador no puede crear propietarios.
    const adminEmail = uniq("admin");
    const created = await createMemberUser(owner, { email: adminEmail, role: "ADMIN", tempPassword: TEMP });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    const admin = await actorFor({ userId: adminUser.id, email: adminEmail }, owner.tenantId);
    await expect(createMemberUser(admin, { email: uniq("o"), role: "OWNER", tempPassword: TEMP })).rejects.toThrow(/No puede asignar/);
    // …ni modificar al propietario.
    await expect(updateMemberUser(admin, owner.membershipId, { role: "READONLY" })).rejects.toThrow();
    expect(created.kind).toBe("created");
  });

  it("una cuenta propia (o de otra empresa) se agrega sin tocar su clave y no se puede restablecer", async () => {
    const a = await setup();
    const b = await setup();
    const email = uniq("compartido");
    await createMemberUser(a.owner, { email, role: "READONLY", tempPassword: TEMP });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const hashBefore = user.passwordHash;

    // La empresa B agrega el mismo correo: no cambia la clave.
    const r = await createMemberUser(b.owner, { email, role: "WAREHOUSE", tempPassword: OTHER_TEMP });
    expect(r.kind).toBe("existing_account");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash).toBe(hashBefore);

    // Ahora pertenece a dos empresas: ninguna puede restablecer su clave ni su 2FA.
    await expect(resetMemberPassword(b.owner, r.membershipId, OTHER_TEMP)).rejects.toThrow(/no es administrada/);
    const rowA = (await listMemberRows(a.owner)).find((x) => x.email === email)!;
    expect(rowA.managed).toBe(false);
    await expect(resetMemberPassword(a.owner, rowA.membershipId, OTHER_TEMP)).rejects.toThrow(/no es administrada/);
    await expect(resetMemberMfa(a.owner, rowA.membershipId)).rejects.toThrow(/no es administrada/);

    // Al eliminarlo de B, su cuenta sigue activa para A.
    const del = await removeMemberUser(b.owner, r.membershipId);
    expect(del.accountDisabled).toBe(false);
    await authenticateWithPassword(email, TEMP);
  });

  it("otra empresa no puede ver ni modificar a los usuarios", async () => {
    const a = await setup();
    const b = await setup();
    await createMemberUser(a.owner, { email: uniq("aislado"), role: "READONLY", tempPassword: TEMP });
    const target = (await listMemberRows(a.owner)).find((x) => !x.isSelf)!;
    await expect(updateMemberUser(b.owner, target.membershipId, { role: "ADMIN" })).rejects.toThrow(/no encontrado/i);
    await expect(resetMemberPassword(b.owner, target.membershipId, TEMP)).rejects.toThrow(/no encontrado/i);
    await expect(resetMemberMfa(b.owner, target.membershipId)).rejects.toThrow(/no encontrado/i);
    await expect(removeMemberUser(b.owner, target.membershipId)).rejects.toThrow(/no encontrado/i);
    expect((await listMemberRows(b.owner)).some((x) => x.membershipId === target.membershipId)).toBe(false);
  });

  it("restablece clave y 2FA de una cuenta administrada y cierra sus sesiones", async () => {
    const { owner } = await setup();
    const email = uniq("olvido");
    const r = await createMemberUser(owner, { email, role: "WAREHOUSE", tempPassword: TEMP, mfaRequired: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await enrollFactor(user.id, email);
    await prisma.session.create({ data: { userId: user.id, sessionToken: `s-${user.id}`, expires: new Date(Date.now() + 3_600_000) } });
    expect((await listMemberRows(owner)).find((x) => x.email === email)!.mfaEnrolled).toBe(true);

    await resetMemberPassword(owner, r.membershipId, "Nueva-Temporal-2026");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await authenticateWithPassword(email, "Nueva-Temporal-2026");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(true);

    const res = await resetMemberMfa(owner, r.membershipId);
    expect(res.factorRemoved).toBe(true);
    expect((await getMfaStatus(user.id)).enrolled).toBe(false);
    expect((await resolveTenantAccess(user.id, owner.tenantId))!.mfaRequired).toBe(false);

    // Volver a activarla la exige de nuevo en el próximo ingreso.
    await updateMemberUser(owner, r.membershipId, { mfaRequired: true });
    expect((await resolveTenantAccess(user.id, owner.tenantId))!.mfaRequired).toBe(true);
  });

  it("eliminar un usuario administrado deshabilita la cuenta; se puede volver a crear", async () => {
    const { owner } = await setup();
    const email = uniq("baja");
    const r = await createMemberUser(owner, { email, role: "READONLY", tempPassword: TEMP });
    const del = await removeMemberUser(owner, r.membershipId);
    expect(del.accountDisabled).toBe(true);
    await expect(authenticateWithPassword(email, TEMP)).rejects.toThrow();
    const again = await createMemberUser(owner, { email, role: "WAREHOUSE", tempPassword: REENTRY_TEMP });
    expect(again.kind).toBe("reactivated");
    await authenticateWithPassword(email, REENTRY_TEMP);
  });

  it("protege al último propietario y a uno mismo", async () => {
    const { owner } = await setup();
    await expect(removeMemberUser(owner, owner.membershipId)).rejects.toThrow(/sí mismo/);
    await expect(updateMemberUser(owner, owner.membershipId, { role: "ADMIN" })).rejects.toThrow(/propio rol/);
    await expect(resetMemberPassword(owner, owner.membershipId, TEMP)).rejects.toThrow(/Seguridad/);
    // Un segundo propietario no puede dejar la empresa sin dueños.
    const o2 = await createUser("ua-dueno2");
    await addMember(owner.tenantId, o2, "OWNER");
    const owner2: TenantActor = await actorFor(o2, owner.tenantId);
    await removeMemberUser(owner2, owner.membershipId);
    await expect(updateMemberUser(owner2, owner2.membershipId, { status: "DISABLED" })).rejects.toThrow();
  });

  it("los roles sin permiso no gestionan usuarios", async () => {
    const { owner } = await setup();
    const email = uniq("lector");
    await createMemberUser(owner, { email, role: "READONLY", tempPassword: TEMP });
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    const reader = await actorFor({ userId: u.id, email }, owner.tenantId);
    await expect(createMemberUser(reader, { email: uniq("y"), role: "READONLY", tempPassword: TEMP })).rejects.toThrow();
    await expect(resetMemberMfa(reader, owner.membershipId)).rejects.toThrow();
  });
});
