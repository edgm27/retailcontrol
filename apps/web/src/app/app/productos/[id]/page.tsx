import { getProductDetail, getProductStock, hasPermission } from "@rc/domain";
import { Badge, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtMoney, fmtNumber, LOT_STATUS_LABELS, UNIT_LABELS } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { addBarcodeAction, addUnitAction, updateProductSettingsAction } from "../../inventario/actions";

export const metadata = { title: "Producto" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, access } = await requireTenant("products.read");
  const [p, stock] = await Promise.all([getProductDetail(actor, id), getProductStock(actor, id)]);
  const canWrite = hasPermission(access.role, "products.write") && access.accessMode === "full";
  const total = stock.reduce((a, s) => a + Number(s.onHand), 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-muted-foreground">
            <span className="font-mono">{p.sku}</span> · {UNIT_LABELS[p.baseUnit]} ({p.baseUnit}) · costo promedio {fmtMoney(p.avgCost.toString())}
            {" "}{p.lotTracking && <Badge variant="outline">{p.requiresExpiry ? "Lote + vencimiento" : "Lotes"}</Badge>}
          </p>
        </div>
        <Link href={`/app/inventario/kardex/${p.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Ver Kardex</Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Existencias: {fmtNumber(total)} {p.baseUnit}</CardTitle></CardHeader>
        <CardContent>
          {stock.length === 0 ? (
            <EmptyState title="Sin existencias" />
          ) : (
            <Table>
              <THead><tr><th scope="col">Almacén</th><th scope="col">Lote</th><th scope="col">Vence</th><th scope="col">Estado</th><th scope="col" className="text-right">En mano</th></tr></THead>
              <TBody>
                {stock.map((s) => (
                  <tr key={`${s.warehouseId}-${s.lotId}`}>
                    <td>{s.warehouse}</td>
                    <td className="font-mono text-xs">{s.lotNumber ?? "—"}</td>
                    <td>{s.expiresAt ? fmtDate(s.expiresAt) : "—"}</td>
                    <td>
                      {s.expired ? <Badge variant="destructive">Vencido</Badge> : s.status ? <Badge variant={s.status === "AVAILABLE" ? "success" : "warning"}>{LOT_STATUS_LABELS[s.status]}</Badge> : "—"}
                    </td>
                    <td className="text-right tabular-nums">{fmtNumber(s.onHand)}</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Configuración de inventario</CardTitle></CardHeader>
          <CardContent>
            {canWrite ? (
              <ActionForm action={updateProductSettingsAction} submitLabel="Guardar">
                <input type="hidden" name="productId" value={p.id} />
                <Field label="Unidad base" htmlFor="ps-unit" hint="No se puede cambiar si ya hay movimientos.">
                  <Select id="ps-unit" name="baseUnit" defaultValue={p.baseUnit}>
                    {Object.entries(UNIT_LABELS).map(([c, l]) => <option key={c} value={c}>{l} ({c})</option>)}
                  </Select>
                </Field>
                <Field label="Stock mínimo" htmlFor="ps-min">
                  <Input id="ps-min" name="minStock" inputMode="decimal" defaultValue={p.minStock ? fmtNumber(p.minStock.toString(), 6) : ""} />
                </Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lotTracking" defaultChecked={p.lotTracking} className="h-4 w-4" /> Maneja lotes</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiresExpiry" defaultChecked={p.requiresExpiry} className="h-4 w-4" /> Exige vencimiento</label>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">Solo lectura.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Presentaciones</CardTitle>
            <CardDescription>Ej.: CAJA = 24 {p.baseUnit}. Permiten registrar en cajas o bultos.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-1 text-sm">
              {p.units.length === 0 && <li className="text-muted-foreground">Sin presentaciones.</li>}
              {p.units.map((u) => <li key={u.id}><span className="font-mono">{u.code}</span> · {u.name} = {fmtNumber(u.factorToBase.toString(), 6)} {p.baseUnit}</li>)}
            </ul>
            {canWrite && (
              <ActionForm action={addUnitAction} submitLabel="Agregar" variant="outline">
                <input type="hidden" name="productId" value={p.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Código" htmlFor="u-code"><Input id="u-code" name="code" required maxLength={16} placeholder="CAJA" /></Field>
                  <Field label={`Contiene (${p.baseUnit})`} htmlFor="u-factor"><Input id="u-factor" name="factor" inputMode="decimal" required /></Field>
                </div>
                <Field label="Nombre" htmlFor="u-name"><Input id="u-name" name="name" required maxLength={60} placeholder="Caja de 24" /></Field>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Códigos de barra</CardTitle>
            <CardDescription>EAN/UPC se validan por dígito verificador. También códigos internos.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-1 text-sm">
              {p.barcodes.length === 0 && <li className="text-muted-foreground">Sin códigos.</li>}
              {p.barcodes.map((b) => <li key={b.id} className="font-mono">{b.code} {b.unitCode && <span className="text-muted-foreground">({b.unitCode})</span>}</li>)}
            </ul>
            {canWrite && (
              <ActionForm action={addBarcodeAction} submitLabel="Agregar" variant="outline">
                <input type="hidden" name="productId" value={p.id} />
                <Field label="Código (escanee o escriba)" htmlFor="bc-code"><Input id="bc-code" name="code" required autoComplete="off" /></Field>
                <Field label="Representa" htmlFor="bc-unit">
                  <Select id="bc-unit" name="unitCode" defaultValue="">
                    <option value="">1 {p.baseUnit}</option>
                    {p.units.map((u) => <option key={u.id} value={u.code}>{u.name}</option>)}
                  </Select>
                </Field>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
