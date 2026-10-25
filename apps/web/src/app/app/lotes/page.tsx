import { hasPermission, listExpiringLots } from "@rc/domain";
import { Badge, EmptyState, Input, Select, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate, fmtMoney, fmtNumber, LOT_STATUS_LABELS } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { setLotStatusAction } from "../inventario/actions";

export const metadata = { title: "Lotes por vencer" };
const HORIZONS = [7, 15, 30, 60, 90];

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const days = HORIZONS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const { actor, access } = await requireTenant("inventory.read");
  const lots = await listExpiringLots(actor, { days });
  const total = lots.reduce((a, l) => a + Number(l.value), 0);
  const canChange = hasPermission(access.role, "inventory.adjust") && access.accessMode === "full";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Lotes por vencer</h1>
        <p className="text-sm text-muted-foreground">{lots.length} lote(s) · valor {fmtMoney(total)}</p>
      </div>
      <nav aria-label="Horizonte" className="flex flex-wrap gap-2">
        {HORIZONS.map((d) => (
          <Link key={d} href={{ query: { dias: d } }} aria-current={d === days} className={`rounded-full border px-4 py-1.5 text-sm ${d === days ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            {d} días
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">Incluye lotes ya vencidos con existencia. Los vencidos, en cuarentena, dañados o retirados no se despachan.</p>
      {lots.length === 0 ? (
        <EmptyState title="Nada por vencer en este horizonte" />
      ) : (
        <Table>
          <THead><tr><th scope="col">Vence</th><th scope="col">Producto</th><th scope="col">Lote</th><th scope="col">Almacén</th><th scope="col" className="text-right">Cantidad</th><th scope="col" className="text-right">Valor</th><th scope="col">Estado</th>{canChange && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></THead>
          <TBody>
            {lots.map((l) => (
              <tr key={`${l.lotId}-${l.warehouseId}`}>
                <td className="whitespace-nowrap">
                  {fmtDate(l.expiresAt)}{" "}
                  <Badge variant={l.expired ? "destructive" : l.daysLeft <= 7 ? "warning" : "secondary"}>
                    {l.expired ? `Vencido hace ${-l.daysLeft} d` : l.daysLeft === 0 ? "Vence hoy" : `${l.daysLeft} d`}
                  </Badge>
                </td>
                <td><Link href={`/app/productos/${l.productId}`} className="hover:underline">{l.name}</Link> <span className="font-mono text-xs text-muted-foreground">{l.sku}</span></td>
                <td className="font-mono text-xs">{l.lotNumber}</td>
                <td>{l.warehouse}</td>
                <td className="text-right tabular-nums">{fmtNumber(l.onHand)} {l.baseUnit}</td>
                <td className="text-right tabular-nums">{fmtMoney(l.value)}</td>
                <td>{LOT_STATUS_LABELS[l.status]}</td>
                {canChange && (
                  <td>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">Cambiar estado</summary>
                      <ActionForm action={setLotStatusAction} submitLabel="Guardar" className="mt-2 w-56">
                        <input type="hidden" name="lotId" value={l.lotId} />
                        <Select name="status" defaultValue={l.status === "AVAILABLE" ? "QUARANTINE" : "AVAILABLE"} aria-label="Nuevo estado">
                          {["AVAILABLE", "QUARANTINE", "DAMAGED", "RECALLED"].map((s) => <option key={s} value={s}>{LOT_STATUS_LABELS[s]}</option>)}
                        </Select>
                        <Input name="reason" required minLength={5} placeholder="Motivo" aria-label="Motivo" />
                      </ActionForm>
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
