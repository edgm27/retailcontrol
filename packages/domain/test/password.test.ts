import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "../src/security/password";
import { privilegedMfaEnforced, roleRequiresMfa } from "../src/rbac";

describe("Hash de contraseñas (scrypt)", () => {
  it("verifica la contraseña correcta y rechaza otras; el hash no contiene la clave", async () => {
    const h = await hashPassword("Una-clave-de-prueba-larga");
    expect(h).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(h).not.toContain("Una-clave");
    expect(await verifyPassword("Una-clave-de-prueba-larga", h)).toBe(true);
    expect(await verifyPassword("una-clave-de-prueba-larga", h)).toBe(false);
    expect(await verifyPassword("x", "formato-invalido")).toBe(false);
  });

  it("usa sal aleatoria: la misma clave produce hashes distintos", async () => {
    expect(await hashPassword("Otra-clave-de-prueba")).not.toBe(await hashPassword("Otra-clave-de-prueba"));
  });
});

describe("Política de contraseñas", () => {
  it("exige 12+ caracteres y rechaza claves obvias o que contienen el correo", () => {
    expect(validatePasswordPolicy("corta1!")).toMatch(/12/);
    expect(validatePasswordPolicy("administrador")).toMatch(/común/);
    expect(validatePasswordPolicy("maria.perez2026!", "maria.perez@example.com")).toMatch(/correo/);
    expect(validatePasswordPolicy("aaaaaaaaaaaaaa")).toMatch(/repetido/);
    expect(validatePasswordPolicy("Clave-Larga-Y-Unica-2026")).toBeNull();
  });
});

describe("MFA de roles privilegiados configurable", () => {
  it("obligatorio por defecto; opcional solo con MFA_ENFORCE_PRIVILEGED_ROLES=false", () => {
    expect(privilegedMfaEnforced({})).toBe(true);
    expect(privilegedMfaEnforced({ MFA_ENFORCE_PRIVILEGED_ROLES: "false" })).toBe(false);
    const prev = process.env.MFA_ENFORCE_PRIVILEGED_ROLES;
    process.env.MFA_ENFORCE_PRIVILEGED_ROLES = "false";
    try {
      expect(roleRequiresMfa("OWNER")).toBe(false);
      expect(roleRequiresMfa("OWNER", true)).toBe(true); // la empresa puede exigirlo a todos
    } finally {
      if (prev === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED_ROLES;
      else process.env.MFA_ENFORCE_PRIVILEGED_ROLES = prev;
    }
  });
});
