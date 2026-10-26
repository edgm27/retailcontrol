import { listPlatformTenants } from "@rc/domain";
import { Badge, Button, EmptyState, Input, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { requirePlatform } from "@/server/session";
import { PHASE_LABELS, PHASE_VARIANT } from "../labels";

export const metadata = { title: "Empresas" };

export default async function PlatformTenants({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { actor } = await requirePlatform();
  const rows = await listPlatformTenants(actor, { q });
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <form className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Buscar empresa</label>
          <Input id="q" name="q" defaultValue={q} placeholder="Nombre o RIF" className="w-64" />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Sin empresas" />
      ) : (
        <Table>
          <THead>
            <tr><th scope="col">Empresa</th><th scope="col">Plan</th><th scope="col">Estado</th><th scope="col">Uso</th><th scope="col">Alta</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.tenantId}>
                <td>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.rif ?? "Sin RIF"} · {r.owners.join(", ") || "sin propietario activo"}</div>
                </td>
                <td>{r.planName}</td>
                <td>
                  <Badge variant={PHASE_VARIANT[r.phase] ?? "secondary"}>{PHASE_LABELS[r.phase] ?? r.phase}</Badge>
                  {r.daysLeft !== null && ["trial", "grace", "active"].includes(r.phase) && <div className="mt-1 text-xs text-muted-foreground">{r.daysLeft} día(s)</div>}
                  {r.pendingPayments > 0 && <div className="mt-1 text-xs font-semibold text-warning">{r.pendingPayments} pago(s) por conciliar</div>}
                </td>
                <td className="text-sm tabular-nums">{r.activeUsers} usuarios · {r.branches} suc. · {r.products} prod.</td>
                <td className="whitespace-nowrap text-sm">{fmtDate(r.createdAt)}</td>
                <td className="text-right"><Link href={`/plataforma/empresas/${r.tenantId}`} className="text-sm font-medium text-primary hover:underline" aria-label={`Gestionar ${r.name}`}>Gestionar</Link></td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
