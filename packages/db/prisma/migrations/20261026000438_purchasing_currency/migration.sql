-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('BCV_MANUAL', 'BCV_AUTO', 'INTERNAL');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "preferred_supplier_id" UUID,
ADD COLUMN     "reference_currency" "Currency",
ADD COLUMN     "reference_price" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "alert_email_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiry_alert_days" INTEGER[] DEFAULT ARRAY[7, 15, 30, 60, 90]::INTEGER[];

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "rif" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "payment_terms_days" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "effective_date" DATE NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'BCV_MANUAL',
    "source_reference" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL,
    "exchange_rate_id" UUID,
    "exchange_rate" DECIMAL(20,8),
    "expected_date" DATE,
    "notes" TEXT,
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "entered_quantity" DECIMAL(20,6) NOT NULL,
    "entered_unit" TEXT NOT NULL,
    "unit_price" DECIMAL(20,6) NOT NULL,
    "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "received_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "purchase_order_id" UUID,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "base_currency" "Currency" NOT NULL,
    "exchange_rate_id" UUID,
    "exchange_rate" DECIMAL(20,8),
    "supplier_invoice" TEXT,
    "additional_costs" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "merchandise_total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "operation_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "purchase_order_line_id" UUID,
    "product_id" UUID NOT NULL,
    "lot_id" UUID,
    "quantity" DECIMAL(20,6) NOT NULL,
    "entered_quantity" DECIMAL(20,6) NOT NULL,
    "entered_unit" TEXT NOT NULL,
    "unit_price" DECIMAL(20,6) NOT NULL,
    "ordered_unit_price" DECIMAL(20,6),
    "landed_unit_cost" DECIMAL(20,6) NOT NULL,
    "movement_id" UUID NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_name_idx" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_rif_key" ON "suppliers"("tenant_id", "rif");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "exchange_rates_tenant_id_effective_date_created_at_idx" ON "exchange_rates"("tenant_id", "effective_date" DESC, "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_tenant_id_id_key" ON "exchange_rates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenant_id_code_key" ON "tax_rates"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_idx" ON "purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_id_key" ON "purchase_orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_tenant_id_purchase_order_id_idx" ON "purchase_order_lines"("tenant_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_tenant_id_id_key" ON "purchase_order_lines"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_received_at_idx" ON "goods_receipts"("tenant_id", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_number_key" ON "goods_receipts"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_id_key" ON "goods_receipts"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_tenant_id_receipt_id_idx" ON "goods_receipt_lines"("tenant_id", "receipt_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_idx" ON "notifications"("tenant_id", "user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_user_id_dedupe_key_key" ON "notifications"("tenant_id", "user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_purchase_order_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "purchase_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_tenant_id_receipt_id_fkey" FOREIGN KEY ("tenant_id", "receipt_id") REFERENCES "goods_receipts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
