import { listPlatformPayments, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@rc/domain";
import { Badge, EmptyState, Input } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate } from "@/lib/format";
import { requirePlatform } from "@/server/session";
import { reviewPaymentAction } from "../actions";
import { usd } from "../labels";

export const metadata = { title: "Pagos" };

const FILTERS = [
  { key: "PENDING", label: "Por conciliar" },
  { key: "APPROVED", label: "Aprobados" },
  { key: "REJECTED", label: "Rechazados" },
] as const;

export default async function PlatformPayments({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key === sp.estado)?.key ?? "PENDING";
  const { actor, user } = await requirePlatform();
  const payments = await listPlatformPayments(actor, { status });
  const canManage = user.platformRole === "SUPERADMIN";
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Conciliación de pagos</h1>
        <nav aria-label="Filtro de estado" className="inline-flex rounded-full border bg-card p-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/plataforma/pagos?estado=${f.key}`} aria-current={status === f.key ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${status === f.key ? "bg-navy text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-sm text-muted-foreground">
        Verifique cada referencia y monto contra el estado de cuenta antes de aprobar. Al aprobar, la empresa queda activa con el plan
        pagado por los meses indicados. No puede conciliar un pago que usted mismo registró.
      </p>
      {payments.length === 0 ? (
        <EmptyState title="No hay pagos en este estado" />
      ) : (
        <ul className="grid gap-4">
          {payments.map((p) => {
            const expected = Number(p.plan.priceMonthly) * p.periodMonths;
            const short = p.amountUsd !== null && Number(p.amountUsd) + 0.01 < expected;
            return (
              <li key={p.id} className="rounded-2xl border bg-card p-5" data-testid="payment-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.tenant.name} <span className="text-sm font-normal text-muted-foreground">{p.tenant.rif ?? ""}</span></p>
                    <p className="text-sm text-muted-foreground">{p.plan.name} · {p.periodMonths} {p.periodMonths === 1 ? "mes" : "meses"} · esperado {usd(expected)}</p>
                  </div>
                  <Badge variant={p.status === "APPROVED" ? "success" : p.status === "REJECTED" ? "destructive" : "warning"}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-muted-foreground">Medio</dt><dd>{PAYMENT_METHOD_LABELS[p.method]}</dd></div>
                  <div><dt className="text-muted-foreground">Referencia</dt><dd className="font-mono">{p.reference}</dd></div>
                  <div><dt className="text-muted-foreground">Monto</dt><dd className="tabular-nums">
                    {p.currency === "VES" ? `Bs. ${Number(p.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : usd(p.amount.toString())}
                    {p.currency === "VES" && <span className="block text-xs text-muted-foreground">{p.amountUsd ? `≈ ${usd(p.amountUsd.toString())} (tasa ${Number(p.exchangeRate).toLocaleString("es-VE")})` : "sin tasa registrada por la empresa"}</span>}
                  </dd></div>
                  <div><dt className="text-muted-foreground">Fecha del pago</dt><dd>{fmtDate(p.paidOn.toISOString().slice(0, 10))}{p.payerName && ` · ${p.payerName}`}</dd></div>
                </dl>
                {p.notes && <p className="mt-2 text-sm"><span className="text-muted-foreground">Nota:</span> {p.notes}</p>}
                {short && <p className="mt-2 text-sm font-semibold text-warning">El monto convertido es menor al esperado.</p>}
                {p.reviewNote && <p className="mt-2 text-sm"><span className="text-muted-foreground">Revisión:</span> {p.reviewNote}</p>}
                {canManage && p.status === "PENDING" && p.submittedById === user.userId && (
                  <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">Usted registró este pago: debe conciliarlo otro superadministrador (segregación de funciones).</p>
                )}
                {canManage && p.status === "PENDING" && p.submittedById !== user.userId && (
                  <div className="mt-4 border-t pt-4">
                    <ActionForm
                      action={reviewPaymentAction}
                      submitLabel="Aprobar"
                      submitName="decision"
                      submitValue="APPROVE"
                      className="sm:grid-cols-[1fr_auto] sm:items-end"
                      extraActions={<button type="submit" name="decision" value="REJECT" className="inline-flex h-10 items-center rounded-full border border-destructive/40 px-5 text-sm font-medium text-destructive hover:bg-destructive/10">Rechazar</button>}
                    >
                      <input type="hidden" name="paymentId" value={p.id} />
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Nota de revisión (obligatoria para rechazar)</span>
                        <Input name="note" maxLength={300} placeholder="p. ej. Verificado en el estado de cuenta" />
                      </label>
                    </ActionForm>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
