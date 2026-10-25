-- RetailControl — Fase 2: seguridad e invariantes del inventario.
-- Mismo patrón que *_rls_policies: RLS forzado, privilegios mínimos, falla cerrada.

-- ── Privilegios ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON product_units, product_barcodes, stock_count_lines, transfer_lines TO rc_app;
GRANT SELECT, INSERT, UPDATE ON lots, stock_balances, idempotency_keys, stock_adjustments, stock_counts, transfers TO rc_app;
-- Libro de movimientos: solo inserción y lectura.
GRANT SELECT, INSERT ON stock_movements TO rc_app;

-- ── RLS por empresa ────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_units', 'product_barcodes', 'lots', 'stock_movements', 'stock_balances',
                           'idempotency_keys', 'stock_adjustments', 'stock_counts', 'stock_count_lines',
                           'transfers', 'transfer_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      t);
  END LOOP;
END $$;

-- ── Movimientos inmutables (también para el dueño del esquema) ─────────────
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- ── Un lote referenciado debe ser de la MISMA empresa y del MISMO producto ─
CREATE OR REPLACE FUNCTION app.assert_lot_matches() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lots l
    WHERE l.id = NEW.lot_id AND l.tenant_id = NEW.tenant_id AND l.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'El lote % no corresponde a la empresa/producto de %', NEW.lot_id, TG_TABLE_NAME
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements', 'stock_balances', 'stock_adjustments', 'stock_count_lines', 'transfer_lines'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF lot_id, product_id, tenant_id ON %I
                    FOR EACH ROW EXECUTE FUNCTION app.assert_lot_matches()', t || '_lot_matches', t);
  END LOOP;
END $$;

-- ── Restricciones de dominio ───────────────────────────────────────────────
ALTER TABLE products ADD CONSTRAINT products_base_unit_valid
  CHECK (base_unit IN ('UND', 'KG', 'G', 'L', 'ML', 'M', 'CM'));
ALTER TABLE products ADD CONSTRAINT products_min_stock_non_negative CHECK (min_stock IS NULL OR min_stock >= 0);
ALTER TABLE products ADD CONSTRAINT products_avg_cost_non_negative CHECK (avg_cost >= 0);
ALTER TABLE products ADD CONSTRAINT products_expiry_requires_lots CHECK (NOT requires_expiry OR lot_tracking);
ALTER TABLE product_units ADD CONSTRAINT product_units_factor_positive CHECK (factor_to_base > 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_quantity_nonzero CHECK (quantity <> 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_entered_positive CHECK (entered_quantity > 0);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_cost_non_negative CHECK (unit_cost IS NULL OR unit_cost >= 0);
ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_lot_key
  CHECK (lot_key = COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_reserved_non_negative CHECK (reserved >= 0);
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_quantity_nonzero CHECK (quantity <> 0);
ALTER TABLE stock_count_lines ADD CONSTRAINT stock_count_lines_counted_non_negative CHECK (counted IS NULL OR counted >= 0);
ALTER TABLE transfers ADD CONSTRAINT transfers_distinct_warehouses CHECK (from_warehouse_id <> to_warehouse_id);
ALTER TABLE transfer_lines ADD CONSTRAINT transfer_lines_quantity_positive CHECK (quantity > 0);
