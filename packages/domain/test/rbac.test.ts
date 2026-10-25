import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  TENANT_ROLES,
  assertPermission,
  canAssignRole,
  hasPermission,
  roleRequiresMfa,
  type Permission,
  type Role,
} from "../src/rbac";

describe("Matriz RBAC", () => {
  it("el propietario tiene todos los permisos", () => {
    for (const p of PERMISSIONS) expect(hasPermission("OWNER", p)).toBe(true);
  });

  it("solo el propietario gestiona la facturación", () => {
    for (const r of TENANT_ROLES) expect(hasPermission(r, "billing.manage")).toBe(r === "OWNER");
  });

  it("solo propietario y administrador cambian tasas de cambio (aceptación 3)", () => {
    const allowed: Role[] = ["OWNER", "ADMIN"];
    for (const r of TENANT_ROLES) expect(hasPermission(r, "exchange_rates.manage")).toBe(allowed.includes(r));
  });

  it("almacenista, comprador, auditor y lectura no pueden ajustar existencias (aceptación 3)", () => {
    for (const r of ["WAREHOUSE", "BUYER", "AUDITOR", "READONLY"] as Role[]) {
      expect(hasPermission(r, "inventory.adjust")).toBe(false);
      expect(() => assertPermission({ role: r, branchIds: [] }, "inventory.adjust")).toThrowError(/permiso/);
    }
  });

  it("auditor y lectura no tienen ningún permiso de escritura", () => {
    const writes = PERMISSIONS.filter((p) => !p.endsWith(".read") && p !== "reports.export");
    for (const p of writes) {
      expect(hasPermission("AUDITOR", p as Permission)).toBe(false);
      expect(hasPermission("READONLY", p as Permission)).toBe(false);
    }
  });

  it("restringe por sucursal cuando la membresía tiene sucursales asignadas", () => {
    const access = { role: "WAREHOUSE" as Role, branchIds: ["b1"] };
    expect(() => assertPermission(access, "inventory.move", { branchId: "b1" })).not.toThrow();
    expect(() => assertPermission(access, "inventory.move", { branchId: "b2" })).toThrowError(/sucursal/);
  });

  it("solo un propietario puede asignar el rol propietario", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "MANAGER")).toBe(true);
    expect(canAssignRole("MANAGER", "READONLY")).toBe(false);
  });

  it("MFA obligatorio para propietario y administrador; configurable para el resto", () => {
    expect(roleRequiresMfa("OWNER")).toBe(true);
    expect(roleRequiresMfa("ADMIN")).toBe(true);
    expect(roleRequiresMfa("WAREHOUSE")).toBe(false);
    expect(roleRequiresMfa("WAREHOUSE", true)).toBe(true);
  });
});
