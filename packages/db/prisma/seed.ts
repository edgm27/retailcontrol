/**
 * Datos FICTICIOS para desarrollo. Nada aquí representa personas o empresas
 * reales. Se ejecuta con el rol rc_app (RLS activo), igual que la aplicación.
 * Precios de planes: SOLO DE EJEMPLO, editables desde la plataforma.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/client";
import { withContext } from "../src/context";

export const PLAN_SEED = [
  {
    code: "BASICO",
    name: "Básico",
    description: "Para un comercio con una sola tienda.",
    priceMonthly: new Prisma.Decimal("15.00"),
    maxBranches: 1,
    maxUsers: 2,
    sortOrder: 1,
    features: ["catalogo", "movimientos", "lotes", "vencimientos", "reportes_esenciales"],
  },
  {
    code: "PROFESIONAL",
    name: "Profesional",
    description: "Para comercios con varias sucursales y compras.",
    priceMonthly: new Prisma.Decimal("39.00"),
    maxBranches: 3,
    maxUsers: 10,
    sortOrder: 2,
    features: [
      "catalogo", "movimientos", "lotes", "vencimientos", "reportes_esenciales",
      "compras", "transferencias", "alertas", "reportes_avanzados",
    ],
  },
  {
    code: "EMPRESARIAL",
    name: "Empresarial",
    description: "Límites por contrato, auditoría ampliada y soporte prioritario.",
    priceMonthly: new Prisma.Decimal("0.00"),
    maxBranches: null,
    maxUsers: null,
    sortOrder: 3,
    features: [
      "catalogo", "movimientos", "lotes", "vencimientos", "reportes_esenciales",
      "compras", "transferencias", "alertas", "reportes_avanzados",
      "permisos_avanzados", "auditoria_ampliada", "api_futura", "soporte_prioritario",
    ],
  },
] as const;

export async function seedPlans() {
  await withContext({ platformAdmin: true }, async (tx) => {
    for (const p of PLAN_SEED) {
      const data = { ...p, features: [...p.features] };
      // En producción (create-only) no se pisan precios ya editados por la plataforma.
      if (process.env.SEED_PLANS_MODE === "create-only") {
        const exists = await tx.plan.findUnique({ where: { code: p.code } });
        if (!exists) await tx.plan.create({ data });
      } else {
        await tx.plan.upsert({ where: { code: p.code }, create: data, update: data });
      }
    }
  });
}

async function seedDemo() {
  const demoEmail = "propietario.uno@example.com";
  if (await prisma.user.findUnique({ where: { email: demoEmail } })) {
    console.log("Datos demo ya existen; se omiten.");
    return;
  }
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "PROFESIONAL" } });
  const users = await Promise.all(
    [
      { email: demoEmail, name: "Propietario Demo Uno" },
      { email: "propietario.dos@example.com", name: "Propietario Demo Dos" },
      { email: "almacen.compartido@example.com", name: "Almacenista Demo (dos empresas)" },
    ].map((u) => prisma.user.create({ data: { ...u, emailVerified: new Date() } })),
  );
  const [ownerA, ownerB, shared] = users as [typeof users[0], typeof users[0], typeof users[0]];

  const companies = [
    { name: "Abastos Demo Uno", owner: ownerA },
    { name: "Ferretería Demo Dos", owner: ownerB },
  ];
  for (const c of companies) {
    const tenantId = randomUUID();
    await withContext({ tenantId, userId: c.owner.id }, async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: c.name, legalName: `${c.name} C.A. (ficticia)` } });
      await tx.tenantSettings.create({ data: { tenantId } });
      await tx.subscription.create({
        data: { tenantId, planId: plan.id, status: "TRIALING", trialEndsAt: new Date(Date.now() + 14 * 86_400_000) },
      });
      await tx.membership.create({ data: { tenantId, userId: c.owner.id, role: "OWNER" } });
      await tx.membership.create({ data: { tenantId, userId: shared.id, role: "WAREHOUSE" } });
      const branch = await tx.branch.create({ data: { tenantId, code: "PRINCIPAL", name: "Sucursal principal" } });
      await tx.warehouse.create({ data: { tenantId, branchId: branch.id, code: "ALM-01", name: "Almacén principal" } });
      // Mismo SKU en ambas empresas a propósito (prueba de aislamiento).
      await tx.product.createMany({
        data: [
          { tenantId, sku: "HARINA-1KG", name: "Harina de maíz precocida 1 kg (demo)" },
          { tenantId, sku: "ARROZ-1KG", name: "Arroz blanco 1 kg (demo)" },
        ],
      });
    });
  }
  console.log("Datos demo creados: 2 empresas ficticias, 3 usuarios @example.com.");
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error("Seed bloqueado en producción.");
  }
  await seedPlans();
  console.log("Planes de ejemplo listos.");
  if (process.env.SEED_DEMO !== "0") await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
