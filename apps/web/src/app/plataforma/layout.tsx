import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/landing/icons";
import { requirePlatform } from "@/server/session";
import { PlatformTabs } from "./tabs";

export const metadata = { title: { default: "Plataforma", template: "%s · Plataforma · RetailControl" } };

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const { user } = await requirePlatform();
  return (
    <div className="min-h-dvh">
      <header className="hero-band text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/plataforma" aria-label="Panel de plataforma"><Logo compact /></Link>
            <span className="rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
              Plataforma · {user.platformRole === "SUPERADMIN" ? "Superadministrador" : "Soporte"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-white/70 sm:inline">{user.email}</span>
            <Link href="/app" className="rounded-full border border-white/20 px-4 py-2 font-medium hover:bg-white/10">Volver a la app</Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 lg:px-8"><PlatformTabs /></div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
