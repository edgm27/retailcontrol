import { getPurchaseOrder, hasPermission } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { purchaseOrderStepAction, receiveGoodsAction } from "../actions";
import { PO_STATUS } from "../status";

export const metadata = { title: "Orden de compra" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, access } = await requireTenant("purchases.read");
  const po = await getPurchaseOrder(actor, id);
  const writable = access.accessMode === "full";
  const open = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
  const canApprove = hasPermission(access.role, "purchases.approve") && writable && po.status === "DRAFT";
  const canReceive = hasPermission(access.role, "purchases.receive") && writable && open;
  const canCancel = hasPermission(access.role, "purchases.write") && writable && (po.status === "DRAFT" || open);
  const code = `OC-${String(po.number).padStart(5, "0")}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{code} · {po.supplier.name}</h1>
          <p className="text-muted-foreground">
            {fmtDate(po.createdAt)} · {po.warehouse.name} · {po.currency === "VES" ? "Bs." : "USD"}
            {po.exchangeRate && <> · tasa congelada {fmtNumber(po.exchangeRate.toString(), 8)}</>} · <Badge variant={PO_STATUS[po.status]!.v}>{PO_STATUS[po.status]!.label}</Badge>
          </p>
        </div>
        <Link href="/app/compras" className="text-sm text-primary hover:underline">← Órdenes</Link>
      </div>
      <Table>
        <THead><tr><th scope="col">Producto</th><th scope="col" className="text-right">Pedido</th><th scope="col" className="text-right">Recibido</th><th scope="col" className="text-right">Precio</th><th scope="col" className="text-right">IVA %</th><th scope="col" className="text-right">Importe</th></tr></THead>
        <TBody>
          {po.lines.map((l) => (
            <tr key={l.id}>
              <td><span className="font-mono text-xs">{l.product.sku}</span> {l.product.name}</td>
              <td className="text-right tabular-nums">{fmtNumber(l.enteredQuantity.toString())} {l.enteredUnit}</td>
              <td className="text-right tabular-nums">{fmtNumber(l.receivedQuantity.toString())} / {fmtNumber(l.quantity.toString())} {l.product.baseUnit}</td>
              <td className="text-right tabular-nums">{fmtMoney(l.unitPrice.toString(), po.currency)}</td>
              <td className="text-right tabular-nums">{fmtNumber(l.taxRate.toString(), 4)}</td>
              <td className="text-right tabular-nums">{fmtMoney(l.enteredQuantity.times(l.unitPrice).toString(), po.currency)}</td>
            </tr>
          ))}
        </TBody>
      </Table>
      <div className="ml-auto grid w-full max-w-xs gap-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(po.subtotal.toString(), po.currency)}</span></div>
        <div className="flex justify-between"><span>Impuestos</span><span className="tabular-nums">{fmtMoney(po.taxTotal.toString(), po.currency)}</span></div>
        <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{fmtMoney(po.total.toString(), po.currency)}</span></div>
      </div>

      <div className="flex flex-wrap gap-3">
        {canApprove && (
          <ActionForm action={purchaseOrderStepAction} submitLabel="Aprobar orden" submitName="intent" submitValue="approve">
            <input type="hidden" name="purchaseOrderId" value={po.id} />
          </ActionForm>
        )}
        {canCancel && (
          <details>
            <summary className="cursor-pointer text-sm text-destructive">{open && po.status === "PARTIALLY_RECEIVED" ? "Cerrar lo pendiente" : "Cancelar orden"}</summary>
            <ActionForm action={purchaseOrderStepAction} submitLabel="Confirmar" variant="destructive" submitName="intent" submitValue="cancel" className="mt-2 w-72">
              <input type="hidden" name="purchaseOrderId" value={po.id} />
              <Input name="reason" required minLength={5} placeholder="Motivo" aria-label="Motivo" />
            </ActionForm>
          </details>
        )}
      </div>

      {canReceive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recibir mercancía</CardTitle>
            <CardDescription>
              Indique lo que llegó (puede ser parcial). Para recibir una línea en dos lotes, registre dos recepciones.
              {po.currency !== "USD" && " Se usará la tasa vigente de hoy y quedará guardada en la recepción."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={receiveGoodsAction} submitLabel="Registrar recepción" pendingLabel="Registrando…" idempotent>
              <input type="hidden" name="purchaseOrderId" value={po.id} />
              <input type="hidden" name="supplierId" value={po.supplierId} />
              <input type="hidden" name="warehouseId" value={po.warehouseId} />
              <input type="hidden" name="currency" value={po.currency} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Factura o nota de entrega del proveedor" htmlFor="rc-inv"><Input id="rc-inv" name="supplierInvoice" maxLength={60} /></Field>
                <Field label={`Gastos adicionales (${po.currency === "VES" ? "Bs." : "USD"})`} htmlFor="rc-add" hint="Flete, acarreo… se reparten según el valor de cada línea."><Input id="rc-add" name="additionalCosts" inputMode="decimal" /></Field>
              </div>
              <div className="grid gap-3">
                {po.lines.map((l, i) => {
                  const factor = l.quantity.dividedBy(l.enteredQuantity);
                  const pending = l.quantity.minus(l.receivedQuantity).dividedBy(factor);
                  if (pending.lessThanOrEqualTo(0)) return null;
                  return (
                    <fieldset key={l.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
                      <legend className="px-1 text-sm font-medium">{l.product.sku} · {l.product.name}</legend>
                      <input type="hidden" name={`lines[${i}].poLineId`} value={l.id} />
                      <input type="hidden" name={`lines[${i}].productId`} value={l.product.id} />
                      <input type="hidden" name={`lines[${i}].unit`} value={l.enteredUnit} />
                      <span className="self-center text-xs text-muted-foreground">Pendiente: {fmtNumber(pending.toString())} {l.enteredUnit}</span>
                      <Input name={`lines[${i}].quantity`} inputMode="decimal" defaultValue={fmtNumber(pending.toString(), 6)} aria-label={`Cantidad recibida ${l.product.sku}`} />
                      <Input name={`lines[${i}].unitPrice`} inputMode="decimal" defaultValue={fmtNumber(l.unitPrice.toString(), 6)} aria-label={`Precio ${l.product.sku}`} />
                      {l.product.lotTracking ? (
                        <>
                          <Input name={`lines[${i}].lotNumber`} placeholder="Lote" aria-label={`Lote ${l.product.sku}`} />
                          <Input name={`lines[${i}].expiresAt`} type="date" aria-label={`Vencimiento ${l.product.sku}`} required={l.product.requiresExpiry} />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground sm:col-span-2">Sin lote</span>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {po.receipts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recepciones</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {po.receipts.map((r) => (
                <li key={r.id}>
                  <Link className="text-primary hover:underline" href={`/app/recepciones/${r.id}`}>REC-{String(r.number).padStart(5, "0")}</Link> · {fmtDate(r.receivedAt, true)}
                  {r.supplierInvoice ? ` · factura ${r.supplierInvoice}` : ""} · {fmtMoney(r.totalBase.toString(), r.baseCurrency)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
