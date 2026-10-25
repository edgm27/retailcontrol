import { z } from "zod";
import { TENANT_ROLES } from "../rbac";
import { normalizeRif } from "./rif";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const emailSchema = z.string().trim().toLowerCase().email("Correo inválido").max(254);

export const rifSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const r = normalizeRif(v);
    if (!r) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "RIF con formato inválido (ej.: J-12345678-9)" });
      return z.NEVER;
    }
    return r;
  });

export const createTenantSchema = z.object({
  name: trimmed(2, 120),
  legalName: trimmed(0, 200).optional().transform((v) => (v ? v : null)),
  rif: rifSchema.optional().transform((v) => v ?? null),
});
export type CreateTenantInput = z.input<typeof createTenantSchema>;

export const roleSchema = z.enum(TENANT_ROLES);

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/, "Código: letras, números, guion; máx. 32");

export const createBranchSchema = z.object({
  code: codeSchema,
  name: trimmed(2, 120),
  address: trimmed(0, 300).optional().transform((v) => (v ? v : null)),
});

export const createWarehouseSchema = z.object({
  branchId: z.string().uuid(),
  code: codeSchema,
  name: trimmed(2, 120),
});

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._\-/]{0,63}$/, "SKU: letras, números y . _ - /; máx. 64");

export const createProductSchema = z.object({
  sku: skuSchema,
  name: trimmed(2, 200),
});

export const totpCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos"));

export const recoveryCodeSchema = z
  .string()
  .trim()
  .min(10)
  .max(20);
