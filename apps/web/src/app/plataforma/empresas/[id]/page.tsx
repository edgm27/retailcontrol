import { listPlansAdmin, listPlatformPayments, listPlatformTenants, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@rc/domain";
import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { fmtDate } from "@/lib/format";
import { requirePlatform } from "@/server/session";
import { updateTenantAction } from "../../actions";
import { PHASE_LABELS, PHASE_VARIANT, usd } from "../../labels";

export const metadata = { title: "Gestionar empresa" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PlatformTenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { actor, user } = await requirePlatform();
  const [rows, plans, payments] = await Promise.all([listPlatformTenants(actor, { tenantId: id }), listPlansAdmin(actor), listPlatformPayments(actor, { tenantId: id })]);
  const t = rows[0];
  if (!t) notFound();
  const canManage = user.platformRole === "SUPERADMIN";
  const reason = (fid: string) => (
    <Field label="Motivo (queda en auditoría)" htmlFor={fid}><Input id={fid} name="reason" required minLength={5} maxLength={300} /></Field>
  );
  return (
    <div className="grid gap-6">
      <div>
        <Link href="/plataforma/empresas" className="text-sm text-primary hover:underline">← Empresas</Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold">{t.name} <Badge variant={PHASE_VARIANT[t.phase] ?? "secondary"}>{PHASE_LABELS[t.phase]}</Badge></h1>
        <p className="text-sm text-muted-foreground">
          {t.rif ?? "Sin RIF"} · Plan {t.planName} · alta {fmtDate(t.createdAt)} · {t.activeUsers} usuarios, {t.branches} sucursal(es), {t.products} productos
          {t.trialEndsAt && ` · prueba hasta ${fmtDate(t.trialEndsAt)}`}{t.currentPeriodEnd && ` · pagado hasta ${fmtDate(t.currentPeriodEnd)}`}
        </p>
        <p className="text-sm text-muted-foreground">Propietarios: {t.owners.join(", ") || "—"}</p>
      </div>

      {canManage && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Cambiar plan</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateTenantAction} submitLabel="Cambiar plan" variant="outline">
                <input type="hidden" name="tenantId" value={t.tenantId} /><input type="hidden" name="kind" value="plan" />
                <Field label="Plan" htmlFor="pl"><Select id="pl" name="planCode" defaultValue={t.planCode}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
                {reason("r-plan")}
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Extender prueba</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateTenantAction} submitLabel="Extender" variant="outline">
                <input type="hidden" name="tenantId" value={t.tenantId} /><input type="hidden" name="kind" value="trial" />
                <Field label="Días adicionales" htmlFor="days"><Input id="days" name="days" type="number" min={1} max={90} defaultValue={7} required /></Field>
                {reason("r-trial")}
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Estado de la suscripción</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateTenantAction} submitLabel="Aplicar" variant="outline">
                <input type="hidden" name="tenantId" value={t.tenantId} /><input type="hidden" name="kind" value="status" />
                <Field label="Acción" htmlFor="st">
                  <Select id="st" name="status" defaultValue="SUSPENDED">
                    <option value="SUSPENDED">Suspender (solo lectura)</option>
                    <option value="REACTIVATE">Reactivar</option>
                    <option value="CANCELED">Cancelar (solo lectura, datos conservados)</option>
                  </Select>
                </Field>
                {reason("r-status")}
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Pagos</h2>
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">Sin pagos registrados.</p> : (
          <Table>
            <THead><tr><th scope="col">Fecha</th><th scope="col">Plan</th><th scope="col">Medio · referencia</th><th scope="col" className="text-right">Monto</th><th scope="col">Estado</th></tr></THead>
            <TBody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidOn.toISOString().slice(0, 10))}</td>
                  <td>{p.plan.name} · {p.periodMonths} m</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method]} · <span className="font-mono text-xs">{p.reference}</span></td>
                  <td className="text-right tabular-nums">{p.currency === "VES" ? `Bs. ${Number(p.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : usd(p.amount.toString())}</td>
                  <td><Badge variant={p.status === "APPROVED" ? "success" : p.status === "REJECTED" ? "destructive" : "warning"}>{PAYMENT_STATUS_LABELS[p.status]}</Badge></td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
