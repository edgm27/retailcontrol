-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'PAGO_MOVIL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "exchange_rate" DECIMAL(20,8),
    "amount_usd" DECIMAL(18,2),
    "paid_on" DATE NOT NULL,
    "period_months" INTEGER NOT NULL,
    "payer_name" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "payments_tenant_id_created_at_idx" ON "payments"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_method_reference_key" ON "payments"("tenant_id", "method", "reference");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────── Reglas de dominio ─────────────────────────
ALTER TABLE "payments" ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE "payments" ADD CONSTRAINT payments_period_range CHECK (period_months BETWEEN 1 AND 12);
ALTER TABLE "payments" ADD CONSTRAINT payments_reference_not_blank CHECK (length(btrim(reference)) BETWEEN 4 AND 60);
ALTER TABLE "payments" ADD CONSTRAINT payments_review_consistent CHECK (
  (status = 'PENDING' AND reviewed_by_id IS NULL AND reviewed_at IS NULL)
  OR (status <> 'PENDING' AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL)
);
-- Segregación de funciones: nadie concilia un pago que registró.
ALTER TABLE "payments" ADD CONSTRAINT payments_reviewer_not_submitter CHECK (reviewed_by_id IS NULL OR reviewed_by_id <> submitted_by_id);

-- Un pago revisado (aprobado/rechazado) es definitivo; nunca se borra.
CREATE OR REPLACE FUNCTION app.payments_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los pagos no se borran' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'El pago ya fue revisado y no se puede modificar' USING ERRCODE = '42501';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.amount <> OLD.amount OR NEW.currency <> OLD.currency
     OR NEW.reference <> OLD.reference OR NEW.method <> OLD.method OR NEW.submitted_by_id <> OLD.submitted_by_id
     OR NEW.plan_id <> OLD.plan_id OR NEW.period_months <> OLD.period_months OR NEW.paid_on <> OLD.paid_on THEN
    RAISE EXCEPTION 'Solo se puede cambiar el estado de revisión del pago' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION app.payments_guard();

-- ───────────────────────── RLS ─────────────────────────
-- La empresa registra (PENDING) y consulta sus pagos; solo la plataforma los revisa.
GRANT SELECT, INSERT, UPDATE ON "payments" TO rc_app;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON "payments" FOR SELECT
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY payments_insert ON "payments" FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() AND status = 'PENDING' AND reviewed_by_id IS NULL);
CREATE POLICY payments_update ON "payments" FOR UPDATE
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON "platform_settings" TO rc_app;
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_settings_read ON "platform_settings" FOR SELECT USING (true);
CREATE POLICY platform_settings_insert ON "platform_settings" FOR INSERT WITH CHECK (app.is_platform_admin());
CREATE POLICY platform_settings_update ON "platform_settings" FOR UPDATE
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());
