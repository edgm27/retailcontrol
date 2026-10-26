"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/plataforma", label: "Resumen" },
  { href: "/plataforma/empresas", label: "Empresas" },
  { href: "/plataforma/pagos", label: "Pagos" },
  { href: "/plataforma/planes", label: "Planes" },
  { href: "/plataforma/ajustes", label: "Ajustes" },
];

export function PlatformTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Plataforma" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = t.href === "/plataforma" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium ${active ? "bg-background text-foreground" : "text-white/75 hover:text-white"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
