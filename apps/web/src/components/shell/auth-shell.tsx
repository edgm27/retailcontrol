import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/landing/icons";

const WIDTHS = { md: "max-w-md", lg: "max-w-lg", "3xl": "max-w-3xl" } as const;

/**
 * Marco de las páginas de acceso y cuenta: fondo azul marino del landing,
 * logo arriba y el contenido (tarjetas blancas) centrado.
 * `panel` envuelve el contenido en un panel claro (páginas con varias secciones).
 */
export function AuthShell({ children, width = "md", panel = false, center = false }: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  panel?: boolean;
  center?: boolean;
}) {
  return (
    <div className="auth-bg flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" aria-label="RetailControl, ir al inicio"><Logo /></Link>
      </header>
      <main
        id="contenido"
        className={`mx-auto flex w-full flex-1 flex-col px-4 pb-12 ${WIDTHS[width]} ${center ? "justify-center" : "pt-4"}`}
      >
        {panel ? <div className="grid gap-6 rounded-3xl bg-background p-4 shadow-2xl sm:p-6">{children}</div> : children}
      </main>
    </div>
  );
}
