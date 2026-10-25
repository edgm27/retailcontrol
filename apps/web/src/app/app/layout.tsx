import { hasPermission, ROLE_LABELS, type Permission } from "@rc/domain";
import { Alert, Button } from "@rc/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireTenant } from "@/server/session";
import { signOutAction } from "./actions";

const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/app", label: "Inicio" },
  { href: "/app/productos", label: "Productos", permission: "products.read" },
  { href: "/app/configuracion/sucursales", label: "Sucursales", permission: "branches.read" },
  { href: "/app/configuracion/usuarios", label: "Usuarios", permission: "members.read" },
  { href: "/app/auditoria", label: "Auditoría", permission: "audit.read" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, access } = await requireTenant();
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
