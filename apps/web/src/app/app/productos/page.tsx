import { hasPermission, listProducts } from "@rc/domain";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireTenant } from "@/server/session";
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
      <h1 className="text-2xl font-bold">Productos</h1>
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
            <tr><th scope="col">SKU</th><th scope="col">Nombre</th><th scope="col">Estado</th></tr>
          </THead>
          <TBody>
            {res.items.map((p) => (
              <tr key={p.id}>
                <td className="font-mono">{p.sku}</td>
                <td>{p.name}</td>
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
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
