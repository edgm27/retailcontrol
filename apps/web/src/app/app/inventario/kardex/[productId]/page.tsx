import { getProductDetail, hasPermission, listKardex, listWarehouses } from "@rc/domain";
import { Badge, buttonVariants, EmptyState, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtMoney, fmtNumber, MOVEMENT_LABELS } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { reverseOperationAction } from "../../actions";

export const metadata = { title: "Kardex" };
const REVERSIBLE = new Set(["RECEIPT", "ISSUE", "RETURN_IN", "RETURN_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"]);

export default async function KardexPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ almacen?: string; page?: string }>;
}) {
  const { productId } = await params;
  const sp = await searchParams;
  const { actor, access } = await requireTenant("inventory.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [product, warehouses, k] = await Promise.all([
    getProductDetail(actor, productId),
    listWarehouses(actor),
    listKardex(actor, { productId, warehouseId: sp.almacen || undefined, page }),
  ]);
  const canReverse = hasPermission(access.role, "inventory.adjust") && access.accessMode === "full";
  const pages = Math.max(1, Math.ceil(k.total / k.pageSize));
  const seenOps = new Set<string>();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kardex</h1>
          <p className="text-muted-foreground"><span className="font-mono">{product.sku}</span> · {product.name} · unidad base {product.baseUnit}</p>
        </div>
        <Link href={`/app/productos/${product.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Ver producto</Link>
      </div>
      <form className="flex gap-2" action={`/app/inventario/kardex/${productId}`}>
        <label htmlFor="almacen" className="sr-only">Almacén</label>
        <Select id="almacen" name="almacen" defaultValue={sp.almacen ?? ""} className="max-w-xs">
          <option value="">Todos los almacenes (saldo por almacén)</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <button className={buttonVariants({ variant: "outline" })}>Filtrar</button>
      </form>
      {k.items.length === 0 ? (
        <EmptyState title="Sin movimientos" />
      ) : (
        <Table>
          <caption className="sr-only">Movimientos del producto, más recientes primero</caption>
          <THead>
            <tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Almacén</th><th scope="col">Lote</th><th scope="col" className="text-right">Cantidad</th><th scope="col" className="text-right">Saldo</th><th scope="col" className="text-right">Costo</th><th scope="col">Usuario / motivo</th>{canReverse && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr>
          </THead>
          <TBody>
            {k.items.map((m) => {
              const firstOfOp = !seenOps.has(m.operationId);
              seenOps.add(m.operationId);
              const q = Number(m.quantity);
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{fmtDate(m.createdAt, true)}</td>
                  <td>{MOVEMENT_LABELS[m.type] ?? m.type} {m.reversed && <Badge variant="secondary">Revertido</Badge>}</td>
                  <td>{m.warehouse}</td>
                  <td className="font-mono text-xs">{m.lotNumber ?? "—"}</td>
                  <td className={`text-right tabular-nums ${q < 0 ? "text-destructive" : "text-success"}`}>{q > 0 ? "+" : ""}{fmtNumber(m.quantity)}</td>
                  <td className="text-right font-semibold tabular-nums">{fmtNumber(m.balance)}</td>
                  <td className="text-right tabular-nums">{m.unitCost ? fmtMoney(m.unitCost) : "—"}</td>
                  <td className="max-w-xs text-xs"><div>{m.actorEmail}</div><div className="text-muted-foreground">{m.reason}</div></td>
                  {canReverse && (
                    <td>
                      {firstOfOp && REVERSIBLE.has(m.type) && !m.reversed && (
                        <details>
                          <summary className="cursor-pointer text-sm text-primary">Revertir</summary>
                          <ActionForm action={reverseOperationAction} submitLabel="Confirmar reverso" variant="destructive" className="mt-2 w-60">
                            <input type="hidden" name="operationId" value={m.operationId} />
                            <label className="text-xs" htmlFor={`rev-${m.id}`}>Motivo</label>
                            <Input id={`rev-${m.id}`} name="reason" required minLength={5} />
                          </ActionForm>
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Paginación" className="flex gap-3 text-sm">
          {page > 1 && <Link href={{ query: { ...sp, page: page - 1 } }}>Más recientes</Link>}
          <span>Página {page} de {pages}</span>
          {page < pages && <Link href={{ query: { ...sp, page: page + 1 } }}>Anteriores</Link>}
        </nav>
      )}
    </div>
  );
}
