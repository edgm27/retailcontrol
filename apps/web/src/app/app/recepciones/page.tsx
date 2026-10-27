import { hasPermission, listGoodsReceipts } from "@rc/domain";
import { buttonVariants, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Recepciones" };

export default async function ReceiptsPage() {
  const { actor, access } = await requireTenant("purchases.read");
  const receipts = await listGoodsReceipts(actor);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Recepciones de mercancía</h1>
        {hasPermission(access.role, "purchases.receive") && access.accessMode === "full" && (
          <div className="flex flex-wrap gap-2">
            <Link href="/app/recepciones/escanear" className={buttonVariants()}>Recibir con escáner</Link>
            <Link href="/app/recepciones/nueva" className={buttonVariants({ variant: "outline" })}>Recepción sin orden</Link>
          </div>
        )}
      </div>
      {receipts.length === 0 ? <EmptyState title="Sin recepciones" description="Reciba desde una orden de compra aprobada o registre una recepción sin orden." /> : (
        <Table>
          <THead><tr><th scope="col">N.º</th><th scope="col">Fecha</th><th scope="col">Proveedor</th><th scope="col">Orden</th><th scope="col">Factura</th><th scope="col" className="text-right">Tasa</th><th scope="col" className="text-right">Total (base)</th></tr></THead>
          <TBody>
            {receipts.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/app/recepciones/${r.id}`} className="font-mono text-primary hover:underline">REC-{String(r.number).padStart(5, "0")}</Link></td>
                <td>{fmtDate(r.receivedAt, true)}</td>
                <td>{r.supplier.name}</td>
                <td className="font-mono text-xs">{r.purchaseOrder ? `OC-${String(r.purchaseOrder.number).padStart(5, "0")}` : "—"}</td>
                <td>{r.supplierInvoice ?? "—"}</td>
                <td className="text-right tabular-nums">{r.exchangeRate ? fmtNumber(r.exchangeRate.toString(), 8) : "—"}</td>
                <td className="text-right tabular-nums">{fmtMoney(r.totalBase.toString(), r.baseCurrency)}</td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
