import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rc/ui";
import Link from "next/link";

// Landing provisional de Fase 1. La landing comercial completa (comparador de
// planes, FAQ, sectores) se construye en Fase 4.
export default function Home() {
  return (
    <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold text-primary">RetailControl</span>
        <nav aria-label="Cuenta" className="flex gap-2">
          <Link className={buttonVariants({ variant: "outline" })} href="/login">Entrar</Link>
          <Link className={buttonVariants()} href="/login?registro=1">Crear cuenta</Link>
        </nav>
      </header>
      <section className="grid gap-4">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          Inventario claro para abastos, minimarkets y ferreterías
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Controle existencias por almacén, lotes y fechas de vencimiento, con precios de referencia en USD o
          bolívares y una bitácora de cada cambio.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Beneficios">
        {[
          ["Lotes y vencimientos", "Despacho FEFO y alertas antes de que la mercancía venza."],
          ["Varias sucursales", "Almacenes, transferencias y permisos por sucursal."],
          ["Seguridad", "Verificación en dos pasos y datos aislados por empresa."],
        ].map(([t, d]) => (
          <Card key={t}>
            <CardHeader>
              <CardTitle className="text-base">{t}</CardTitle>
              <CardDescription>{d}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Versión en desarrollo. RetailControl no emite facturas fiscales ni sustituye su sistema de facturación
          homologado.
        </CardContent>
      </Card>
    </main>
  );
}
