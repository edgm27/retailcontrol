import { countUnreadNotifications, getSubscriptionBanner, hasPermission, maybeRunTenantAlerts, ROLE_LABELS, type Permission } from "@rc/domain";
import { Alert } from "@rc/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/landing/icons";
import { NAV_ICONS, type NavIcon } from "@/components/shell/nav-icons";
import { MobileNav, SidebarNav, type NavGroup } from "@/components/shell/sidebar-nav";
import { requireTenant } from "@/server/session";
import { signOutAction } from "./actions";

type Item = { href: string; label: string; icon: NavIcon; permission?: Permission; alerts?: true };

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "General",
    items: [
      { href: "/app", label: "Inicio", icon: "home" },
      { href: "/app/alertas", label: "Alertas", icon: "bell", permission: "inventory.read", alerts: true },
      { href: "/app/reportes", label: "Reportes", icon: "chart", permission: "reports.read" },
    ],
  },
  {
    label: "Inventario",
    items: [
      { href: "/app/inventario", label: "Inventario", icon: "box", permission: "inventory.read" },
      { href: "/app/productos", label: "Productos", icon: "tag", permission: "products.read" },
      { href: "/app/lotes", label: "Lotes", icon: "calendar", permission: "inventory.read" },
      { href: "/app/ajustes", label: "Ajustes", icon: "sliders", permission: "inventory.read" },
      { href: "/app/conteos", label: "Conteos", icon: "clipboard", permission: "inventory.read" },
      { href: "/app/transferencias", label: "Transferencias", icon: "transfer", permission: "inventory.read" },
    ],
  },
  {
    label: "Compras",
    items: [
      { href: "/app/compras", label: "Compras", icon: "cart", permission: "purchases.read" },
      { href: "/app/recepciones", label: "Recepciones", icon: "truck", permission: "purchases.read" },
      { href: "/app/proveedores", label: "Proveedores", icon: "users", permission: "suppliers.read" },
      { href: "/app/reposicion", label: "Reposición", icon: "refresh", permission: "purchases.read" },
      { href: "/app/tasas", label: "Tasas", icon: "rate", permission: "exchange_rates.read" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/app/configuracion/sucursales", label: "Sucursales", icon: "branch", permission: "branches.read" },
      { href: "/app/configuracion/usuarios", label: "Usuarios", icon: "users", permission: "members.read" },
      { href: "/app/configuracion/empresa", label: "Empresa", icon: "building", permission: "tenant.settings.manage" },
      { href: "/app/configuracion/suscripcion", label: "Suscripción", icon: "card", permission: "billing.read" },
      { href: "/app/auditoria", label: "Auditoría", icon: "log", permission: "audit.read" },
    ],
  },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "RC";
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, access, actor } = await requireTenant();
  // Sin worker (plan gratuito) las alertas se generan al usar la app, máx. 1 vez/hora/empresa.
  await maybeRunTenantAlerts(actor);
  const canInventory = hasPermission(access.role, "inventory.read");
  const unread = canInventory ? await countUnreadNotifications(actor) : 0;

  const canBilling = hasPermission(access.role, "billing.read");
  const banner = canBilling ? await getSubscriptionBanner(actor) : null;

  const groups: NavGroup[] = NAV.map((g) => ({
    label: g.label,
    items: g.items
      .filter((i) => !i.permission || hasPermission(access.role, i.permission))
      .map((i) => ({ href: i.href, label: i.label, icon: i.icon, badge: i.alerts ? unread : undefined })),
  })).filter((g) => g.items.length > 0);
  if (user.platformRole !== "NONE") {
    groups.push({ label: "Plataforma", items: [{ href: "/plataforma", label: "Panel de plataforma", icon: "shield" }] });
  }

  const tenantCard = (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brand-foreground">
        {initials(access.tenantName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{access.tenantName}</span>
        <span className="block text-xs text-white/70">{ROLE_LABELS[access.role]}</span>
      </span>
    </div>
  );
  const Bell = NAV_ICONS.bell;
  const Switch = NAV_ICONS.switch;
  const Shield = NAV_ICONS.shield;
  const Logout = NAV_ICONS.logout;

  return (
    <div className="app-shell min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sidebar-bg hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto lg:px-4 lg:py-5">
        <Link href="/app" aria-label="RetailControl, inicio" className="px-2">
          <Logo compact />
        </Link>
        {tenantCard}
        <SidebarNav groups={groups} />
        <p className="mt-auto px-3 text-[0.7rem] text-white/45">RetailControl · Rumbo Digital</p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="rounded-xl bg-navy p-0.5">
                <MobileNav
                  groups={groups}
                  header={<div className="grid gap-4"><Logo compact />{tenantCard}</div>}
                />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" data-testid="active-tenant">
                <span className="font-semibold text-foreground">{access.tenantName}</span>
                <span className="text-muted-foreground"> · {ROLE_LABELS[access.role]}</span>
              </p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{user.email}</p>
            </div>
            <nav aria-label="Cuenta" className="flex items-center gap-1 text-sm">
              {canInventory && (
                <Link
                  href="/app/alertas"
                  className="relative inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent"
                  aria-label={`Alertas: ${unread} sin leer`}
                  title="Alertas"
                >
                  <Bell />
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[#e34948] px-1 text-center text-[0.7rem] font-bold leading-5 text-white" data-testid="unread-count">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              )}
              <Link href="/empresas" className="inline-flex h-10 items-center gap-2 rounded-full px-3 hover:bg-accent" title="Cambiar empresa">
                <Switch /><span className="hidden md:inline">Cambiar empresa</span>
              </Link>
              <Link href="/cuenta/seguridad" className="inline-flex h-10 items-center gap-2 rounded-full px-3 hover:bg-accent" title="Seguridad">
                <Shield /><span className="hidden md:inline">Seguridad</span>
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 font-medium text-white hover:bg-navy-3" aria-label="Salir">
                  <Logout className="text-brand" /><span className="hidden sm:inline">Salir</span>
                </button>
              </form>
            </nav>
          </div>
        </header>
        {access.accessMode === "read_only" ? (
          <div className="px-4 pt-4 lg:px-8">
            <Alert variant="warning">
              La suscripción no está activa: la empresa está en modo solo lectura. Sus datos se conservan.
              {canBilling && <> <Link href="/app/configuracion/suscripcion" className="font-semibold underline">Registrar un pago</Link> para reactivarla.</>}
            </Alert>
          </div>
        ) : banner && (banner.phase === "grace" || (banner.phase === "trial" && banner.daysLeft !== null && banner.daysLeft <= 7)) ? (
          <div className="px-4 pt-4 lg:px-8">
            <Alert variant={banner.phase === "grace" ? "warning" : "info"} data-testid="subscription-banner">
              {banner.phase === "trial"
                ? `Prueba gratis del plan ${banner.planName}: ${banner.daysLeft === 0 ? "vence hoy" : `quedan ${banner.daysLeft} día(s)`}.`
                : `El período pagado venció: quedan ${banner.daysLeft} día(s) de gracia.`}{" "}
              <Link href="/app/configuracion/suscripcion" className="font-semibold underline">Ver planes y pagar</Link>
            </Alert>
          </div>
        ) : null}
        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8" data-user={user.email}>
          {children}
        </main>
      </div>
    </div>
  );
}
