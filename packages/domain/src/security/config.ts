import { hkdfSync } from "node:crypto";

/**
 * Configuración criptográfica leída del entorno (o de un gestor de secretos
 * que la inyecte como variables). Falla de forma explícita si falta algo.
 */
export interface SecurityConfig {
  /** Clave AES-256 (32 bytes) para cifrar secretos TOTP. */
  mfaEncryptionKey: Buffer;
  /** Pimienta HMAC para códigos de recuperación (>= 32 caracteres). */
  recoveryCodePepper: string;
}

let cached: SecurityConfig | null = null;

/**
 * Acepta 32 bytes en base64 (formato recomendado) o un secreto aleatorio de al
 * menos 32 caracteres (p. ej. generado por la plataforma de despliegue), del
 * que se deriva una clave de 32 bytes con HKDF-SHA256.
 */
function deriveKey(value: string): Buffer {
  const raw = Buffer.from(value, "base64");
  if (raw.length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(value)) return raw;
  if (value.length < 32) throw new Error("MFA_ENCRYPTION_KEY debe ser 32 bytes en base64 o un secreto de 32+ caracteres.");
  return Buffer.from(hkdfSync("sha256", value, "retailcontrol", "mfa-encryption-key-v1", 32));
}

export function getSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  if (cached && env === process.env) return cached;
  const keyB64 = env.MFA_ENCRYPTION_KEY;
  const pepper = env.RECOVERY_CODE_PEPPER;
  if (!keyB64) throw new Error("Falta MFA_ENCRYPTION_KEY (32 bytes en base64).");
  const key = deriveKey(keyB64);
  if (!pepper || pepper.length < 32) {
    throw new Error("Falta RECOVERY_CODE_PEPPER o tiene menos de 32 caracteres.");
  }
  const cfg = { mfaEncryptionKey: key, recoveryCodePepper: pepper };
  if (env === process.env) cached = cfg;
  return cfg;
}

/** Solo para pruebas. */
export function resetSecurityConfigCache(): void {
  cached = null;
}
