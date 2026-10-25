import { randomInt } from "node:crypto";
import { hmacSha256 } from "./crypto";

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_CODE_COUNT = 10;

/** Código de 10 caracteres (≈49 bits) con formato XXXXX-XXXXX. */
export function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(generateRecoveryCode());
  return [...set];
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function hashRecoveryCode(code: string, pepper: string): string {
  return hmacSha256(normalizeRecoveryCode(code), pepper);
}
