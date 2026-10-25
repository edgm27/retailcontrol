import { hasPermission, listProductOptions, listTransfers, listWarehouses } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { createTransferAction, transferStepAction } from "../inventario/actions";

export const metadata = { title: "Transferencias" };
const STATUS: Record<string, { label: string; v: "warning" | "success" | "destructive" | "secondary" }> = {
  DRAFT: { label: "Borrador", v: "secondary" },
  SENT: { label: "En tránsito", v: "warning" },
  RECEIVED: { label: "Recibida", v: "success" },
  CANCELLED: { label: "Cancelada", v: "destructive" },
};

export default async function TransfersPage() {
  const { actor, access } = await requireTenant("inventory.read");
  const can = hasPermission(access.role, "inventory.transfer") && access.accessMode === "full";
  const [transfers, warehouses, products] = await Promise.all([listTransfers(actor), listWarehouses(actor), can ? listProductOptions(actor) : Promise.resolve([])]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Transferencias entre almacenes</h1>
      {can && warehouses.length < 2 && (
        <p className="text-sm text-muted-foreground">Necesita al menos dos almacenes (créelos en Sucursales).</p>
      )}
      {can && warehouses.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva transferencia</CardTitle>
            <CardDescription>Se crea en borrador. Al enviarla sale del origen (por FEFO si no indica lote); al recibirla entra al destino.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createTransferAction} submitLabel="Crear borrador">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Desde" htmlFor="tr-from"><Select id="tr-from" name="fromWarehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
                <Field label="Hacia" htmlFor="tr-to"><Select id="tr-to" name="toWarehouseId" defaultValue={warehouses[1]?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
                <Field label="Nota" htmlFor="tr-note"><Input id="tr-note" name="note" maxLength={300} /></Field>
              </div>
              <datalist id="tr-products">{products.map((p) => <option key={p.id} value={`${p.sku} — ${p.name}`} />)}</datalist>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Productos (hasta 5 líneas)</legend>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <Input name={`line${i}.productCode`} list="tr-products" placeholder="Producto (SKU o código)" aria-label={`Producto línea ${i + 1}`} autoComplete="off" required={i === 0} />
                    <Input name={`line${i}.quantity`} inputMode="decimal" placeholder="Cantidad" aria-label={`Cantidad línea ${i + 1}`} required={i === 0} />
                    <Input name={`line${i}.unit`} placeholder="Unidad (base)" aria-label={`Unidad línea ${i + 1}`} />
                    <Input name={`line${i}.lotNumber`} placeholder="Lote (opcional)" aria-label={`Lote línea ${i + 1}`} />
                  </div>
                ))}
              </fieldset>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {transfers.length === 0 ? (
        <EmptyState title="Sin transferencias" />
      ) : (
        <Table>
          <THead><tr><th scope="col">Fecha</th><th scope="col">Ruta</th><th scope="col">Productos</th><th scope="col">Estado</th>{can && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></THead>
          <TBody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{fmtDate(t.createdAt, true)}</td>
                <td>{t.fromWarehouse.name} → {t.toWarehouse.name}</td>
                <td className="text-sm">
                  {t.lines.map((l) => <div key={l.id}><span className="font-mono text-xs">{l.product.sku}</span> {fmtNumber(l.quantity.toString())} {l.product.baseUnit}</div>)}
                </td>
                <td><Badge variant={STATUS[t.status]!.v}>{STATUS[t.status]!.label}</Badge></td>
                {can && (
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {t.status === "DRAFT" && (
                        <ActionForm action={transferStepAction} submitLabel="Enviar" submitName="intent" submitValue="send"><input type="hidden" name="transferId" value={t.id} /></ActionForm>
                      )}
                      {t.status === "SENT" && (
                        <ActionForm action={transferStepAction} submitLabel="Recibir" submitName="intent" submitValue="receive"><input type="hidden" name="transferId" value={t.id} /></ActionForm>
                      )}
                      {(t.status === "DRAFT" || t.status === "SENT") && (
                        <ActionForm action={transferStepAction} submitLabel="Cancelar" variant="outline" submitName="intent" submitValue="cancel"><input type="hidden" name="transferId" value={t.id} /></ActionForm>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
