import { getInventoryDashboard, hasPermission } from "@rc/domain";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate, fmtMoney, fmtNumber, MOVEMENT_LABELS } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Inicio" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { actor, access } = await requireTenant();
  const canInventory = hasPermission(access.role, "inventory.read");
  const d = canInventory ? await getInventoryDashboard(actor) : null;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Inicio</h1>
      {error === "permiso" && <Alert variant="error">No tiene permiso para acceder a esa sección.</Alert>}
      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/app/inventario?bajo=1" className="rounded-lg focus-visible:ring-2">
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardDescription>Productos con stock bajo</CardDescription>
                  <CardTitle className={`text-3xl ${d.lowStock ? "text-warning" : ""}`}>{d.lowStock}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/app/lotes?dias=30" className="rounded-lg focus-visible:ring-2">
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardDescription>Lotes por vencer (30 días)</CardDescription>
                  <CardTitle className="text-3xl">{d.expiring30.lots}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {fmtMoney(d.expiring30.value, d.currency)}{d.expiring30.expired ? ` · ${d.expiring30.expired} ya vencido(s)` : ""}
                  </p>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/app/inventario" className="rounded-lg focus-visible:ring-2">
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardDescription>Inventario valorizado</CardDescription>
                  <CardTitle className="text-2xl">{fmtMoney(d.inventoryValue, d.currency)}</CardTitle>
                  <p className="text-sm text-muted-foreground">A costo promedio</p>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/app/ajustes" className="rounded-lg focus-visible:ring-2">
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardDescription>Ajustes por aprobar</CardDescription>
                  <CardTitle className={`text-3xl ${d.pendingAdjustments ? "text-warning" : ""}`}>{d.pendingAdjustments}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Últimas operaciones</CardTitle></CardHeader>
            <CardContent>
              {d.recent.length === 0 ? (
                <EmptyState title="Aún no hay movimientos" description="Registre su primera entrada en Inventario → Registrar entrada o salida." />
              ) : (
                <Table>
                  <THead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Producto</th><th scope="col">Almacén</th><th scope="col" className="text-right">Cantidad</th></tr></THead>
                  <TBody>
                    {d.recent.map((r, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">{fmtDate(r.created_at, true)}</td>
                        <td>{MOVEMENT_LABELS[r.type] ?? r.type}</td>
                        <td><span className="font-mono text-xs">{r.sku}</span> {r.name}</td>
                        <td>{r.warehouse}</td>
                        <td className="text-right tabular-nums">{Number(r.quantity) > 0 ? "+" : ""}{fmtNumber(r.quantity)} {r.base_unit}</td>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
