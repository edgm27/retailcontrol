import { buttonVariants } from "@rc/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <Link href="/" className={buttonVariants()}>Ir al inicio</Link>
    </main>
  );
}
