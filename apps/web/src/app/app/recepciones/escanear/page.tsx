import { getReceiptScanContext, hasPermission, listSuppliers, listWarehouses } from "@rc/domain";
import { Alert } from "@rc/ui";
import Link from "next/link";
import { requireTenant } from "@/server/session";
import { ReceiptScanner } from "./receipt-scanner";

export const metadata = { title: "Recibir con escáner" };

export default async function ScanReceiptPage() {
  const { actor, access } = await requireTenant("purchases.receive");
  const [suppliers, warehouses, ctx] = await Promise.all([listSuppliers(actor), listWarehouses(actor), getReceiptScanContext(actor)]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <Link href="/app/recepciones" className="text-sm text-primary hover:underline">← Recepciones</Link>
        <h1 className="mt-1 text-2xl font-bold">Recibir con escáner</h1>
        <p className="text-sm text-muted-foreground">
          Escanee cada producto con la cámara del celular, indique cantidad, costo, lote y vencimiento, y registre la recepción al terminar.
        </p>
      </div>
      {access.accessMode !== "full" ? (
        <Alert variant="warning">La empresa está en modo solo lectura: no se pueden registrar recepciones.</Alert>
      ) : !suppliers.length ? (
        <Alert variant="info">Primero cree un proveedor en <Link className="underline" href="/app/proveedores">Proveedores</Link>.</Alert>
      ) : !warehouses.length ? (
        <Alert variant="info">No tiene almacenes disponibles para recibir.</Alert>
      ) : (
        <ReceiptScanner
          tenantId={actor.tenantId}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          warehouses={warehouses.map((w) => ({ id: w.id, name: `${w.name} · ${w.branch.name}` }))}
          baseCurrency={ctx.baseCurrency}
          rate={ctx.rate ? Number(ctx.rate) : null}
          today={today}
          canSaveBarcodes={hasPermission(access.role, "products.write")}
        />
      )}
    </div>
  );
}
