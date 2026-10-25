import { hasPermission, listAdjustments, listProductOptions, listWarehouses } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { ProductPicker } from "@/components/inventory/product-picker";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { decideAdjustmentAction, requestAdjustmentAction } from "../inventario/actions";

export const metadata = { title: "Ajustes y mermas" };
const STATUS: Record<string, { label: string; v: "warning" | "success" | "destructive" | "secondary" }> = {
  PENDING: { label: "Pendiente", v: "warning" },
  APPLIED: { label: "Aplicado", v: "success" },
  REJECTED: { label: "Rechazado", v: "destructive" },
  CANCELLED: { label: "Cancelado", v: "secondary" },
};

export default async function AdjustmentsPage() {
  const { actor, access, user } = await requireTenant("inventory.read");
  const canRequest = hasPermission(access.role, "inventory.adjust") && access.accessMode === "full";
  const canApprove = hasPermission(access.role, "inventory.adjust.approve") && access.accessMode === "full";
  const [list, warehouses, products] = await Promise.all([
    canRequest || canApprove || hasPermission(access.role, "audit.read") ? listAdjustments(actor) : Promise.resolve([]),
    listWarehouses(actor),
    canRequest ? listProductOptions(actor) : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Ajustes y mermas</h1>
      {canRequest && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Solicitar ajuste</CardTitle>
            <CardDescription>
              Si el valor supera el umbral de la empresa, otro usuario con permiso debe aprobarlo antes de afectar el inventario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={requestAdjustmentAction} submitLabel="Enviar ajuste">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Almacén" htmlFor="aj-wh">
                  <Select id="aj-wh" name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
                </Field>
                <Field label="Tipo" htmlFor="aj-kind">
                  <Select id="aj-kind" name="kind"><option value="ADJUSTMENT">Ajuste</option><option value="WASTE">Merma (sale)</option></Select>
                </Field>
                <Field label="Dirección" htmlFor="aj-dir">
                  <Select id="aj-dir" name="direction"><option value="OUT">Disminuir (−)</option><option value="IN">Aumentar (+)</option></Select>
                </Field>
              </div>
              <ProductPicker products={products} lotMode="outbound" idPrefix="aj" />
              <Field label="Motivo" htmlFor="aj-reason"><Input id="aj-reason" name="reason" required minLength={5} maxLength={300} placeholder="Ej.: producto dañado en el traslado" /></Field>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {list.length === 0 ? (
        <EmptyState title="Sin ajustes registrados" />
      ) : (
        <Table>
          <THead><tr><th scope="col">Fecha</th><th scope="col">Producto</th><th scope="col">Almacén</th><th scope="col" className="text-right">Cantidad</th><th scope="col" className="text-right">Valor</th><th scope="col">Motivo</th><th scope="col">Estado</th>{canApprove && <th scope="col"><span className="sr-only">Decidir</span></th>}</tr></THead>
          <TBody>
            {list.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{fmtDate(a.createdAt, true)}</td>
                <td><span className="font-mono text-xs">{a.product.sku}</span> {a.product.name}</td>
                <td>{a.warehouse.name}</td>
                <td className="text-right tabular-nums">{Number(a.quantity) > 0 ? "+" : ""}{fmtNumber(a.quantity.toString())} {a.product.baseUnit}{a.kind === "WASTE" ? " (merma)" : ""}</td>
                <td className="text-right tabular-nums">{fmtMoney(a.estimatedValue.toString())}</td>
                <td className="max-w-xs text-sm">{a.reason}{a.decisionNote && <div className="text-xs text-muted-foreground">{a.decisionNote}</div>}</td>
                <td><Badge variant={STATUS[a.status]!.v}>{STATUS[a.status]!.label}</Badge></td>
                {canApprove && (
                  <td>
                    {a.status === "PENDING" && a.requestedById !== user.userId && (
                      <div className="flex gap-2">
                        <ActionForm action={decideAdjustmentAction} submitLabel="Aprobar" submitName="decision" submitValue="APPROVE">
                          <input type="hidden" name="adjustmentId" value={a.id} />
                        </ActionForm>
                        <ActionForm action={decideAdjustmentAction} submitLabel="Rechazar" variant="outline" submitName="decision" submitValue="REJECT">
                          <input type="hidden" name="adjustmentId" value={a.id} />
                        </ActionForm>
                      </div>
                    )}
                    {a.status === "PENDING" && a.requestedById === user.userId && <span className="text-xs text-muted-foreground">Debe aprobarlo otro usuario</span>}
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
