import { describe, expect, it } from "vitest";
import { redact } from "../src/services/audit";
import { subscriptionAccessMode, subscriptionPhase } from "../src/services/subscription-access";
import { isValidRifFormat, normalizeRif } from "../src/validation/rif";
import { createProductSchema, createTenantSchema } from "../src/validation/schemas";

describe("RIF (solo formato)", () => {
  it("normaliza variantes de formato", () => {
    expect(normalizeRif("j123456789")).toBe("J-12345678-9");
    expect(normalizeRif(" V-12345678-0 ")).toBe("V-12345678-0");
  });
  it("rechaza letras o longitudes inválidas", () => {
    expect(isValidRifFormat("X-12345678-9")).toBe(false);
    expect(isValidRifFormat("J-1234567-9")).toBe(false);
  });
  it("el esquema de empresa acepta RIF vacío y rechaza RIF mal formado", () => {
    expect(createTenantSchema.parse({ name: "Mi Abasto", rif: "" }).rif).toBeNull();
    expect(() => createTenantSchema.parse({ name: "Mi Abasto", rif: "123" })).toThrow();
  });
});

describe("SKU", () => {
  it("normaliza a mayúsculas y rechaza caracteres no permitidos", () => {
    expect(createProductSchema.parse({ sku: " harina-1kg ", name: "Harina" }).sku).toBe("HARINA-1KG");
    expect(() => createProductSchema.parse({ sku: "a b", name: "x" })).toThrow();
    expect(() => createProductSchema.parse({ sku: "<script>", name: "xx" })).toThrow();
  });
});

describe("Modo de acceso por estado de suscripción", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const past = new Date("2026-05-01T00:00:00Z");
  const future = new Date("2026-07-01T00:00:00Z");
  it.each([
    [{ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null }, "full"],
    [{ status: "TRIALING", trialEndsAt: future, graceEndsAt: null }, "full"],
    [{ status: "TRIALING", trialEndsAt: past, graceEndsAt: null }, "read_only"],
    [{ status: "PAST_DUE", trialEndsAt: null, graceEndsAt: future }, "full"],
    [{ status: "PAST_DUE", trialEndsAt: null, graceEndsAt: past }, "read_only"],
    [{ status: "SUSPENDED", trialEndsAt: null, graceEndsAt: null }, "read_only"],
    [{ status: "CANCELED", trialEndsAt: null, graceEndsAt: null }, "read_only"],
    // Período pagado vencido: 7 días de gracia y luego solo lectura.
    [{ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: future }, "full"],
    [{ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: new Date("2026-05-28T00:00:00Z") }, "full"],
    [{ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: past }, "read_only"],
  ] as const)("%o => %s", (sub, expected) => {
    expect(subscriptionAccessMode(sub, now)).toBe(expected);
  });
  it("sin suscripción => solo lectura", () => {
    expect(subscriptionAccessMode(null, now)).toBe("read_only");
  });
  it("fase y días restantes para los avisos", () => {
    expect(subscriptionPhase({ status: "TRIALING", trialEndsAt: new Date("2026-06-04T00:00:00Z"), graceEndsAt: null }, now)).toEqual({ phase: "trial", daysLeft: 3 });
    expect(subscriptionPhase({ status: "TRIALING", trialEndsAt: past, graceEndsAt: null }, now).phase).toBe("trial_expired");
    expect(subscriptionPhase({ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: new Date("2026-05-28T00:00:00Z") }, now))
      .toEqual({ phase: "grace", daysLeft: 3 });
    expect(subscriptionPhase({ status: "ACTIVE", trialEndsAt: null, graceEndsAt: null, currentPeriodEnd: past }, now).phase).toBe("expired");
  });
});

describe("Redacción de datos sensibles en auditoría", () => {
  it("elimina secretos y tokens en cualquier nivel", () => {
    const out = redact({ name: "x", token: "t", nested: { secretEnc: "s", ok: 1, passwordHash: "p" } }) as Record<string, unknown>;
    expect(out.name).toBe("x");
    expect(out.token).toBe("[REDACTADO]");
    expect(out.nested).toEqual({ secretEnc: "[REDACTADO]", ok: 1, passwordHash: "[REDACTADO]" });
  });
});
