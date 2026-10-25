import { prisma, withContext } from "@rc/db";
import {
  authenticateWithPassword,
  createUserSession,
  ensureBootstrapAdmin,
  listUserTenants,
  resolveTenantAccess,
  setPassword,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { createSession, createUser } from "./helpers";

const PASS = "Clave-De-Prueba-2026!";

describe("Inicio de sesión con contraseña", () => {
  it("define contraseña y luego entra; mensaje genérico ante clave o correo erróneos", async () => {
    const u = await createUser("pwd");
    const s = await createSession(u.userId);
    await setPassword({ ...u, sessionId: s.id }, { next: PASS, confirm: PASS });

    await expect(authenticateWithPassword(u.email.toUpperCase(), PASS)).resolves.toEqual({ userId: u.userId });
    await expect(authenticateWithPassword(u.email, "otra-clave-incorrecta")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Correo o contraseña incorrectos.",
    });
    await expect(authenticateWithPassword("no.existe@example.com", PASS)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Correo o contraseña incorrectos.",
    });
    const stored = await prisma.user.findUnique({ where: { id: u.userId } });
    expect(stored?.passwordHash).not.toContain(PASS);
  });

  it("un usuario sin contraseña (solo Google/enlace) no puede entrar por contraseña", async () => {
    const u = await createUser("sin-clave");
    await expect(authenticateWithPassword(u.email, PASS)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("bloquea tras 10 intentos por correo en 15 minutos", async () => {
    const u = await createUser("fuerza-bruta");
    const s = await createSession(u.userId);
    await setPassword({ ...u, sessionId: s.id }, { next: PASS, confirm: PASS });
    for (let i = 0; i < 10; i++) {
      await expect(authenticateWithPassword(u.email, `incorrecta-${i}-xxxx`, { ipAddress: `10.0.0.${i}` })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(authenticateWithPassword(u.email, "incorrecta-final-xx", { ipAddress: "10.0.1.1" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const fails = await withContext({ userId: u.userId }, (tx) =>
      tx.auditEvent.count({ where: { actorUserId: u.userId, action: "auth.password_failed" } }),
    );
    expect(fails).toBe(10); // cada intento fallido queda en la auditoría
    // Bloqueado incluso con la contraseña correcta mientras dure la ventana.
    await expect(authenticateWithPassword(u.email, PASS, { ipAddress: "10.0.2.1" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  }, 60_000);

  it("cambiar la contraseña exige la actual y cierra las demás sesiones", async () => {
    const u = await createUser("cambio");
    const s1 = await createSession(u.userId);
    await setPassword({ ...u, sessionId: s1.id }, { next: PASS, confirm: PASS });
    const other = await createUserSession(u.userId);
    expect(await prisma.session.count({ where: { userId: u.userId } })).toBe(2);

    await expect(setPassword({ ...u, sessionId: s1.id }, { current: "mal-mal-mal-mal", next: "Nueva-Clave-2026-x", confirm: "Nueva-Clave-2026-x" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setPassword({ ...u, sessionId: s1.id }, { current: PASS, next: "Nueva-Clave-2026-x", confirm: "otra" })).rejects.toMatchObject({ code: "VALIDATION" });
    const r = await setPassword({ ...u, sessionId: s1.id }, { current: PASS, next: "Nueva-Clave-2026-x", confirm: "Nueva-Clave-2026-x" });
    expect(r.otherSessionsRevoked).toBe(1);
    expect(await prisma.session.findUnique({ where: { sessionToken: other.sessionToken } })).toBeNull();
    await expect(authenticateWithPassword(u.email, PASS)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticateWithPassword(u.email, "Nueva-Clave-2026-x")).resolves.toBeTruthy();
  });
});

describe("Administrador inicial de pruebas", () => {
  it("se crea con empresa propia como propietario y es idempotente (no pisa la contraseña)", async () => {
    const email = `admin.${Date.now()}@example.com`;
    const first = await ensureBootstrapAdmin({ email, password: "Clave-Inicial-2026!", companyName: "Demo Admin" });
    expect(first.created).toBe(true);
    const tenants = await listUserTenants(first.userId);
    expect(tenants).toEqual([expect.objectContaining({ name: "Demo Admin", role: "OWNER" })]);

    const again = await ensureBootstrapAdmin({ email, password: "Otra-Clave-Distinta-9!" });
    expect(again).toEqual({ created: false, userId: first.userId });
    await expect(authenticateWithPassword(email, "Clave-Inicial-2026!")).resolves.toEqual({ userId: first.userId });
  });

  it("rechaza contraseñas iniciales débiles", async () => {
    await expect(ensureBootstrapAdmin({ email: "debil@example.com", password: "123" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("con MFA_ENFORCE_PRIVILEGED_ROLES=false el propietario entra sin MFA; por defecto se exige", async () => {
    const email = `admin.mfa.${Date.now()}@example.com`;
    const { userId, tenantId } = await ensureBootstrapAdmin({ email, password: "Clave-Inicial-2026!" });
    expect((await resolveTenantAccess(userId, tenantId!))?.mfaRequired).toBe(true);
    process.env.MFA_ENFORCE_PRIVILEGED_ROLES = "false";
    try {
      expect((await resolveTenantAccess(userId, tenantId!))?.mfaRequired).toBe(false);
    } finally {
      delete process.env.MFA_ENFORCE_PRIVILEGED_ROLES;
    }
  });
});
