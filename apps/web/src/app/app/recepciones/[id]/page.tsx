import { getGoodsReceipt } from "@rc/domain";
import { Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Recepción" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireTenant("purchases.read");
  const r = await getGoodsReceipt(actor, id);
  const cur = r.currency;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">REC-{String(r.number).padStart(5, "0")} · {r.supplier.name}</h1>
        <p className="text-muted-foreground">
          {fmtDate(r.receivedAt, true)} · {r.warehouse.name}
          {r.purchaseOrder && <> · <Link className="text-primary hover:underline" href={`/app/compras/${r.purchaseOrder.id}`}>OC-{String(r.purchaseOrder.number).padStart(5, "0")}</Link></>}
          {r.supplierInvoice && <> · factura {r.supplierInvoice}</>}
        </p>
        <p className="mt-1 text-sm">
          Moneda del documento: {cur === "VES" ? "Bs." : "USD"} · moneda base: {r.baseCurrency}
          {r.exchangeRate && <> · <strong>tasa congelada {fmtNumber(r.exchangeRate.toString(), 8)}</strong> (no cambia aunque se registren tasas nuevas)</>}
        </p>
      </div>
      <Table>
        <THead><tr><th scope="col">Producto</th><th scope="col">Lote</th><th scope="col" className="text-right">Cantidad</th><th scope="col" className="text-right">Precio</th><th scope="col" className="text-right">Precio pactado</th><th scope="col" className="text-right">Costo en almacén ({r.baseCurrency}/{"u. base"})</th></tr></THead>
        <TBody>
          {r.lines.map((l) => {
            const lot = l.lotId ? r.lots[l.lotId] : null;
            const diff = l.orderedUnitPrice && !l.orderedUnitPrice.equals(l.unitPrice);
            return (
              <tr key={l.id}>
                <td><span className="font-mono text-xs">{l.product.sku}</span> {l.product.name}</td>
                <td className="font-mono text-xs">{lot ? `${lot.lotNumber}${lot.expiresAt ? ` · vence ${fmtDate(lot.expiresAt.toISOString().slice(0, 10))}` : ""}` : "—"}</td>
                <td className="text-right tabular-nums">{fmtNumber(l.enteredQuantity.toString())} {l.enteredUnit}</td>
                <td className={`text-right tabular-nums ${diff ? "font-semibold text-warning" : ""}`}>{fmtMoney(l.unitPrice.toString(), cur)}</td>
                <td className="text-right tabular-nums">{l.orderedUnitPrice ? fmtMoney(l.orderedUnitPrice.toString(), cur) : "—"}</td>
                <td className="text-right tabular-nums">{fmtNumber(l.landedUnitCost.toString(), 6)}</td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <div className="ml-auto grid w-full max-w-sm gap-1 text-sm">
        <div className="flex justify-between"><span>Mercancía</span><span className="tabular-nums">{fmtMoney(r.merchandiseTotal.toString(), cur)}</span></div>
        <div className="flex justify-between"><span>Gastos adicionales</span><span className="tabular-nums">{fmtMoney(r.additionalCosts.toString(), cur)}</span></div>
        <div className="flex justify-between font-bold"><span>Total en moneda base</span><span className="tabular-nums">{fmtMoney(r.totalBase.toString(), r.baseCurrency)}</span></div>
      </div>
    </div>
  );
}
