import { countUnreadNotifications, hasPermission, maybeRunTenantAlerts, ROLE_LABELS, type Permission } from "@rc/domain";
import { Alert, Button } from "@rc/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireTenant } from "@/server/session";
import { signOutAction } from "./actions";

const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/app", label: "Inicio" },
  { href: "/app/inventario", label: "Inventario", permission: "inventory.read" },
  { href: "/app/productos", label: "Productos", permission: "products.read" },
  { href: "/app/lotes", label: "Lotes", permission: "inventory.read" },
  { href: "/app/compras", label: "Compras", permission: "purchases.read" },
  { href: "/app/proveedores", label: "Proveedores", permission: "suppliers.read" },
  { href: "/app/reposicion", label: "Reposición", permission: "purchases.read" },
  { href: "/app/ajustes", label: "Ajustes", permission: "inventory.read" },
  { href: "/app/conteos", label: "Conteos", permission: "inventory.read" },
  { href: "/app/transferencias", label: "Transferencias", permission: "inventory.read" },
  { href: "/app/tasas", label: "Tasas", permission: "exchange_rates.read" },
  { href: "/app/configuracion/sucursales", label: "Sucursales", permission: "branches.read" },
  { href: "/app/configuracion/usuarios", label: "Usuarios", permission: "members.read" },
  { href: "/app/configuracion/empresa", label: "Empresa", permission: "tenant.settings.manage" },
  { href: "/app/auditoria", label: "Auditoría", permission: "audit.read" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, access, actor } = await requireTenant();
  // Sin worker (plan gratuito) las alertas se generan al usar la app, máx. 1 vez/hora/empresa.
  await maybeRunTenantAlerts(actor);
  const unread = hasPermission(access.role, "inventory.read") ? await countUnreadNotifications(actor) : 0;
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col">
            <Link href="/app" className="font-bold text-primary">RetailControl</Link>
            <span className="text-sm text-muted-foreground" data-testid="active-tenant">
              {access.tenantName} · {ROLE_LABELS[access.role]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {hasPermission(access.role, "inventory.read") && (
              <Link href="/app/alertas" className="relative rounded-full border px-3 py-1 hover:bg-accent" aria-label={`Alertas: ${unread} sin leer`}>
                Alertas{unread > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground" data-testid="unread-count">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            )}
            <Link href="/empresas" className="underline-offset-4 hover:underline">Cambiar empresa</Link>
            <Link href="/cuenta/seguridad" className="underline-offset-4 hover:underline">Seguridad</Link>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">Salir</Button>
            </form>
          </div>
        </div>
        <nav aria-label="Principal" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2 text-sm">
            {NAV.filter((n) => !n.permission || hasPermission(access.role, n.permission)).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-md px-3 py-2 hover:bg-accent">{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {access.accessMode === "read_only" && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <Alert variant="warning">
            La suscripción no está activa: la empresa está en modo solo lectura. Sus datos se conservan.
          </Alert>
        </div>
      )}
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-6" data-user={user.email}>
        {children}
      </main>
    </div>
  );
}
