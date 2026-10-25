/**
 * Crea el administrador inicial de pruebas si se definieron ADMIN_EMAIL y
 * ADMIN_INITIAL_PASSWORD (variables secretas del entorno, nunca en el código).
 * Idempotente: si el usuario ya existe, no cambia nada.
 */
import { prisma } from "@rc/db";
import { ensureBootstrapAdmin } from "@rc/domain";

const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_INITIAL_PASSWORD;

async function main() {
  if (!email || !password) {
    console.log("Administrador inicial: no configurado (ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD).");
    return;
  }
  const r = await ensureBootstrapAdmin({ email, password, companyName: process.env.ADMIN_COMPANY_NAME });
  console.log(r.created ? "Administrador inicial creado con su empresa de pruebas." : "Administrador inicial ya existía; sin cambios.");
}

main()
  .catch((e) => {
    console.error("Error creando el administrador inicial:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
