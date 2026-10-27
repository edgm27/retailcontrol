/* eslint-disable no-console -- script de línea de comandos */
/**
 * Crea la empresa de demostración (datos ficticios) para un usuario existente.
 * Uso: pnpm demo:generate correo@ejemplo.com [días]
 */
import { performance } from "node:perf_hooks";
import { prisma } from "@rc/db";
import { generateDemoCompany } from "@rc/domain";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Indique el correo de un usuario existente.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No existe el usuario ${email}.`);
  const t0 = performance.now();
  const r = await generateDemoCompany({ userId: user.id, email }, { days: Number(process.argv[3]) || undefined, onProgress: (m) => console.log(m) });
  console.log(`Empresa ${r.tenantId}: ${r.products} productos, ${r.receipts} recepciones, ${r.sales} ventas en ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
