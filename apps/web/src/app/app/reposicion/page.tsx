import { hasPermission, listReplenishmentSuggestions } from "@rc/domain";
import { buttonVariants, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Reposición sugerida" };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("purchases.read");
  const r = await listReplenishmentSuggestions(actor, { coverageDays: Number(sp.dias) || 15 });
  const canBuy = hasPermission(access.role, "purchases.write") && access.accessMode === "full";
  const bySupplier = new Map<string, typeof r.items>();
  for (const i of r.items) {
    const k = i.supplierId ?? "";
    bySupplier.set(k, [...(bySupplier.get(k) ?? []), i]);
  }
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Reposición sugerida</h1>
        <p className="text-muted-foreground">
          Productos bajo su stock mínimo, según las salidas de los últimos 30 días y {r.coverageDays} días de cobertura.
          Ya descuenta lo pedido en órdenes abiertas. Nada se compra sin su aprobación.
        </p>
      </div>
      <nav className="flex gap-2 text-sm" aria-label="Cobertura">
        {[7, 15, 30].map((d) => <Link key={d} href={{ query: { dias: d } }} aria-current={d === r.coverageDays} className={`rounded-full border px-3 py-1 ${d === r.coverageDays ? "bg-primary text-primary-foreground" : ""}`}>{d} días</Link>)}
      </nav>
      {r.items.length === 0 ? <EmptyState title="Nada por reponer" description="Defina el stock mínimo de sus productos para recibir sugerencias." /> : (
        [...bySupplier.entries()].map(([supplierId, items]) => (
          <section key={supplierId} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{items[0]!.supplierName ?? "Sin proveedor preferido"}</h2>
              {canBuy && (
                <Link
                  className={buttonVariants({ size: "sm" })}
                  href={`/app/compras/nueva?${new URLSearchParams({ ...(supplierId ? { proveedor: supplierId } : {}), productos: items.map((i) => `${i.sku}:${i.suggested}`).join(",") })}`}
                >
                  Crear borrador de orden
                </Link>
              )}
            </div>
            <Table>
              <THead><tr><th scope="col">Producto</th><th scope="col" className="text-right">Disponible</th><th scope="col" className="text-right">Mínimo</th><th scope="col" className="text-right">Salida diaria</th><th scope="col" className="text-right">Pedido</th><th scope="col" className="text-right">Sugerido</th><th scope="col" className="text-right">Costo estimado</th></tr></THead>
              <TBody>
                {items.map((i) => (
                  <tr key={i.productId}>
                    <td><span className="font-mono text-xs">{i.sku}</span> {i.name}</td>
                    <td className="text-right tabular-nums">{fmtNumber(i.available)}</td>
                    <td className="text-right tabular-nums">{fmtNumber(i.minStock)}</td>
                    <td className="text-right tabular-nums">{fmtNumber(i.dailyDemand)}</td>
                    <td className="text-right tabular-nums">{fmtNumber(i.onOrder)}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtNumber(i.suggested)} {i.baseUnit}</td>
                    <td className="text-right tabular-nums">{fmtMoney(i.estimatedCost)}</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </section>
        ))
      )}
    </div>
  );
}
