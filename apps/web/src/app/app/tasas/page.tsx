import { getRateStatus, hasPermission, listExchangeRates } from "@rc/domain";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { recordRateAction } from "../compras/actions";

export const metadata = { title: "Tasas de cambio" };

export default async function RatesPage() {
  const { actor, access } = await requireTenant("exchange_rates.read");
  const canManage = hasPermission(access.role, "exchange_rates.manage") && access.accessMode === "full";
  const [status, rates] = await Promise.all([getRateStatus(actor), listExchangeRates(actor)]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Tasas de cambio (Bs. por USD)</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardDescription>Tasa vigente · moneda base de la empresa: {status.baseCurrency}</CardDescription>
          {status.current ? (
            <>
              <CardTitle className="text-3xl">Bs. {fmtNumber(status.current.rate, 8)}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Del {fmtDate(status.current.effectiveDate)} · {status.current.source === "BCV_MANUAL" ? "BCV (carga manual)" : "Interna"}
                {status.current.sourceReference ? ` · ${status.current.sourceReference}` : ""}{" "}
                {status.upToDate ? <Badge variant="success">Actualizada hoy</Badge> : <Badge variant="warning">Desactualizada: {status.daysOld} día(s)</Badge>}
              </p>
            </>
          ) : (
            <CardTitle className="text-lg">Sin tasa registrada</CardTitle>
          )}
        </CardHeader>
      </Card>
      <Alert variant="info">
        Cada documento guarda la tasa con la que se registró. Registrar una tasa nueva no cambia costos ni documentos
        anteriores. RetailControl no se conecta automáticamente al BCV: copie la tasa publicada y anote la fuente.
      </Alert>
      {canManage && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle className="text-base">Registrar tasa</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={recordRateAction} submitLabel="Registrar tasa">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bs. por 1 USD" htmlFor="rt-rate" hint="Hasta 8 decimales. Ej.: 36,5012"><Input id="rt-rate" name="rate" inputMode="decimal" required /></Field>
                <Field label="Fecha efectiva" htmlFor="rt-date"><Input id="rt-date" name="effectiveDate" type="date" defaultValue={status.today} max={status.today} required /></Field>
                <Field label="Fuente" htmlFor="rt-src"><Select id="rt-src" name="source"><option value="BCV_MANUAL">BCV (carga manual)</option><option value="INTERNAL">Interna de la empresa</option></Select></Field>
                <Field label="Referencia (opcional)" htmlFor="rt-ref"><Input id="rt-ref" name="sourceReference" maxLength={300} placeholder="Ej.: publicada en bcv.org.ve a las 9:00" /></Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {rates.length === 0 ? <EmptyState title="Sin historial" /> : (
        <Table>
          <THead><tr><th scope="col">Fecha efectiva</th><th scope="col" className="text-right">Tasa</th><th scope="col">Fuente</th><th scope="col">Registrada</th></tr></THead>
          <TBody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.effectiveDate.toISOString().slice(0, 10))}</td>
                <td className="text-right tabular-nums">{fmtNumber(r.rate.toString(), 8)}</td>
                <td className="text-sm">{r.source === "BCV_MANUAL" ? "BCV (manual)" : "Interna"}{r.sourceReference ? ` · ${r.sourceReference}` : ""}</td>
                <td className="text-xs">{fmtDate(r.createdAt, true)} · {r.createdBy}</td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
