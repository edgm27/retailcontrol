import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

export const TEST_DB_NAME = process.env.TEST_DB_NAME ?? "retailcontrol_test";

function withDb(url: string | undefined, db: string, name: string): string {
  if (!url) throw new Error(`Falta ${name} para las pruebas de integración.`);
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** rc_app (RLS) contra la base de prueba. */
export const testAppUrl = () =>
  process.env.TEST_DATABASE_URL ?? withDb(process.env.DATABASE_URL, TEST_DB_NAME, "DATABASE_URL");
/** rc_owner contra la base de prueba (migraciones). */
export const testOwnerUrl = () =>
  process.env.TEST_MIGRATION_DATABASE_URL ??
  withDb(process.env.MIGRATION_DATABASE_URL, TEST_DB_NAME, "MIGRATION_DATABASE_URL");
/** rc_owner contra la base de mantenimiento "postgres" (crear/borrar la base de prueba). */
export const maintenanceUrl = () => withDb(testOwnerUrl(), "postgres", "MIGRATION_DATABASE_URL");
