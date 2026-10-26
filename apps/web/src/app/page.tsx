import { prisma } from "@rc/db";
import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import {
  CtaFinal,
  Funcionalidades,
  LandingFooter,
  Precios,
  Preguntas,
  Sectores,
  Seguridad,
  type PlanView,
} from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "RetailControl — Tu inventario siempre al día",
  description:
    "Controla productos, lotes, vencimientos y almacenes en un solo lugar. Para abastos, minimarkets, ferreterías y comercios venezolanos.",
};

const FALLBACK_PLANS: PlanView[] = [
  { code: "BASICO", name: "Básico", description: "Para un comercio con una sola tienda.", price: "15,00", maxBranches: 1, maxUsers: 2, features: ["catalogo"] },
  { code: "PROFESIONAL", name: "Profesional", description: "Para comercios con varias sucursales y compras.", price: "39,00", maxBranches: 3, maxUsers: 10, features: ["catalogo", "compras", "transferencias", "alertas", "reportes_avanzados"] },
  { code: "EMPRESARIAL", name: "Empresarial", description: "Límites por contrato y soporte prioritario.", price: "0", maxBranches: null, maxUsers: null },
];

/** Los precios salen de la tabla de planes (editables por la plataforma). */
async function loadPlans(): Promise<PlanView[]> {
  try {
    const rows = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    if (!rows.length) return FALLBACK_PLANS;
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      price: Number(p.priceMonthly).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      maxBranches: p.maxBranches,
      maxUsers: p.maxUsers,
      features: Array.isArray(p.features) ? (p.features as string[]) : [],
    }));
  } catch {
    return FALLBACK_PLANS;
  }
}

export default async function Home() {
  const plans = await loadPlans();
  return (
    <div className="landing">
      <LandingHeader />
      <main id="contenido">
        <Hero />
        <Funcionalidades />
        <Sectores />
        <Precios plans={plans} />
        <Seguridad />
        <Preguntas />
        <CtaFinal />
      </main>
      <LandingFooter />
    </div>
  );
}
