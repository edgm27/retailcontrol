-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "managed_by_tenant_id" UUID,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managed_by_tenant_id_fkey" FOREIGN KEY ("managed_by_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Gestión de usuarios por la empresa (sin invitación): ver docs/tenant-isolation.md.
COMMENT ON COLUMN "users"."managed_by_tenant_id" IS 'Empresa que creó la cuenta; solo ella puede restablecer clave/2FA mientras la persona no pertenezca a otra empresa.';
COMMENT ON COLUMN "users"."must_change_password" IS 'Clave temporal: el usuario debe cambiarla al ingresar.';
