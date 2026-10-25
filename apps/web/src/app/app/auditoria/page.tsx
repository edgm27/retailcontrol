import { listAuditEvents } from "@rc/domain";
import { EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Auditoría" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { actor } = await requireTenant("audit.read");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const res = await listAuditEvents(actor, { page, pageSize: 50 });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Auditoría</h1>
      {res.items.length === 0 ? (
        <EmptyState title="Sin eventos" />
      ) : (
        <Table>
          <caption className="sr-only">Bitácora de auditoría (más recientes primero)</caption>
          <THead><tr><th scope="col">Fecha (Caracas)</th><th scope="col">Acción</th><th scope="col">Entidad</th><th scope="col">Detalle</th></tr></THead>
          <TBody>
            {res.items.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{e.createdAt.toLocaleString("es-VE", { timeZone: "America/Caracas" })}</td>
                <td className="font-mono text-xs">{e.action}</td>
                <td className="text-xs">{e.entityType}</td>
                <td className="max-w-md truncate font-mono text-xs" title={JSON.stringify({ antes: e.before, despues: e.after })}>
                  {e.after ? JSON.stringify(e.after) : "—"}
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {pages > 1 && (
        <nav aria-label="Paginación" className="flex gap-3 text-sm">
          {page > 1 && <Link href={{ query: { page: page - 1 } }}>Anterior</Link>}
          <span>Página {page} de {pages}</span>
          {page < pages && <Link href={{ query: { page: page + 1 } }}>Siguiente</Link>}
        </nav>
      )}
    </div>
  );
}
