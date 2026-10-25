import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_NAME, maintenanceUrl, testAppUrl, testOwnerUrl } from "./db-urls";

/**
 * Crea una base de datos de prueba limpia, aplica TODAS las migraciones con el
 * rol dueño (igual que en producción) y siembra los planes con el rol de app.
 */
export default async function setup() {
  if (!/^[a-z0-9_]+$/.test(TEST_DB_NAME) || !TEST_DB_NAME.endsWith("_test")) {
    throw new Error("TEST_DB_NAME debe terminar en _test (protección contra borrar otra base).");
  }
  const admin = new PrismaClient({ datasourceUrl: maintenanceUrl() });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB_NAME} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await admin.$disconnect();
  }
  const owner = new PrismaClient({ datasourceUrl: testOwnerUrl() });
  try {
    await owner.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
    await owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO rc_app`);
  } finally {
    await owner.$disconnect();
  }

  const env = {
    ...process.env,
    DATABASE_URL: testAppUrl(),
    MIGRATION_DATABASE_URL: testOwnerUrl(),
  };
  const dbDir = new URL("../../packages/db", import.meta.url).pathname;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: dbDir, env, stdio: "pipe" });
  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    cwd: dbDir,
    env: { ...env, SEED_DEMO: "0" },
    stdio: "pipe",
  });
}
