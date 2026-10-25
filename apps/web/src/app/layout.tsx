import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RetailControl", template: "%s · RetailControl" },
  description:
    "Control de inventarios para abastos, minimarkets, ferreterías y bodegas en Venezuela: lotes, vencimientos, almacenes y reportes.",
  robots: { index: true, follow: true },
};

// La CSP usa un nonce por petición (middleware); las páginas deben renderizarse
// por petición para que Next.js aplique ese nonce a sus scripts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-VE">
      <body className="min-h-dvh antialiased">
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
