-- RetailControl — Fase 3: seguridad e invariantes de compras, moneda y alertas.

GRANT SELECT, INSERT, UPDATE ON suppliers, purchase_orders, purchase_order_lines, tax_rates, notifications TO rc_app;
GRANT DELETE ON purchase_order_lines TO rc_app;
-- Documentos contables y tasas: solo inserción y lectura (correcciones = registros nuevos).
GRANT SELECT, INSERT ON exchange_rates, goods_receipts, goods_receipt_lines TO rc_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'exchange_rates', 'tax_rates', 'purchase_orders', 'purchase_order_lines',
                           'goods_receipts', 'goods_receipt_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      t);
  END LOOP;
END $$;

-- Notificaciones: cada usuario solo ve las suyas dentro de la empresa; el job (sin usuario) puede crearlas.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND (app.current_user_id() IS NULL OR user_id = app.current_user_id()));
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND (app.current_user_id() IS NULL OR user_id = app.current_user_id()))
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Inmutabilidad de tasas y documentos de recepción.
CREATE TRIGGER exchange_rates_immutable BEFORE UPDATE OR DELETE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER goods_receipts_immutable BEFORE UPDATE OR DELETE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER goods_receipt_lines_immutable BEFORE UPDATE OR DELETE ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

-- Referencias simples (FK por id) deben ser de la MISMA empresa.
-- Uso: app.assert_ref_same_tenant('<tabla referida>', '<columna>')
CREATE OR REPLACE FUNCTION app.assert_ref_same_tenant() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  ref_table text := TG_ARGV[0];
  ref_col text := TG_ARGV[1];
  ref_id uuid := (to_jsonb(NEW) ->> ref_col)::uuid;
  ok boolean;
BEGIN
  IF ref_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', ref_table)
    INTO ok USING ref_id, NEW.tenant_id;
  IF NOT ok THEN
    RAISE EXCEPTION '%.% apunta a un registro de otra empresa o inexistente', TG_TABLE_NAME, ref_col
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER products_supplier_same_tenant BEFORE INSERT OR UPDATE OF preferred_supplier_id ON products
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('suppliers', 'preferred_supplier_id');
CREATE TRIGGER purchase_orders_rate_same_tenant BEFORE INSERT OR UPDATE OF exchange_rate_id ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('exchange_rates', 'exchange_rate_id');
CREATE TRIGGER goods_receipts_po_same_tenant BEFORE INSERT ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('purchase_orders', 'purchase_order_id');
CREATE TRIGGER goods_receipts_rate_same_tenant BEFORE INSERT ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('exchange_rates', 'exchange_rate_id');
CREATE TRIGGER goods_receipt_lines_po_line_same_tenant BEFORE INSERT ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('purchase_order_lines', 'purchase_order_line_id');
CREATE TRIGGER goods_receipt_lines_movement_same_tenant BEFORE INSERT ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION app.assert_ref_same_tenant('stock_movements', 'movement_id');
CREATE TRIGGER goods_receipt_lines_lot_matches BEFORE INSERT ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION app.assert_lot_matches();

-- Restricciones de dominio.
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_positive CHECK (rate > 0);
ALTER TABLE tax_rates ADD CONSTRAINT tax_rates_range CHECK (rate >= 0 AND rate <= 100);
ALTER TABLE tax_rates ADD CONSTRAINT tax_rates_validity CHECK (valid_to IS NULL OR valid_to >= valid_from);
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_quantity_positive CHECK (quantity > 0 AND entered_quantity > 0);
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_price_non_negative CHECK (unit_price >= 0);
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_tax_range CHECK (tax_rate >= 0 AND tax_rate <= 100);
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_received_range CHECK (received_quantity >= 0);
ALTER TABLE purchase_orders ADD CONSTRAINT po_rate_positive CHECK (exchange_rate IS NULL OR exchange_rate > 0);
ALTER TABLE goods_receipts ADD CONSTRAINT receipts_rate_required
  CHECK (currency = base_currency OR (exchange_rate IS NOT NULL AND exchange_rate > 0));
ALTER TABLE goods_receipts ADD CONSTRAINT receipts_additional_non_negative CHECK (additional_costs >= 0);
ALTER TABLE goods_receipt_lines ADD CONSTRAINT receipt_lines_positive CHECK (quantity > 0 AND entered_quantity > 0 AND unit_price >= 0 AND landed_unit_cost >= 0);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_payment_terms CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365);
ALTER TABLE products ADD CONSTRAINT products_reference_price
  CHECK ((reference_price IS NULL AND reference_currency IS NULL) OR (reference_price >= 0 AND reference_currency IS NOT NULL));
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_alert_days
  CHECK (cardinality(expiry_alert_days) BETWEEN 0 AND 10 AND 0 <= ALL (expiry_alert_days) AND 365 >= ALL (expiry_alert_days));
