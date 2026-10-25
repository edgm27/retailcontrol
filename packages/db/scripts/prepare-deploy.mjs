/**
 * Preparación de la base de datos en un despliegue (Render u otro PaaS).
 *
 * Requiere MIGRATION_DATABASE_URL (usuario dueño de la base) y RC_APP_PASSWORD.
 * 1. Crea (o actualiza la contraseña de) el rol rc_app: sin BYPASSRLS, no dueño.
 * 2. Aplica migraciones con el rol dueño (prisma migrate deploy).
 * 3. Crea los planes de ejemplo SOLO si no existen (no pisa precios editados).
 * Nunca imprime credenciales.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const appPassword = process.env.RC_APP_PASSWORD;
if (!ownerUrl) throw new Error("Falta MIGRATION_DATABASE_URL");
if (!appPassword || appPassword.length < 24) throw new Error("Falta RC_APP_PASSWORD (mín. 24 caracteres)");

export function appUrlFrom(owner, password) {
  const u = new URL(owner);
  u.username = "rc_app";
  u.password = password;
  return u.toString();
}

async function appPasswordWorks() {
  const app = new PrismaClient({ datasourceUrl: appUrlFrom(ownerUrl, appPassword), log: [] });
  try {
    await app.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await app.$disconnect();
  }
}

const owner = new PrismaClient({ datasourceUrl: ownerUrl, log: ["error"] });
try {
  const [{ exists }] = await owner.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rc_app') AS exists`;
  const verb = exists ? "ALTER ROLE rc_app" : "CREATE ROLE rc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS";
  const [{ sql }] = await owner.$queryRaw`SELECT format(${verb + " PASSWORD %L"}, ${appPassword}::text) AS sql`;
  try {
    await owner.$executeRawUnsafe(sql);
  } catch (e) {
    // Si el rol ya existe (creado por un administrador) y la contraseña configurada funciona, seguimos.
    if (exists && (await appPasswordWorks())) {
      console.log("Rol rc_app existente; la contraseña configurada es válida.");
    } else {
    console.error(
      "No se pudo crear/actualizar el rol rc_app. El usuario de la base necesita el privilegio CREATEROLE.\n" +
        "Cree el rol manualmente (ver docs/deploy-render.md) y vuelva a desplegar.",
    );
    throw e;
    }
  }
  await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO rc_app`);
  const [{ db }] = await owner.$queryRaw`SELECT current_database() AS db`;
  await owner.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${db.replaceAll('"', '""')}" TO rc_app`);
  console.log(`Rol rc_app ${exists ? "verificado" : "creado"}.`);
} finally {
  await owner.$disconnect();
}

const env = {
  ...process.env,
  DATABASE_URL: appUrlFrom(ownerUrl, appPassword),
  MIGRATION_DATABASE_URL: ownerUrl,
};
const cwd = new URL("..", import.meta.url).pathname;
execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd, env, stdio: "inherit" });
execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
  cwd,
  env: { ...env, SEED_DEMO: "0", SEED_PLANS_MODE: "create-only", ALLOW_PROD_SEED: "1" },
  stdio: "inherit",
});
console.log("Base de datos lista.");
