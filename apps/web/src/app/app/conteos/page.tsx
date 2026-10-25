import { hasPermission, listStockCounts, listWarehouses } from "@rc/domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtMoney } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { createCountAction } from "../inventario/actions";

export const metadata = { title: "Conteos físicos" };
const COUNT_STATUS: Record<string, { label: string; v: "warning" | "success" | "destructive" | "secondary" }> = {
  OPEN: { label: "Abierto", v: "secondary" },
  PENDING_APPROVAL: { label: "Por aprobar", v: "warning" },
  APPLIED: { label: "Aplicado", v: "success" },
  CANCELLED: { label: "Cancelado", v: "destructive" },
};

export default async function CountsPage() {
  const { actor, access } = await requireTenant("inventory.read");
  const canCount = hasPermission(access.role, "inventory.count") && access.accessMode === "full";
  const [counts, warehouses] = await Promise.all([listStockCounts(actor), listWarehouses(actor)]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Conteos físicos</h1>
      {canCount && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Nuevo conteo</CardTitle>
            <CardDescription>Se toma una foto de las existencias actuales del almacén. Evite despachar mientras cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createCountAction} submitLabel="Iniciar conteo">
              <Field label="Almacén" htmlFor="ct-wh"><Select id="ct-wh" name="warehouseId">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
              <Field label="Nota (opcional)" htmlFor="ct-note"><Input id="ct-note" name="note" maxLength={300} placeholder="Ej.: conteo cíclico de víveres" /></Field>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {counts.length === 0 ? (
        <EmptyState title="Sin conteos" />
      ) : (
        <Table>
          <THead><tr><th scope="col">Fecha</th><th scope="col">Almacén</th><th scope="col">Líneas</th><th scope="col" className="text-right">Diferencia (valor)</th><th scope="col">Estado</th></tr></THead>
          <TBody>
            {counts.map((c) => (
              <tr key={c.id}>
                <td><Link className="text-primary hover:underline" href={`/app/conteos/${c.id}`}>{fmtDate(c.createdAt, true)}</Link></td>
                <td>{c.warehouse.name}</td>
                <td>{c._count.lines}</td>
                <td className="text-right tabular-nums">{c.differenceValue ? fmtMoney(c.differenceValue.toString()) : "—"}</td>
                <td><Badge variant={COUNT_STATUS[c.status]!.v}>{COUNT_STATUS[c.status]!.label}</Badge></td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
