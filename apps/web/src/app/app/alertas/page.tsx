import { listNotifications, runTenantAlerts } from "@rc/domain";
import { Badge, EmptyState } from "@rc/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { markAlertsReadAction } from "../compras/actions";

export const metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const { actor } = await requireTenant("inventory.read");
  // Al abrir esta página se recalculan las alertas (idempotente: no duplica avisos).
  await runTenantAlerts(actor.tenantId).catch(() => undefined);
  const items = await listNotifications(actor);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Alertas</h1>
        {unread > 0 && <ActionForm action={markAlertsReadAction} submitLabel={`Marcar ${unread} como leídas`} variant="outline" />}
      </div>
      <p className="text-sm text-muted-foreground">Vencimientos según los días configurados en Empresa, y stock bajo (una vez al día por producto).</p>
      {items.length === 0 ? <EmptyState title="Sin alertas" /> : (
        <ul className="grid gap-2" data-testid="alerts">
          {items.map((n) => (
            <li key={n.id} className={`rounded-lg border p-4 ${n.readAt ? "opacity-70" : "border-primary/40 bg-primary/5"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{n.title}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(n.createdAt, true)} {!n.readAt && <Badge>Nueva</Badge>}</span>
              </div>
              <p className="mt-1 text-sm">{n.body}</p>
              {n.link && <Link href={n.link} className="mt-1 inline-block text-sm text-primary hover:underline">Ver</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
