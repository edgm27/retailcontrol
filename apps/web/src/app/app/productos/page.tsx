import { hasPermission, listProducts } from "@rc/domain";
import { Badge, buttonVariants, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
import { UNIT_LABELS } from "@/lib/format";
import { createProductAction } from "./actions";

export const metadata = { title: "Productos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const { actor, access } = await requireTenant("products.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const res = await listProducts(actor, { search: sp.q, page, pageSize: 25 });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const canWrite = hasPermission(access.role, "products.write") && access.accessMode === "full";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Productos</h1>
        {canWrite && <Link href="/app/productos/importar" className={buttonVariants({ variant: "outline", size: "sm" })}>Importar desde CSV</Link>}
      </div>
      <form role="search" className="flex gap-2" action="/app/productos">
        <label htmlFor="q" className="sr-only">Buscar por SKU o nombre</label>
        {/* Un lector de código de barras USB funciona como teclado: escribe y envía Enter. */}
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por SKU o nombre (o escanee)" autoComplete="off" />
      </form>
      {res.items.length === 0 ? (
        <EmptyState title="No hay productos" description={sp.q ? "Ningún producto coincide con la búsqueda." : "Cree su primer producto."} />
      ) : (
        <Table>
          <caption className="sr-only">Productos de la empresa</caption>
          <THead>
            <tr><th scope="col">SKU</th><th scope="col">Nombre</th><th scope="col">Unidad</th><th scope="col">Estado</th></tr>
          </THead>
          <TBody>
            {res.items.map((p) => (
              <tr key={p.id}>
                <td className="font-mono">{p.sku}</td>
                <td><Link href={`/app/productos/${p.id}`} className="hover:underline">{p.name}</Link> {p.lotTracking && <Badge variant="outline">{p.requiresExpiry ? "Lote + vence" : "Lotes"}</Badge>}</td>
                <td>{p.baseUnit}</td>
                <td><Badge variant={p.status === "ACTIVE" ? "success" : "secondary"}>{p.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Paginación" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={{ query: { q: sp.q, page: page - 1 } }}>Anterior</Link>}
          <span>Página {page} de {pages}</span>
          {page < pages && <Link href={{ query: { q: sp.q, page: page + 1 } }}>Siguiente</Link>}
        </nav>
      )}
      {canWrite && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nuevo producto</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createProductAction} submitLabel="Crear producto">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SKU" htmlFor="sku" hint="Único dentro de su empresa.">
                  <Input id="sku" name="sku" required maxLength={64} autoCapitalize="characters" />
                </Field>
                <Field label="Nombre" htmlFor="name">
                  <Input id="name" name="name" required minLength={2} maxLength={200} />
                </Field>
                <Field label="Unidad base" htmlFor="baseUnit" hint="En la que se lleva el inventario. Las presentaciones (caja, bulto) se agregan después.">
                  <Select id="baseUnit" name="baseUnit" defaultValue="UND">
                    {Object.entries(UNIT_LABELS).map(([c, l]) => <option key={c} value={c}>{l} ({c})</option>)}
                  </Select>
                </Field>
                <Field label="Stock mínimo (opcional)" htmlFor="minStock" hint="Para la alerta de stock bajo.">
                  <Input id="minStock" name="minStock" inputMode="decimal" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="lotTracking" className="h-4 w-4" /> Maneja lotes</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="requiresExpiry" className="h-4 w-4" /> Exige fecha de vencimiento (perecedero)</label>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
