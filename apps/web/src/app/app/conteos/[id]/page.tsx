import { getStockCount, hasPermission, listProductOptions } from "@rc/domain";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Table, TBody, THead } from "@rc/ui";
import { ActionForm } from "@/components/action-form";
import { ProductPicker } from "@/components/inventory/product-picker";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { addCountLineAction, decideCountAction, saveCountAction } from "../../inventario/actions";

export const metadata = { title: "Conteo" };
const STATUS: Record<string, string> = { OPEN: "Abierto", PENDING_APPROVAL: "Por aprobar", APPLIED: "Aplicado", CANCELLED: "Cancelado" };

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, access, user } = await requireTenant("inventory.read");
  const c = await getStockCount(actor, id);
  const writable = access.accessMode === "full";
  const canCount = hasPermission(access.role, "inventory.count") && writable && c.status === "OPEN";
  const canApprove = hasPermission(access.role, "inventory.adjust.approve") && writable && c.status === "PENDING_APPROVAL" && c.submittedById !== user.userId;
  const products = canCount ? await listProductOptions(actor) : [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Conteo · {c.warehouse.name}</h1>
        <p className="text-muted-foreground">
          {fmtDate(c.createdAt, true)} · <Badge variant="secondary">{STATUS[c.status]}</Badge>
          {c.differenceValue && <> · diferencia valorizada {fmtMoney(c.differenceValue.toString())}</>}
          {c.note && <> · {c.note}</>}
        </p>
      </div>
      <ActionForm
        action={saveCountAction}
        submitLabel="Guardar cantidades"
        variant="outline"
        extraActions={canCount ? <Button type="submit" name="intent" value="submit">Enviar conteo</Button> : undefined}
      >
        <input type="hidden" name="countId" value={c.id} />
        <Table>
          <THead><tr><th scope="col">Producto</th><th scope="col">Lote</th><th scope="col" className="text-right">Esperado</th><th scope="col">Contado</th><th scope="col" className="text-right">Diferencia</th></tr></THead>
          <TBody>
            {c.lines.map((l) => {
              const diff = l.counted !== null ? Number(l.counted) - Number(l.expected) : null;
              const lot = l.lotId ? c.lots[l.lotId] : null;
              return (
                <tr key={l.id}>
                  <td><span className="font-mono text-xs">{l.product.sku}</span> {l.product.name}</td>
                  <td className="font-mono text-xs">{lot ? `${lot.lotNumber}${lot.expiresAt ? ` (${fmtDate(lot.expiresAt)})` : ""}` : "—"}</td>
                  <td className="text-right tabular-nums">{fmtNumber(l.expected.toString())} {l.product.baseUnit}</td>
                  <td>
                    {canCount ? (
                      <Input name={`counted:${l.id}`} inputMode="decimal" defaultValue={l.counted !== null ? fmtNumber(l.counted.toString(), 6) : ""} aria-label={`Contado ${l.product.sku}`} className="w-32" />
                    ) : (
                      <span className="tabular-nums">{l.counted !== null ? fmtNumber(l.counted.toString()) : "—"}</span>
                    )}
                  </td>
                  <td className={`text-right tabular-nums ${diff && diff < 0 ? "text-destructive" : diff && diff > 0 ? "text-success" : ""}`}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtNumber(diff)}`}</td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </ActionForm>
      {canCount && (
        <Card className="max-w-3xl">
          <CardHeader><CardTitle className="text-base">Agregar producto no listado</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={addCountLineAction} submitLabel="Agregar" variant="outline">
              <input type="hidden" name="countId" value={c.id} />
              <ProductPicker products={products} lotMode="outbound" idPrefix="cl" withQuantity={false} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        {canApprove && (
          <ActionForm action={decideCountAction} submitLabel="Aprobar y aplicar ajustes" submitName="intent" submitValue="approve">
            <input type="hidden" name="countId" value={c.id} />
          </ActionForm>
        )}
        {(c.status === "OPEN" || c.status === "PENDING_APPROVAL") && hasPermission(access.role, "inventory.count") && writable && (
          <ActionForm action={decideCountAction} submitLabel="Cancelar conteo" variant="destructive" submitName="intent" submitValue="cancel">
            <input type="hidden" name="countId" value={c.id} />
          </ActionForm>
        )}
      </div>
    </div>
  );
}
