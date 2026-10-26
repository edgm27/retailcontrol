import { getTenantSettings, listTaxRates } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { createTaxRateAction, toggleTaxRateAction, updateSettingsAction } from "../../compras/actions";

export const metadata = { title: "Configuración de la empresa" };
const DAYS = [3, 7, 15, 30, 60, 90];

export default async function CompanySettingsPage() {
  const { actor, access } = await requireTenant("tenant.settings.manage");
  const [s, taxes] = await Promise.all([getTenantSettings(actor), listTaxRates(actor)]);
  const writable = access.accessMode === "full";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Inventario, moneda y alertas</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={updateSettingsAction} submitLabel="Guardar">
            <Field label="Moneda base (valoración)" htmlFor="st-cur" hint={s.hasMovements ? "No se puede cambiar: ya hay inventario valorizado." : "Elíjala antes de registrar movimientos."}>
              <Select id="st-cur" name="baseCurrency" defaultValue={s.baseCurrency} disabled={s.hasMovements}>
                <option value="USD">USD</option><option value="VES">Bs.</option>
              </Select>
            </Field>
            {s.hasMovements && <input type="hidden" name="baseCurrency" value={s.baseCurrency} />}
            <Field label={`Umbral de aprobación de ajustes (${s.baseCurrency})`} htmlFor="st-thr" hint="Ajustes y conteos por encima de este valor requieren aprobación de otro usuario.">
              <Input id="st-thr" name="threshold" inputMode="decimal" defaultValue={fmtNumber(s.adjustmentApprovalThreshold.toString(), 2)} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Avisar vencimientos con anticipación de</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-2"><input type="checkbox" name="expiryAlertDays" value={d} defaultChecked={s.expiryAlertDays.includes(d)} className="h-4 w-4" /> {d} días</label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alertEmailEnabled" defaultChecked={s.alertEmailEnabled} className="h-4 w-4" /> Enviar también las alertas por correo (requiere correo configurado)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowNegativeStock" defaultChecked={s.allowNegativeStock} className="h-4 w-4" /> Permitir existencias negativas en productos sin lote (no recomendado)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mfaRequiredForAll" defaultChecked={s.mfaRequiredForAll} className="h-4 w-4" /> Exigir verificación en dos pasos a todos los usuarios</label>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alícuotas de impuesto</CardTitle>
          <CardDescription>Configúrelas según la normativa vigente y su asesor. RetailControl no precarga valores ni emite facturas fiscales.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {taxes.length > 0 && (
            <Table>
              <THead><tr><th scope="col">Código</th><th scope="col">Nombre</th><th scope="col" className="text-right">%</th><th scope="col">Desde</th><th scope="col"><span className="sr-only">Estado</span></th></tr></THead>
              <TBody>
                {taxes.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono">{t.code}</td>
                    <td>{t.name}</td>
                    <td className="text-right tabular-nums">{fmtNumber(t.rate.toString(), 4)}</td>
                    <td>{fmtDate(t.validFrom.toISOString().slice(0, 10))}</td>
                    <td>
                      {writable ? (
                        <ActionForm action={toggleTaxRateAction} submitLabel={t.active ? "Desactivar" : "Activar"} variant="outline">
                          <input type="hidden" name="taxRateId" value={t.id} /><input type="hidden" name="active" value={t.active ? "false" : "true"} />
                        </ActionForm>
                      ) : <Badge variant={t.active ? "success" : "secondary"}>{t.active ? "Activa" : "Inactiva"}</Badge>}
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
          {writable && (
            <ActionForm action={createTaxRateAction} submitLabel="Agregar alícuota" variant="outline">
              <div className="grid gap-2 sm:grid-cols-4">
                <Input name="code" placeholder="Código" aria-label="Código" required maxLength={16} />
                <Input name="name" placeholder="Nombre" aria-label="Nombre" required />
                <Input name="rate" placeholder="%" aria-label="Porcentaje" inputMode="decimal" required />
                <Input name="validFrom" type="date" aria-label="Vigente desde" defaultValue={today} required />
              </div>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
