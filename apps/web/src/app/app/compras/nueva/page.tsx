import { listProductOptions, listSuppliers, listTaxRates, listWarehouses } from "@rc/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { createPurchaseOrderAction } from "../actions";

export const metadata = { title: "Nueva orden de compra" };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ proveedor?: string; productos?: string }> }) {
  const sp = await searchParams;
  const { actor } = await requireTenant("purchases.write");
  const [suppliers, warehouses, products, taxes] = await Promise.all([
    listSuppliers(actor),
    listWarehouses(actor),
    listProductOptions(actor),
    listTaxRates(actor, { activeOnly: true }),
  ]);
  // Prellenado desde Reposición: ?productos=SKU:cantidad,SKU:cantidad
  const prefill = (sp.productos ?? "").split(",").filter(Boolean).map((x) => { const [sku, q] = x.split(":"); return { sku: sku ?? "", qty: q ?? "" }; });
  const rows = Math.max(6, prefill.length + 2);
  if (!suppliers.length) {
    return <p>Primero cree un proveedor en <Link href="/app/proveedores" className="text-primary underline">Proveedores</Link>.</p>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva orden de compra</CardTitle>
        <CardDescription>Se crea en borrador. No afecta el inventario hasta que se reciba la mercancía.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={createPurchaseOrderAction} submitLabel="Crear borrador">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Proveedor" htmlFor="po-sup"><Select id="po-sup" name="supplierId" defaultValue={sp.proveedor}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Almacén de destino" htmlFor="po-wh"><Select id="po-wh" name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
            <Field label="Moneda" htmlFor="po-cur"><Select id="po-cur" name="currency"><option value="USD">USD</option><option value="VES">Bs.</option></Select></Field>
            <Field label="Fecha esperada" htmlFor="po-date"><Input id="po-date" name="expectedDate" type="date" /></Field>
          </div>
          <datalist id="po-products">{products.map((p) => <option key={p.id} value={`${p.sku} — ${p.name}`} />)}</datalist>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Productos · precio por unidad indicada, en la moneda de la orden</legend>
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
                <Input name={`lines[${i}].productCode`} list="po-products" placeholder="Producto (SKU o código)" aria-label={`Producto línea ${i + 1}`} defaultValue={prefill[i]?.sku ?? ""} autoComplete="off" required={i === 0} />
                <Input name={`lines[${i}].quantity`} inputMode="decimal" placeholder="Cantidad" aria-label={`Cantidad línea ${i + 1}`} defaultValue={prefill[i]?.qty ?? ""} />
                <Input name={`lines[${i}].unit`} placeholder="Unidad (base)" aria-label={`Unidad línea ${i + 1}`} />
                <Input name={`lines[${i}].unitPrice`} inputMode="decimal" placeholder="Precio unitario" aria-label={`Precio línea ${i + 1}`} />
                <Select name={`lines[${i}].taxRate`} aria-label={`Impuesto línea ${i + 1}`} defaultValue="0">
                  <option value="0">Sin impuesto</option>
                  {taxes.map((t) => <option key={t.id} value={t.rate.toString()}>{t.name} ({t.rate.toString()}%)</option>)}
                </Select>
              </div>
            ))}
          </fieldset>
          <Field label="Notas" htmlFor="po-notes"><Input id="po-notes" name="notes" maxLength={500} /></Field>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
