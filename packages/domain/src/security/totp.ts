import { generateSecret, generateSync, generateURI, verifySync } from "otplib";

/**
 * TOTP RFC 6238 compatible con Google Authenticator: SHA-1, 6 dígitos, 30 s.
 * Se acepta ±1 paso de tolerancia (±30 s) por desfase de reloj.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_TOLERANCE_SECONDS = 30;
export const TOTP_ISSUER = "RetailControl";

export function generateTotpSecret(): string {
  // 20 bytes = 160 bits (recomendación RFC 4226) => 32 caracteres base32.
  return generateSecret({ length: 20 });
}

export function buildOtpAuthUrl(accountLabel: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountLabel, secret, period: TOTP_STEP_SECONDS, digits: 6 });
}

export function normalizeTotpCode(code: string): string {
  return code.replace(/\s+/g, "");
}

/**
 * Verifica el código y devuelve el paso de tiempo (time-step) que coincidió,
 * o null si no es válido. Con `afterStep`, rechaza pasos <= afterStep
 * (anti-replay: un código ya usado no vuelve a servir).
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
  afterStep?: number | null,
): number | null {
  const token = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(token)) return null;
  const res = verifySync({
    secret,
    token,
    epoch: Math.floor(nowMs / 1000),
    period: TOTP_STEP_SECONDS,
    digits: 6,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
    ...(afterStep != null ? { afterTimeStep: afterStep } : {}),
  });
  return res.valid && "timeStep" in res ? res.timeStep : null;
}

/** Útil para pruebas y herramientas de desarrollo. */
export function generateTotp(secret: string, nowMs: number = Date.now()): string {
  return generateSync({ secret, epoch: Math.floor(nowMs / 1000), period: TOTP_STEP_SECONDS, digits: 6 });
}
