import { prisma, withContext } from "@rc/db";
import {
  MFA_MAX_FAILED_ATTEMPTS,
  adminResetMfa,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  generateTotp,
  getMfaStatus,
  isMfaMandatory,
  listUserSessions,
  regenerateRecoveryCodes,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  verifySessionMfa,
  type UserActor,
} from "@rc/domain";
import { describe, expect, it } from "vitest";
import { addMember, createCompany, createSession, createUser } from "./helpers";

async function enrolled(prefix: string, now = Date.now()) {
  const user = await createUser(prefix);
  const session = await createSession(user.userId);
  const { secret } = await beginTotpEnrollment(user);
  const { recoveryCodes } = await confirmTotpEnrollment(user, session.id, generateTotp(secret, now), new Date(now));
  return { user, session, secret, recoveryCodes };
}

describe("MFA TOTP (aceptación 10)", () => {
  it("el enrolamiento exige un código válido; el secreto se guarda cifrado", async () => {
    const user = await createUser("mfa-enrol");
    const session = await createSession(user.userId);
    const { secret, otpauthUrl } = await beginTotpEnrollment(user);
    expect(otpauthUrl).toContain(encodeURIComponent(user.email));

    const row = await withContext({ userId: user.userId }, (tx) => tx.mfaTotp.findUnique({ where: { userId: user.userId } }));
    expect(row?.secretEnc).not.toContain(secret);
    expect(row?.confirmedAt).toBeNull();

    await expect(confirmTotpEnrollment(user, session.id, "000000")).rejects.toMatchObject({ code: "MFA_INVALID" });
    const { recoveryCodes } = await confirmTotpEnrollment(user, session.id, generateTotp(secret));
    expect(recoveryCodes).toHaveLength(10);

    const status = await getMfaStatus(user.userId);
    expect(status).toMatchObject({ enrolled: true, recoveryCodesRemaining: 10 });
    const s = await prisma.session.findUnique({ where: { id: session.id } });
    expect(s?.mfaVerifiedAt).not.toBeNull();

    // Los códigos de recuperación no se guardan en claro.
    const hashes = await withContext({ userId: user.userId }, (tx) => tx.recoveryCode.findMany({ where: { userId: user.userId } }));
    expect(hashes.some((h) => recoveryCodes.includes(h.codeHash))).toBe(false);
  });

  it("recargar la página dentro de 15 min conserva el mismo secreto pendiente", async () => {
    const user = await createUser("mfa-recarga");
    const a = await beginTotpEnrollment(user);
    const b = await beginTotpEnrollment(user);
    expect(b.secret).toBe(a.secret);
  });

  it("un código TOTP no puede reutilizarse (anti-replay)", async () => {
    const t0 = Date.now();
    const { user, secret } = await enrolled("mfa-replay", t0);
    const s2 = await createSession(user.userId);
    const later = t0 + 30_000;
    const code = generateTotp(secret, later);
    await verifySessionMfa(user, s2.id, "totp", code, new Date(later));
    const s3 = await createSession(user.userId);
    await expect(verifySessionMfa(user, s3.id, "totp", code, new Date(later))).rejects.toMatchObject({ code: "MFA_INVALID" });
  });

  it("verificaciones concurrentes con el mismo código: solo una tiene éxito", async () => {
    const t0 = Date.now();
    const { user, secret } = await enrolled("mfa-race", t0);
    const later = t0 + 30_000;
    const code = generateTotp(secret, later);
    const sessions = await Promise.all([1, 2, 3].map(() => createSession(user.userId)));
    const results = await Promise.allSettled(
      sessions.map((s) => verifySessionMfa(user, s.id, "totp", code, new Date(later))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it(`bloquea tras ${MFA_MAX_FAILED_ATTEMPTS} intentos fallidos, incluso con el código correcto`, async () => {
    const t0 = Date.now();
    const { user, secret } = await enrolled("mfa-lock", t0);
    const s = await createSession(user.userId);
    for (let i = 1; i < MFA_MAX_FAILED_ATTEMPTS; i++) {
      await expect(verifySessionMfa(user, s.id, "totp", "111111")).rejects.toMatchObject({ code: "MFA_INVALID" });
    }
    await expect(verifySessionMfa(user, s.id, "totp", "111111")).rejects.toMatchObject({ code: "MFA_LOCKED" });
    const later = t0 + 30_000;
    await expect(
      verifySessionMfa(user, s.id, "totp", generateTotp(secret, later), new Date(later)),
    ).rejects.toMatchObject({ code: "MFA_LOCKED" });
    // Los intentos fallidos (y el intento durante el bloqueo) quedan auditados aunque la operación falle.
    const count = (action: string) =>
      withContext({ userId: user.userId }, (tx) => tx.auditEvent.count({ where: { actorUserId: user.userId, action } }));
    expect(await count("mfa.failed")).toBe(MFA_MAX_FAILED_ATTEMPTS - 1);
    expect(await count("mfa.locked")).toBe(2);
  });

  it("código de recuperación: sirve una sola vez", async () => {
    const { user, recoveryCodes } = await enrolled("mfa-recovery");
    const s = await createSession(user.userId);
    const code = recoveryCodes[0]!.toLowerCase().replace("-", " ");
    await expect(verifySessionMfa(user, s.id, "recovery", code)).resolves.toEqual({ recoveryCodesRemaining: 9 });
    const s2 = await createSession(user.userId);
    await expect(verifySessionMfa(user, s2.id, "recovery", recoveryCodes[0]!)).rejects.toMatchObject({ code: "MFA_INVALID" });
  });

  it("regenerar códigos exige TOTP e invalida los anteriores", async () => {
    const t0 = Date.now();
    const { user, secret, recoveryCodes } = await enrolled("mfa-regen", t0);
    await expect(regenerateRecoveryCodes(user, "123456")).rejects.toMatchObject({ code: "MFA_INVALID" });
    const later = t0 + 30_000;
    const { recoveryCodes: fresh } = await regenerateRecoveryCodes(user, generateTotp(secret, later), new Date(later));
    const s = await createSession(user.userId);
    await expect(verifySessionMfa(user, s.id, "recovery", recoveryCodes[1]!)).rejects.toMatchObject({ code: "MFA_INVALID" });
    await expect(verifySessionMfa(user, s.id, "recovery", fresh[0]!)).resolves.toBeTruthy();
  });

  it("propietarios y administradores no pueden desactivar MFA; otros roles sí", async () => {
    const t0 = Date.now();
    const { user: owner, secret } = await enrolled("mfa-owner", t0);
    await createCompany(owner, "BASICO");
    expect(await isMfaMandatory(owner.userId)).toBe(true);
    await expect(disableTotp(owner, generateTotp(secret, t0 + 30_000), new Date(t0 + 30_000))).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { user: clerk, secret: s2 } = await enrolled("mfa-clerk", t0);
    const other = await createUser("otro-dueno");
    const t = (await createCompany(other, "PROFESIONAL")).tenant.id;
    await addMember(t, clerk, "WAREHOUSE");
    expect(await isMfaMandatory(clerk.userId)).toBe(false);
    await disableTotp(clerk, generateTotp(s2, t0 + 30_000), new Date(t0 + 30_000));
    expect((await getMfaStatus(clerk.userId)).enrolled).toBe(false);
  });

  it("un usuario no puede leer el factor MFA de otro (RLS por usuario)", async () => {
    const { user: victim } = await enrolled("mfa-victima");
    const attacker = await createUser("mfa-atacante");
    const rows = await withContext({ userId: attacker.userId }, (tx) =>
      tx.mfaTotp.findMany({ where: { userId: victim.userId } }),
    );
    expect(rows).toHaveLength(0);
    expect(await prisma.mfaTotp.count()).toBe(0);
    expect(await prisma.recoveryCode.count()).toBe(0);
  });
});

describe("Recuperación asistida por plataforma", () => {
  it("solo un superadmin, con justificación; borra el factor y revoca todas las sesiones", async () => {
    const { user } = await enrolled("mfa-perdido");
    await createSession(user.userId);
    const support = await createUser("soporte");
    await expect(adminResetMfa({ userId: support.userId }, user.userId, "Identidad verificada por videollamada")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const sa = await createUser("superadmin");
    await prisma.user.update({ where: { id: sa.userId }, data: { platformRole: "SUPERADMIN" } });
    await expect(adminResetMfa({ userId: sa.userId }, user.userId, "corto")).rejects.toMatchObject({ code: "VALIDATION" });
    await adminResetMfa({ userId: sa.userId }, user.userId, "Identidad verificada por videollamada y documento");

    expect((await getMfaStatus(user.userId)).enrolled).toBe(false);
    expect(await prisma.session.count({ where: { userId: user.userId } })).toBe(0);
    const ev = await withContext({ platformAdmin: true }, (tx) =>
      tx.auditEvent.findFirst({ where: { action: "platform.mfa_reset", entityId: user.userId } }),
    );
    expect(ev?.actorUserId).toBe(sa.userId);
  });
});

describe("Sesiones revocables", () => {
  async function userWithSessions(n: number): Promise<{ user: UserActor; ids: string[] }> {
    const user = await createUser("sesiones");
    const ids = [];
    for (let i = 0; i < n; i++) ids.push((await createSession(user.userId)).id);
    return { user, ids };
  }

  it("revocar una sesión la elimina; no se pueden revocar sesiones ajenas", async () => {
    const { user, ids } = await userWithSessions(2);
    const { user: other, ids: otherIds } = await userWithSessions(1);
    await revokeSession(user, ids[0]!);
    expect((await listUserSessions(user.userId)).map((s) => s.id)).toEqual([ids[1]]);
    await expect(revokeSession(user, otherIds[0]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listUserSessions(other.userId)).toHaveLength(1);
  });

  it("cerrar las demás sesiones conserva la actual; cerrar todas no deja ninguna", async () => {
    const { user, ids } = await userWithSessions(3);
    expect(await revokeOtherSessions(user, ids[0]!)).toBe(2);
    expect((await listUserSessions(user.userId)).map((s) => s.id)).toEqual([ids[0]]);
    expect(await revokeAllSessions(user)).toBe(1);
    expect(await listUserSessions(user.userId)).toHaveLength(0);
  });
});
