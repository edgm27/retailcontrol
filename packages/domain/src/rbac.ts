import { forbidden } from "./errors";

/**
 * RBAC de empresa. Los roles son fijos en código (versionados y revisables);
 * la asignación es por membresía y opcionalmente limitada a sucursales.
 * Ver docs/rbac-matrix.md — este archivo es la fuente de verdad.
 */
export const TENANT_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "WAREHOUSE",
  "BUYER",
  "AUDITOR",
  "READONLY",
] as const;
export type Role = (typeof TENANT_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  WAREHOUSE: "Almacenista",
  BUYER: "Comprador",
  AUDITOR: "Auditor",
  READONLY: "Solo lectura",
};

export const PERMISSIONS = [
  "tenant.settings.manage",
  "billing.read",
  "billing.manage",
  "members.read",
  "members.manage",
  "branches.read",
  "branches.manage",
  "products.read",
  "products.write",
  "inventory.read",
  "inventory.move",
  "inventory.transfer",
  "inventory.count",
  "inventory.adjust",
  "inventory.adjust.approve",
  "suppliers.read",
  "suppliers.write",
  "purchases.read",
  "purchases.write",
  "purchases.approve",
  "purchases.receive",
  "exchange_rates.read",
  "exchange_rates.manage",
  "reports.read",
  "reports.export",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const READS: Permission[] = PERMISSIONS.filter((p) => p.endsWith(".read"));

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: ALL,
  ADMIN: new Set(PERMISSIONS.filter((p) => p !== "billing.manage")),
  MANAGER: new Set<Permission>([
    "billing.read",
    "members.read",
    "branches.read",
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.move",
    "inventory.transfer",
    "inventory.count",
    "inventory.adjust",
    "inventory.adjust.approve",
    "suppliers.read",
    "suppliers.write",
    "purchases.read",
    "purchases.write",
    "purchases.approve",
    "purchases.receive",
    "exchange_rates.read",
    "reports.read",
    "reports.export",
  ]),
  WAREHOUSE: new Set<Permission>([
    "branches.read",
    "products.read",
    "inventory.read",
    "inventory.move",
    "inventory.transfer",
    "inventory.count",
    "suppliers.read",
    "purchases.read",
    "purchases.receive",
    "exchange_rates.read",
    "reports.read",
  ]),
  BUYER: new Set<Permission>([
    "branches.read",
    "products.read",
    "inventory.read",
    "suppliers.read",
    "suppliers.write",
    "purchases.read",
    "purchases.write",
    "exchange_rates.read",
    "reports.read",
  ]),
  AUDITOR: new Set<Permission>([...READS, "reports.export"]),
  READONLY: new Set<Permission>([
    "branches.read",
    "products.read",
    "inventory.read",
    "suppliers.read",
    "purchases.read",
    "exchange_rates.read",
    "reports.read",
  ]),
};

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return MATRIX[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

/** Roles que siempre exigen MFA (además de la política de la empresa). */
export const MFA_REQUIRED_ROLES: ReadonlySet<Role> = new Set<Role>(["OWNER", "ADMIN"]);

export function roleRequiresMfa(role: Role, mfaRequiredForAll = false): boolean {
  return mfaRequiredForAll || MFA_REQUIRED_ROLES.has(role);
}

/**
 * ¿Quién puede asignar qué rol? Solo un propietario crea o retira propietarios.
 * Un administrador gestiona el resto de roles.
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole !== "OWNER";
  return false;
}

/** Contexto de acceso autorizado del actor dentro de una empresa. */
export interface TenantAccess {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  /** Sucursales permitidas; vacío = todas. */
  branchIds: readonly string[];
}

export function canAccessBranch(access: Pick<TenantAccess, "branchIds">, branchId: string): boolean {
  return access.branchIds.length === 0 || access.branchIds.includes(branchId);
}

export function assertPermission(
  access: Pick<TenantAccess, "role" | "branchIds">,
  permission: Permission,
  opts: { branchId?: string } = {},
): void {
  if (!hasPermission(access.role, permission)) throw forbidden();
  if (opts.branchId && !canAccessBranch(access, opts.branchId)) {
    throw forbidden("No tiene acceso a esta sucursal.");
  }
}
