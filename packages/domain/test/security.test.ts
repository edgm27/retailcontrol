import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSecurityConfig } from "../src/security/config";
import { decryptSecret, encryptSecret, hmacSha256, safeEqual } from "../src/security/crypto";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "../src/security/recovery-codes";
import { buildOtpAuthUrl, generateTotp, generateTotpSecret, verifyTotp } from "../src/security/totp";

const key = randomBytes(32);

describe("Cifrado AES-256-GCM de secretos", () => {
  it("cifra y descifra con el mismo AAD", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", key, "mfa:u1");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc, key, "mfa:u1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("rechaza descifrar con otro AAD (no se puede copiar el secreto a otro usuario)", () => {
    const enc = encryptSecret("secreto", key, "mfa:u1");
    expect(() => decryptSecret(enc, key, "mfa:u2")).toThrow();
  });

  it("rechaza texto cifrado manipulado o con otra clave", () => {
    const enc = encryptSecret("secreto", key, "a");
    const parts = enc.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key, "a")).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32), "a")).toThrow();
  });

  it("produce IV distinto en cada cifrado", () => {
    expect(encryptSecret("x", key, "a")).not.toBe(encryptSecret("x", key, "a"));
  });

  it("comparación en tiempo constante", () => {
    expect(safeEqual(hmacSha256("a", "p"), hmacSha256("a", "p"))).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("TOTP RFC 6238", () => {
  const secret = generateTotpSecret();
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("genera secretos base32 de 160 bits compatibles con Google Authenticator", () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const url = buildOtpAuthUrl("ana@example.com", secret);
    expect(url).toMatch(/^otpauth:\/\/totp\/RetailControl:ana%40example\.com\?secret=/);
    expect(url).toContain("issuer=RetailControl");
  });

  it("acepta el código vigente y devuelve su paso de tiempo", () => {
    const code = generateTotp(secret, t0);
    expect(verifyTotp(secret, code, t0)).toBe(Math.floor(t0 / 30000));
  });

  it("tolera ±1 paso (30 s) de desfase y rechaza más", () => {
    const prev = generateTotp(secret, t0 - 30_000);
    expect(verifyTotp(secret, prev, t0)).toBe(Math.floor(t0 / 30000) - 1);
    const old = generateTotp(secret, t0 - 90_000);
    expect(verifyTotp(secret, old, t0)).toBeNull();
  });

  it("rechaza formatos inválidos", () => {
    expect(verifyTotp(secret, "12345", t0)).toBeNull();
    expect(verifyTotp(secret, "abcdef", t0)).toBeNull();
  });

  it("cumple los vectores de prueba oficiales del RFC 6238 (SHA-1)", () => {
    // Secreto ASCII "12345678901234567890" en base32; se comparan los 6 últimos dígitos.
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow (vector público del RFC 6238)
    expect(generateTotp(rfcSecret, 59_000)).toBe("287082");
    expect(generateTotp(rfcSecret, 1_111_111_109_000)).toBe("081804");
    expect(generateTotp(rfcSecret, 1_234_567_890_000)).toBe("005924");
    expect(generateTotp(rfcSecret, 2_000_000_000_000)).toBe("279037");
  });

  it("anti-replay: rechaza un paso de tiempo igual o anterior al último usado", () => {
    const code = generateTotp(secret, t0);
    const step = Math.floor(t0 / 30000);
    expect(verifyTotp(secret, code, t0, step - 1)).toBe(step);
    expect(verifyTotp(secret, code, t0, step)).toBeNull();
  });
});

describe("Códigos de recuperación", () => {
  it("genera 10 códigos únicos con formato XXXXX-XXXXX sin caracteres ambiguos", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  });

  it("normaliza mayúsculas, espacios y guiones antes de calcular el hash", () => {
    expect(normalizeRecoveryCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(hashRecoveryCode("abcde fghjk", "p".repeat(32))).toBe(hashRecoveryCode("ABCDE-FGHJK", "p".repeat(32)));
  });

  it("el hash depende de la pimienta", () => {
    expect(hashRecoveryCode("ABCDE-FGHJK", "a".repeat(32))).not.toBe(hashRecoveryCode("ABCDE-FGHJK", "b".repeat(32)));
  });
});

describe("Configuración de claves", () => {
  const pepper = "p".repeat(32);
  it("acepta 32 bytes en base64 tal cual", () => {
    const k = randomBytes(32);
    expect(getSecurityConfig({ MFA_ENCRYPTION_KEY: k.toString("base64"), RECOVERY_CODE_PEPPER: pepper }).mfaEncryptionKey.equals(k)).toBe(true);
  });
  it("deriva 32 bytes de un secreto largo con otro formato, de forma determinista", () => {
    const env = { MFA_ENCRYPTION_KEY: "x".repeat(40), RECOVERY_CODE_PEPPER: pepper };
    const a = getSecurityConfig(env).mfaEncryptionKey;
    expect(a).toHaveLength(32);
    expect(getSecurityConfig({ ...env }).mfaEncryptionKey.equals(a)).toBe(true);
  });
  it("rechaza secretos cortos", () => {
    expect(() => getSecurityConfig({ MFA_ENCRYPTION_KEY: "corto", RECOVERY_CODE_PEPPER: pepper })).toThrow();
  });
});
