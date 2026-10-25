import { hasPermission, listStock, listWarehouses } from "@rc/domain";
import { Badge, buttonVariants, EmptyState, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Inventario" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; almacen?: string; bajo?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("inventory.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [warehouses, stock] = await Promise.all([
    listWarehouses(actor),
    listStock(actor, { search: sp.q, warehouseId: sp.almacen || undefined, lowOnly: sp.bajo === "1", page, pageSize: 50 }),
  ]);
  const pages = Math.max(1, Math.ceil(stock.total / stock.pageSize));
  const canMove = hasPermission(access.role, "inventory.move") && access.accessMode === "full";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventario</h1>
        {canMove && (
          <Link href="/app/inventario/movimiento" className={buttonVariants()}>Registrar entrada o salida</Link>
        )}
      </div>
      <form role="search" className="grid gap-3 sm:grid-cols-[1fr_14rem_auto_auto]" action="/app/inventario">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por SKU o nombre" autoComplete="off" />
        <label htmlFor="almacen" className="sr-only">Almacén</label>
        <Select id="almacen" name="almacen" defaultValue={sp.almacen ?? ""}>
          <option value="">Todos los almacenes</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="bajo" value="1" defaultChecked={sp.bajo === "1"} className="h-4 w-4" /> Solo stock bajo
        </label>
        <button className={buttonVariants({ variant: "outline" })}>Filtrar</button>
      </form>
      {stock.items.length === 0 ? (
        <EmptyState title="Sin resultados" description="Cree productos y registre una entrada para ver existencias." />
      ) : (
        <Table>
          <caption className="sr-only">Existencias por producto</caption>
          <THead>
            <tr><th scope="col">SKU</th><th scope="col">Producto</th><th scope="col" className="text-right">Disponible</th><th scope="col" className="text-right">Mínimo</th><th scope="col" className="text-right">Costo prom.</th><th scope="col" className="text-right">Valor</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
          </THead>
          <TBody>
            {stock.items.map((i) => (
              <tr key={i.productId}>
                <td className="font-mono">{i.sku}</td>
                <td>
                  <Link href={`/app/productos/${i.productId}`} className="hover:underline">{i.name}</Link>{" "}
                  {i.lotTracking && <Badge variant="outline">Lotes</Badge>} {i.low && <Badge variant="warning">Stock bajo</Badge>}
                </td>
                <td className="text-right tabular-nums">{fmtNumber(i.available)} {i.baseUnit}</td>
                <td className="text-right tabular-nums">{i.minStock ? fmtNumber(i.minStock) : "—"}</td>
                <td className="text-right tabular-nums">{fmtMoney(i.avgCost)}</td>
                <td className="text-right tabular-nums">{fmtMoney(i.value)}</td>
                <td><Link href={`/app/inventario/kardex/${i.productId}`} className="text-sm text-primary hover:underline">Kardex</Link></td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Paginación" className="flex gap-3 text-sm">
          {page > 1 && <Link href={{ query: { ...sp, page: page - 1 } }}>Anterior</Link>}
          <span>Página {page} de {pages}</span>
          {page < pages && <Link href={{ query: { ...sp, page: page + 1 } }}>Siguiente</Link>}
        </nav>
      )}
    </div>
  );
}
