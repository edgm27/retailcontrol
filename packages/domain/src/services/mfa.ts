import { prisma, withContext, type Tx } from "@rc/db";
import { DomainError, conflict, forbidden, notFound, validation } from "../errors";
import { getSecurityConfig } from "../security/config";
import { decryptSecret, encryptSecret } from "../security/crypto";
import { generateRecoveryCodes, hashRecoveryCode } from "../security/recovery-codes";
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from "../security/totp";
import { roleRequiresMfa, type Role } from "../rbac";
import { recordAudit } from "./audit";
import { enforceRateLimit } from "./rate-limit";
import type { RequestMeta, UserActor } from "./types";

export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCK_MINUTES = 15;
const PENDING_ENROLLMENT_TTL_MS = 15 * 60_000;

const aadFor = (userId: string) => `mfa-totp:${userId}`;

export type SecondFactorMethod = "totp" | "recovery";

export interface MfaStatus {
  enrolled: boolean;
  recoveryCodesRemaining: number;
  lockedUntil: Date | null;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [factor, remaining] = await withContext({ userId }, (tx) =>
    Promise.all([
      tx.mfaTotp.findUnique({ where: { userId } }),
      tx.recoveryCode.count({ where: { userId, usedAt: null } }),
    ]),
  );
  return {
    enrolled: !!factor?.confirmedAt,
    recoveryCodesRemaining: factor?.confirmedAt ? remaining : 0,
    lockedUntil: factor?.lockedUntil && factor.lockedUntil > new Date() ? factor.lockedUntil : null,
  };
}

/** ¿El usuario está obligado a tener MFA por su rol en alguna empresa o en la plataforma? */
export async function isMfaMandatory(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  if (user && user.platformRole !== "NONE") return true;
  const roles = await withContext({ userId }, (tx) =>
    tx.membership.findMany({ where: { userId, status: "ACTIVE" }, select: { role: true } }),
  );
  return roles.some((r) => roleRequiresMfa(r.role as Role));
}

/**
 * Inicia (o retoma) el enrolamiento. El secreto pendiente se reutiliza durante
 * 15 minutos para que recargar la página no invalide el QR ya escaneado.
 */
export async function beginTotpEnrollment(
  actor: UserActor,
  now = new Date(),
): Promise<{ secret: string; otpauthUrl: string }> {
  const { mfaEncryptionKey } = getSecurityConfig();
  const existing = await withContext({ userId: actor.userId }, (tx) =>
    tx.mfaTotp.findUnique({ where: { userId: actor.userId } }),
  );
  if (existing?.confirmedAt) throw conflict("La verificación en dos pasos ya está activa.");

  if (existing && now.getTime() - existing.updatedAt.getTime() < PENDING_ENROLLMENT_TTL_MS) {
    const secret = decryptSecret(existing.secretEnc, mfaEncryptionKey, aadFor(actor.userId));
    return { secret, otpauthUrl: buildOtpAuthUrl(actor.email, secret) };
  }

  await enforceRateLimit(`mfa-enroll:${actor.userId}`, 10, 3600);
  const secret = generateTotpSecret();
  const secretEnc = encryptSecret(secret, mfaEncryptionKey, aadFor(actor.userId));
  await withContext({ userId: actor.userId }, (tx) =>
    tx.mfaTotp.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, secretEnc },
      update: { secretEnc, confirmedAt: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null },
    }),
  );
  return { secret, otpauthUrl: buildOtpAuthUrl(actor.email, secret) };
}

type CheckResult =
  | { ok: true; step: number | null }
  | { ok: false; reason: "invalid" | "locked" | "not_enrolled"; lockedUntil?: Date };

/**
 * Verifica un segundo factor con la fila bloqueada (FOR UPDATE): serializa
 * intentos concurrentes, impide reutilizar el mismo código TOTP y aplica el
 * bloqueo por intentos fallidos. NO lanza excepción en fallo para que el
 * contador de intentos sí se confirme en la transacción.
 */
async function checkSecondFactor(
  tx: Tx,
  userId: string,
  method: SecondFactorMethod,
  code: string,
  now: Date,
  opts: { allowUnconfirmed?: boolean } = {},
): Promise<CheckResult> {
  await tx.$queryRaw`SELECT id FROM mfa_totp WHERE user_id = ${userId}::uuid FOR UPDATE`;
  const factor = await tx.mfaTotp.findUnique({ where: { userId } });
  if (!factor || (!factor.confirmedAt && !opts.allowUnconfirmed)) return { ok: false, reason: "not_enrolled" };
  if (factor.lockedUntil && factor.lockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: factor.lockedUntil };
  }

  let ok = false;
  let step: number | null = null;
  if (method === "totp") {
    const { mfaEncryptionKey } = getSecurityConfig();
    const secret = decryptSecret(factor.secretEnc, mfaEncryptionKey, aadFor(userId));
    // Anti-replay: se rechazan pasos de tiempo <= al último aceptado.
    const after = factor.lastUsedStep === null ? null : Number(factor.lastUsedStep);
    step = verifyTotp(secret, code, now.getTime(), after);
    ok = step !== null && (factor.lastUsedStep === null || BigInt(step) > factor.lastUsedStep);
  } else if (factor.confirmedAt) {
    const { recoveryCodePepper } = getSecurityConfig();
    const res = await tx.recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(code, recoveryCodePepper), usedAt: null },
      data: { usedAt: now },
    });
    ok = res.count === 1;
  }

  if (!ok) {
    const failed = factor.failedAttempts + 1;
    const lock = failed >= MFA_MAX_FAILED_ATTEMPTS;
    const lockedUntil = lock ? new Date(now.getTime() + MFA_LOCK_MINUTES * 60_000) : null;
    await tx.mfaTotp.update({
      where: { userId },
      data: { failedAttempts: lock ? 0 : failed, lockedUntil },
    });
    return lock ? { ok: false, reason: "locked", lockedUntil: lockedUntil! } : { ok: false, reason: "invalid" };
  }

  await tx.mfaTotp.update({
    where: { userId },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      ...(step !== null ? { lastUsedStep: BigInt(step) } : {}),
    },
  });
  return { ok: true, step };
}

function failureToError(r: Exclude<CheckResult, { ok: true }>): DomainError {
  if (r.reason === "locked") {
    return new DomainError(
      "MFA_LOCKED",
      `Demasiados intentos fallidos. Intente de nuevo después de ${MFA_LOCK_MINUTES} minutos.`,
      { lockedUntil: r.lockedUntil?.toISOString() },
    );
  }
  if (r.reason === "not_enrolled") return new DomainError("MFA_INVALID", "La verificación en dos pasos no está configurada.");
  return new DomainError("MFA_INVALID", "Código incorrecto.");
}

async function storeNewRecoveryCodes(tx: Tx, userId: string): Promise<string[]> {
  const { recoveryCodePepper } = getSecurityConfig();
  const codes = generateRecoveryCodes();
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.recoveryCode.createMany({
    data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c, recoveryCodePepper) })),
  });
  return codes;
}

/** Confirma el enrolamiento con un código válido y entrega los códigos de recuperación (una sola vez). */
export async function confirmTotpEnrollment(
  actor: UserActor,
  sessionId: string,
  code: string,
  now = new Date(),
): Promise<{ recoveryCodes: string[] }> {
  const result = await withContext({ userId: actor.userId }, async (tx) => {
    const factor = await tx.mfaTotp.findUnique({ where: { userId: actor.userId } });
    if (!factor) throw notFound("Inicie la configuración de nuevo.");
    if (factor.confirmedAt) throw conflict("La verificación en dos pasos ya está activa.");
    const check = await checkSecondFactor(tx, actor.userId, "totp", code, now, { allowUnconfirmed: true });
    if (!check.ok) return check;
    await tx.mfaTotp.update({ where: { userId: actor.userId }, data: { confirmedAt: now } });
    const recoveryCodes = await storeNewRecoveryCodes(tx, actor.userId);
    await tx.session.updateMany({ where: { id: sessionId, userId: actor.userId }, data: { mfaVerifiedAt: now } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "mfa.enrolled",
      entityType: "User",
      entityId: actor.userId,
      meta: actor.meta,
    });
    return { ok: true as const, recoveryCodes };
  });
  if (!result.ok) throw failureToError(result);
  return { recoveryCodes: result.recoveryCodes };
}

/** Verifica el segundo factor para la sesión actual (después del inicio de sesión). */
export async function verifySessionMfa(
  actor: UserActor,
  sessionId: string,
  method: SecondFactorMethod,
  code: string,
  now = new Date(),
): Promise<{ recoveryCodesRemaining: number }> {
  await enforceRateLimit(`mfa-verify:${actor.userId}`, 30, 900);
  const result = await withContext({ userId: actor.userId }, async (tx) => {
    const check = await checkSecondFactor(tx, actor.userId, method, code, now);
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: check.ok
        ? method === "recovery" ? "mfa.recovery_code_used" : "mfa.verified"
        : check.reason === "locked" ? "mfa.locked" : "mfa.failed",
      entityType: "User",
      entityId: actor.userId,
      metadata: { method },
      meta: actor.meta,
    });
    if (!check.ok) return check;
    const updated = await tx.session.updateMany({
      where: { id: sessionId, userId: actor.userId },
      data: { mfaVerifiedAt: now },
    });
    if (updated.count !== 1) throw notFound("Sesión no encontrada.");
    const remaining = await tx.recoveryCode.count({ where: { userId: actor.userId, usedAt: null } });
    return { ok: true as const, remaining };
  });
  if (!result.ok) throw failureToError(result);
  return { recoveryCodesRemaining: result.remaining };
}

/** Regenera los códigos de recuperación (exige un código TOTP actual: step-up). */
export async function regenerateRecoveryCodes(
  actor: UserActor,
  totpCode: string,
  now = new Date(),
): Promise<{ recoveryCodes: string[] }> {
  const result = await withContext({ userId: actor.userId }, async (tx) => {
    const check = await checkSecondFactor(tx, actor.userId, "totp", totpCode, now);
    if (!check.ok) return check;
    const recoveryCodes = await storeNewRecoveryCodes(tx, actor.userId);
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "mfa.recovery_codes_regenerated",
      entityType: "User",
      entityId: actor.userId,
      meta: actor.meta,
    });
    return { ok: true as const, recoveryCodes };
  });
  if (!result.ok) throw failureToError(result);
  return { recoveryCodes: result.recoveryCodes };
}

/** Desactiva MFA (solo si el rol del usuario no lo exige). Exige código TOTP. */
export async function disableTotp(actor: UserActor, totpCode: string, now = new Date()): Promise<void> {
  if (await isMfaMandatory(actor.userId)) {
    throw forbidden("Su rol exige verificación en dos pasos; no puede desactivarla.");
  }
  const result = await withContext({ userId: actor.userId }, async (tx) => {
    const check = await checkSecondFactor(tx, actor.userId, "totp", totpCode, now);
    if (!check.ok) return check;
    await tx.recoveryCode.deleteMany({ where: { userId: actor.userId } });
    await tx.mfaTotp.delete({ where: { userId: actor.userId } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: actor.userId,
      action: "mfa.disabled",
      entityType: "User",
      entityId: actor.userId,
      meta: actor.meta,
    });
    return { ok: true as const };
  });
  if (!result.ok) throw failureToError(result);
}

/**
 * Recuperación asistida (usuario perdió dispositivo y códigos): solo un
 * superadministrador, con justificación, tras verificar identidad fuera de
 * banda (ver docs/security-threat-model.md). Borra el factor y revoca TODAS
 * las sesiones del usuario; al volver a entrar deberá enrolarse de nuevo.
 */
export async function adminResetMfa(
  admin: { userId: string; meta?: RequestMeta },
  targetUserId: string,
  reason: string,
): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: admin.userId }, select: { platformRole: true } });
  if (actor?.platformRole !== "SUPERADMIN") throw forbidden();
  if (admin.userId === targetUserId) throw forbidden("No puede restablecer su propio segundo factor.");
  if (reason.trim().length < 15) throw validation("Indique una justificación detallada (mínimo 15 caracteres).");

  await withContext({ userId: admin.userId, platformAdmin: true }, async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId: targetUserId } });
    await tx.mfaTotp.deleteMany({ where: { userId: targetUserId } });
    const revoked = await tx.session.deleteMany({ where: { userId: targetUserId } });
    await recordAudit(tx, {
      tenantId: null,
      actorUserId: admin.userId,
      action: "platform.mfa_reset",
      entityType: "User",
      entityId: targetUserId,
      metadata: { reason: reason.trim(), sessionsRevoked: revoked.count },
      meta: admin.meta,
    });
  });
}
