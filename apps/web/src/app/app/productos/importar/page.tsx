import { IMPORT_MAX_ROWS } from "@rc/domain";
import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import Link from "next/link";
import { requireTenant } from "@/server/session";
import { importAction } from "./actions";
import { ImportPanel } from "./import-panel";

export const metadata = { title: "Importar productos" };

export default async function ImportProductsPage() {
  await requireTenant("products.write");
  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <Link href="/app/productos" className="text-sm text-primary hover:underline">← Productos</Link>
        <h1 className="mt-1 text-2xl font-bold">Importar productos desde CSV</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Prepare el archivo</CardTitle>
          <CardDescription>
            Descargue la plantilla, complétela en Excel y guárdela como «CSV (delimitado por comas)». Columnas: sku, nombre,
            unidad (UND, KG, G, L, ML, M, CM), stock_minimo, maneja_lotes (si/no), requiere_vencimiento (si/no) y
            codigo_barras. Máximo {IMPORT_MAX_ROWS.toLocaleString("es-VE")} productos y 1 MB por archivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/app/productos/importar/plantilla" className={buttonVariants({ variant: "outline", size: "sm" })} download>Descargar plantilla</a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Cargue y revise</CardTitle>
          <CardDescription>Verá una vista previa con los errores por fila. Nada se guarda hasta que confirme; si hay errores, no se importa ninguna fila.</CardDescription>
        </CardHeader>
        <CardContent><ImportPanel action={importAction} /></CardContent>
      </Card>
    </div>
  );
}
