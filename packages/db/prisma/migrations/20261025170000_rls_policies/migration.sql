-- RetailControl — aislamiento multiempresa con Row-Level Security
-- Ver docs/tenant-isolation.md.
--
-- Principios:
--  * La app se conecta como rc_app: no es dueño de las tablas y no tiene BYPASSRLS.
--  * FORCE ROW LEVEL SECURITY: ni siquiera el dueño escapa de las políticas.
--  * El contexto se fija por transacción con set_config(..., true) (SET LOCAL).
--  * Sin contexto => ninguna fila visible (falla cerrada).
--  * No hay privilegios por defecto: una tabla nueva es inaccesible para rc_app
--    hasta que una migración la autorice y le active RLS (lo verifica un test).

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO rc_app;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_email() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(lower(current_setting('app.user_email', true)), '') $$;

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT COALESCE(current_setting('app.platform_admin', true), 'off') = 'on' $$;

CREATE OR REPLACE FUNCTION app.reject_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '42501'; END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_tenant_id(), app.current_user_id(), app.current_user_email(),
  app.is_platform_admin() TO rc_app;

-- ───────────────────────── Tablas globales de identidad ─────────────────────────
-- Usadas por Auth.js (adaptador) y el limitador; protegidas por autorización en servidor.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, accounts, sessions, verification_tokens, rate_limit_buckets TO rc_app;

-- Factores MFA: cada usuario solo ve los suyos (o superadmin para recuperación asistida).
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_totp, recovery_codes TO rc_app;
ALTER TABLE mfa_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_totp FORCE ROW LEVEL SECURITY;
CREATE POLICY mfa_totp_owner ON mfa_totp
  USING (user_id = app.current_user_id() OR app.is_platform_admin())
  WITH CHECK (user_id = app.current_user_id());
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_codes_owner ON recovery_codes
  USING (user_id = app.current_user_id() OR app.is_platform_admin())
  WITH CHECK (user_id = app.current_user_id());

-- ───────────────────────── Planes (catálogo de plataforma) ─────────────────────
GRANT SELECT, INSERT, UPDATE ON plans TO rc_app;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON plans FOR SELECT USING (true);
CREATE POLICY plans_insert ON plans FOR INSERT WITH CHECK (app.is_platform_admin());
CREATE POLICY plans_update ON plans FOR UPDATE USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

-- ───────────────────────── Empresas ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON tenants TO rc_app;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenants FOR SELECT USING (
  id = app.current_tenant_id()
  OR app.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = tenants.id AND m.user_id = app.current_user_id() AND m.status = 'ACTIVE'
  )
);
CREATE POLICY tenants_insert ON tenants FOR INSERT WITH CHECK (id = app.current_tenant_id());
CREATE POLICY tenants_update ON tenants FOR UPDATE
  USING (id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (id = app.current_tenant_id() OR app.is_platform_admin());
-- Sin política DELETE: las empresas no se borran desde la aplicación.

-- ───────────────────────── Membresías ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO rc_app;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
-- Un usuario puede ver SUS membresías (para elegir empresa) sin contexto de empresa.
CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (tenant_id = app.current_tenant_id() OR user_id = app.current_user_id());
CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY memberships_delete ON memberships FOR DELETE USING (tenant_id = app.current_tenant_id());

-- ───────────────────────── Invitaciones ────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON invitations TO rc_app;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_select ON invitations FOR SELECT
  USING (tenant_id = app.current_tenant_id() OR lower(email) = app.current_user_email());
CREATE POLICY invitations_insert ON invitations FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

-- ───────────────────────── Suscripciones ───────────────────────────────────────
-- La empresa la crea en el onboarding y la puede leer; solo la plataforma la modifica.
GRANT SELECT, INSERT, UPDATE ON subscriptions TO rc_app;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

-- ───────────────────────── Tablas de empresa estándar ──────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'membership_branches', 'branches', 'warehouses', 'products'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO rc_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      t);
  END LOOP;
END $$;
-- Los productos no se borran (se inactivan) para preservar historial.
REVOKE DELETE ON products FROM rc_app;

-- ───────────────────────── Bitácora de auditoría (solo inserción) ──────────────
GRANT SELECT, INSERT ON audit_events TO rc_app;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_events FOR SELECT USING (
  tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND (actor_user_id = app.current_user_id() OR app.is_platform_admin()))
);
CREATE POLICY audit_insert ON audit_events FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() OR tenant_id IS NULL);
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- Restricciones de dominio que Prisma no expresa.
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE invitations ADD CONSTRAINT invitations_email_lowercase CHECK (email = lower(email));
ALTER TABLE products ADD CONSTRAINT products_sku_not_blank CHECK (length(btrim(sku)) > 0);
ALTER TABLE plans ADD CONSTRAINT plans_price_non_negative CHECK (price_monthly >= 0);
ALTER TABLE plans ADD CONSTRAINT plans_limits_positive CHECK (
  (max_users IS NULL OR max_users > 0) AND (max_branches IS NULL OR max_branches > 0));
