-- RetailControl — creación de roles y base de datos (ejecutar como superusuario).
-- Uso: psql -v owner_password=... -v app_password=... -v db_name=... -f bootstrap.sql
--
-- rc_owner : dueño del esquema; solo para migraciones. Nunca lo usa la app.
-- rc_app   : rol de la aplicación y workers. No es dueño de tablas y no tiene
--            BYPASSRLS, por lo que las políticas RLS siempre se aplican.
-- rc_backup: SOLO para respaldos (pg_dump). Lectura total (pg_read_all_data) y
--            BYPASSRLS, sin permisos de escritura. Credencial guardada aparte.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE rc_owner LOGIN CREATEDB PASSWORD %L', :'owner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rc_owner') \gexec

SELECT format('CREATE ROLE rc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rc_app') \gexec

SELECT format('CREATE ROLE rc_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS PASSWORD %L', :'backup_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rc_backup') \gexec
GRANT pg_read_all_data TO rc_backup;

-- Garantiza atributos aunque el rol ya existiera.
ALTER ROLE rc_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE rc_owner NOSUPERUSER NOBYPASSRLS;

SELECT format('CREATE DATABASE %I OWNER rc_owner ENCODING ''UTF8'' TEMPLATE template0', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec

\connect :db_name
ALTER SCHEMA public OWNER TO rc_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rc_app;
