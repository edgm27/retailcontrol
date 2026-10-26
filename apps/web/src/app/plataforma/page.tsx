import { getPlatformMetrics } from "@rc/domain";
import { buttonVariants } from "@rc/ui";
import Link from "next/link";
import { StatTile } from "@/components/dashboard/stat-tile";
import { requirePlatform } from "@/server/session";
import { PHASE_LABELS, usd } from "./labels";

export const metadata = { title: "Resumen" };

export default async function PlatformHome() {
  const { actor } = await requirePlatform();
  const m = await getPlatformMetrics(actor);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Resumen de la plataforma</h1>
        {m.pendingPayments.count > 0 && (
          <Link href="/plataforma/pagos" className={buttonVariants()}>Conciliar {m.pendingPayments.count} pago(s)</Link>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Ingreso mensual recurrente (MRR)" value={usd(m.mrr)} sub="Suscripciones activas al día, a precio de lista" />
        <StatTile label="Empresas registradas" value={m.tenants} sub={`${m.new30} nuevas en los últimos 30 días`} href="/plataforma/empresas" />
        <StatTile label="Pagos por conciliar" value={m.pendingPayments.count} sub={m.pendingPayments.count ? `≈ ${usd(m.pendingPayments.usd)} convertibles a USD` : "Sin pendientes"} tone={m.pendingPayments.count ? "warning" : "default"} href="/plataforma/pagos" />
        <StatTile label="Cobrado este mes" value={usd(m.approvedThisMonth.usd)} sub={`${m.approvedThisMonth.count} pago(s) aprobado(s)`} />
        <StatTile label="Conversión a pago" value={`${(m.conversionRate * 100).toFixed(1).replace(".", ",")}%`} sub="Empresas con al menos un pago aprobado" />
        <StatTile label="Pruebas que vencen en 7 días" value={m.trialsEnding7} tone={m.trialsEnding7 ? "warning" : "default"} href="/plataforma/empresas" />
      </div>
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Empresas por estado</h2>
        <ul className="flex flex-wrap gap-3">
          {Object.entries(PHASE_LABELS).map(([k, label]) => (
            <li key={k} className="rounded-xl border px-4 py-2 text-sm">
              <span className="text-muted-foreground">{label}</span> <strong className="ml-1 tabular-nums">{m.byPhase[k] ?? 0}</strong>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">El panel muestra solo metadatos de las empresas (plan, estado, uso y pagos), nunca sus inventarios.</p>
      </section>
    </div>
  );
}
