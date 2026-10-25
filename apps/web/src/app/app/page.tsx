import { listProducts } from "@rc/domain";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Inicio" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { actor, access } = await requireTenant();
  const products = access.role ? await listProducts(actor, { pageSize: 1 }).catch(() => null) : null;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Inicio</h1>
      {error === "permiso" && <Alert variant="error">No tiene permiso para acceder a esa sección.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Productos en catálogo</CardDescription>
            <CardTitle className="text-3xl">{products ? products.total : "—"}</CardTitle>
          </CardHeader>
        </Card>
        {["Stock bajo", "Lotes por vencer", "Inventario valorizado"].map((t) => (
          <Card key={t}>
            <CardHeader>
              <CardDescription>{t}</CardDescription>
              <CardTitle className="text-base text-muted-foreground">Disponible en la Fase 2</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado del producto</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta versión incluye empresas, usuarios, roles, sucursales, almacenes, catálogo básico, verificación en dos
          pasos y auditoría. Movimientos de inventario, lotes y vencimientos llegan en la siguiente fase.
        </CardContent>
      </Card>
    </div>
  );
}
