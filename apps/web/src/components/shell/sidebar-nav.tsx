"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NAV_ICONS, type NavIcon } from "./nav-icons";

export interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: NavIcon; badge?: number }[];
}

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="grid gap-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/55">{g.label}</p>
          <ul className="grid gap-0.5">
            {g.items.map((it) => {
              const active = isActive(pathname, it.href);
              const Icon = NAV_ICONS[it.icon];
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-brand/12 font-semibold text-brand"
                        : "text-white/80 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-brand" />}
                    <Icon className={active ? "text-brand" : "text-white/60 group-hover:text-white"} />
                    <span className="flex-1">{it.label}</span>
                    {!!it.badge && (
                      <span className="rounded-full bg-[#e34948] px-1.5 text-[0.7rem] font-bold text-white">{it.badge > 99 ? "99+" : it.badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Menú lateral fijo (escritorio). */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return <NavList groups={groups} />;
}

/** Botón + panel deslizable para móvil. */
export function MobileNav({ groups, header }: { groups: NavGroup[]; header: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Evita que la página de fondo se desplace mientras el menú está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  const Menu = NAV_ICONS.menu;
  const Close = NAV_ICONS.close;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-white hover:bg-white/10 lg:hidden"
        aria-label="Abrir menú"
        aria-expanded={open}
      >
        <Menu />
        <span className="text-sm font-semibold">Menú</span>
      </button>
      {/* El menú se monta en <body>: la barra superior usa desenfoque (backdrop-filter), que
          limitaría un elemento "fixed" a su propia altura y lo dejaría oculto. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-[#061423]/60" onClick={() => setOpen(false)} />
          <div className="sidebar-bg absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              {header}
              <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-xl text-white hover:bg-white/10" aria-label="Cerrar menú">
                <Close />
              </button>
            </div>
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
