import { getBillingOverview, hasPermission, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@rc/domain";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Table, TBody, THead } from "@rc/ui";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { submitPaymentAction } from "./actions";
import { PaymentForm } from "./payment-form";

export const metadata = { title: "Suscripción" };

const money = (v: number | string, cur = "USD") =>
  `${cur === "VES" ? "Bs." : "USD"} ${Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PHASE_TEXT: Record<string, (d: number | null, end: Date | null) => string> = {
  trial: (d) => `Prueba gratis: ${d === 0 ? "vence hoy" : `quedan ${d} día(s)`}.`,
  trial_expired: () => "La prueba terminó: la empresa está en modo solo lectura hasta registrar un pago.",
  active: (_, end) => (end ? `Activa hasta el ${fmtDate(end)}.` : "Activa."),
  grace: (d) => `El período pagado venció. Tiene ${d} día(s) de gracia antes de pasar a solo lectura.`,
  expired: () => "La suscripción venció: la empresa está en modo solo lectura hasta registrar un pago.",
  suspended: () => "La suscripción está suspendida (solo lectura). Contáctenos.",
  canceled: () => "La suscripción está cancelada (solo lectura). Sus datos se conservan.",
};

export default async function SubscriptionPage() {
  const { actor, access } = await requireTenant("billing.read");
  const o = await getBillingOverview(actor);
  const canPay = hasPermission(access.role, "billing.manage");
  const sub = o.subscription;
  const payable = o.plans.filter((p) => Number(p.priceMonthly) > 0).map((p) => ({ code: p.code, name: p.name, price: Number(p.priceMonthly) }));
  const pending = o.payments.filter((p) => p.status === "PENDING").length;
  const tone = ["trial_expired", "expired", "suspended", "canceled"].includes(o.phase.phase) ? "error" : o.phase.phase === "grace" ? "warning" : "info";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Suscripción</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Plan actual</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
              {sub?.plan.name ?? "—"}
              <Badge variant={o.accessMode === "full" ? "success" : "destructive"}>{o.accessMode === "full" ? "Acceso completo" : "Solo lectura"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Alert variant={tone}>{PHASE_TEXT[o.phase.phase]!(o.phase.daysLeft, sub?.currentPeriodEnd ?? null)}</Alert>
            {pending > 0 && <Alert variant="info">Tiene {pending} pago(s) en revisión. Al aprobarse, el plan se activa automáticamente.</Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Uso del plan</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Usage label="Usuarios activos" used={o.activeUsers} max={o.limits.maxUsers} />
            <Usage label="Sucursales" used={o.branches} max={o.limits.maxBranches} />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="planes-t" className="grid gap-3">
        <h2 id="planes-t" className="text-lg font-semibold">Planes</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {o.plans.map((p) => {
            const current = p.code === sub?.plan.code;
            return (
              <li key={p.code} className={`rounded-2xl border bg-card p-5 ${current ? "border-brand-strong ring-2 ring-brand/40" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  {current && <Badge>Su plan</Badge>}
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{Number(p.priceMonthly) > 0 ? <>{money(p.priceMonthly.toString())}<span className="text-sm font-normal text-muted-foreground">/mes</span></> : "A convenir"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                <p className="mt-2 text-sm">{p.maxBranches ? `Hasta ${p.maxBranches} sucursal(es)` : "Sucursales por contrato"} · {p.maxUsers ? `${p.maxUsers} usuarios` : "usuarios por contrato"}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {canPay && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Cómo pagar</CardTitle>
              <CardDescription>Pague por transferencia o pago móvil y luego registre el pago con su referencia.</CardDescription>
            </CardHeader>
            <CardContent><p className="whitespace-pre-line text-sm" data-testid="payment-instructions">{o.instructions}</p></CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Registrar pago</CardTitle>
              <CardDescription>Lo verificamos contra el estado de cuenta. Al aprobarlo, su plan queda activo por los meses pagados.</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentForm action={submitPaymentAction} plans={payable} defaultPlan={payable.some((p) => p.code === sub?.plan.code) ? sub!.plan.code : (payable[0]?.code ?? "")} today={today} />
            </CardContent>
          </Card>
        </div>
      )}

      <section aria-labelledby="pagos-t" className="grid gap-3">
        <h2 id="pagos-t" className="text-lg font-semibold">Pagos registrados</h2>
        {o.payments.length === 0 ? (
          <EmptyState title="Aún no hay pagos" description="Cuando registre un pago aparecerá aquí con su estado." />
        ) : (
          <Table>
            <THead><tr><th scope="col">Fecha</th><th scope="col">Plan</th><th scope="col">Medio</th><th scope="col">Referencia</th><th scope="col" className="text-right">Monto</th><th scope="col">Estado</th></tr></THead>
            <TBody>
              {o.payments.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{fmtDate(p.paidOn.toISOString().slice(0, 10))}</td>
                  <td>{p.plan.name} · {p.periodMonths} {p.periodMonths === 1 ? "mes" : "meses"}</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                  <td className="font-mono text-xs">{p.reference}</td>
                  <td className="text-right tabular-nums">{money(p.amount.toString(), p.currency)}{p.currency === "VES" && p.amountUsd && <div className="text-xs text-muted-foreground">≈ {money(p.amountUsd.toString())}</div>}</td>
                  <td>
                    <Badge variant={p.status === "APPROVED" ? "success" : p.status === "REJECTED" ? "destructive" : "warning"}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    {p.reviewNote && <div className="mt-1 text-xs text-muted-foreground">{p.reviewNote}</div>}
                  </td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between"><span>{label}</span><span className="font-semibold tabular-nums">{used} / {max ?? "∞"}</span></div>
      {max && <div className="mt-1 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}
