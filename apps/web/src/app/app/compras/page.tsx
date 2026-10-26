import { hasPermission, listPurchaseOrders } from "@rc/domain";
import { Badge, buttonVariants, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate, fmtMoney } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { PO_STATUS } from "./status";

export const metadata = { title: "Compras" };

export default async function PurchaseOrdersPage() {
  const { actor, access } = await requireTenant("purchases.read");
  const orders = await listPurchaseOrders(actor);
  const canWrite = hasPermission(access.role, "purchases.write") && access.accessMode === "full";
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Órdenes de compra</h1>
        <div className="flex gap-2">
          {hasPermission(access.role, "purchases.receive") && <Link href="/app/recepciones" className={buttonVariants({ variant: "outline" })}>Recepciones</Link>}
          {canWrite && <Link href="/app/compras/nueva" className={buttonVariants()}>Nueva orden</Link>}
        </div>
      </div>
      {orders.length === 0 ? <EmptyState title="Sin órdenes de compra" description="Cree una orden o use Reposición para ver qué comprar." /> : (
        <Table>
          <THead><tr><th scope="col">N.º</th><th scope="col">Fecha</th><th scope="col">Proveedor</th><th scope="col">Almacén</th><th scope="col" className="text-right">Total</th><th scope="col">Estado</th></tr></THead>
          <TBody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/app/compras/${o.id}`} className="font-mono text-primary hover:underline">OC-{String(o.number).padStart(5, "0")}</Link></td>
                <td>{fmtDate(o.createdAt)}</td>
                <td>{o.supplier.name}</td>
                <td>{o.warehouse.name}</td>
                <td className="text-right tabular-nums">{fmtMoney(o.total.toString(), o.currency)}</td>
                <td><Badge variant={PO_STATUS[o.status]!.v}>{PO_STATUS[o.status]!.label}</Badge></td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
