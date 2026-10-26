import { listProductOptions, listSuppliers, listWarehouses } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { receiveGoodsAction } from "../../compras/actions";

export const metadata = { title: "Recepción sin orden" };

export default async function NewReceiptPage() {
  const { actor } = await requireTenant("purchases.receive");
  const [suppliers, warehouses, products] = await Promise.all([listSuppliers(actor), listWarehouses(actor), listProductOptions(actor)]);
  if (!suppliers.length) return <p>Primero cree un proveedor en <Link className="text-primary underline" href="/app/proveedores">Proveedores</Link>.</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recepción sin orden de compra</CardTitle>
        <CardDescription>Para compras de contado o mercancía que llegó sin orden. Si es en bolívares se usa y guarda la tasa de hoy.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={receiveGoodsAction} submitLabel="Registrar recepción" idempotent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Proveedor" htmlFor="nr-sup"><Select id="nr-sup" name="supplierId">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Almacén" htmlFor="nr-wh"><Select id="nr-wh" name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
            <Field label="Moneda" htmlFor="nr-cur"><Select id="nr-cur" name="currency"><option value="USD">USD</option><option value="VES">Bs.</option></Select></Field>
            <Field label="Factura / nota de entrega" htmlFor="nr-inv"><Input id="nr-inv" name="supplierInvoice" maxLength={60} /></Field>
            <Field label="Gastos adicionales" htmlFor="nr-add"><Input id="nr-add" name="additionalCosts" inputMode="decimal" /></Field>
          </div>
          <datalist id="nr-products">{products.map((p) => <option key={p.id} value={`${p.sku} — ${p.name}`} />)}</datalist>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Productos recibidos</legend>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
                <Input name={`lines[${i}].productCode`} list="nr-products" placeholder="Producto" aria-label={`Producto ${i + 1}`} autoComplete="off" required={i === 0} />
                <Input name={`lines[${i}].quantity`} inputMode="decimal" placeholder="Cantidad" aria-label={`Cantidad ${i + 1}`} />
                <Input name={`lines[${i}].unit`} placeholder="Unidad (UND)" aria-label={`Unidad ${i + 1}`} />
                <Input name={`lines[${i}].unitPrice`} inputMode="decimal" placeholder="Precio unit." aria-label={`Precio ${i + 1}`} />
                <Input name={`lines[${i}].lotNumber`} placeholder="Lote" aria-label={`Lote ${i + 1}`} />
                <Input name={`lines[${i}].expiresAt`} type="date" aria-label={`Vencimiento ${i + 1}`} />
              </div>
            ))}
          </fieldset>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
