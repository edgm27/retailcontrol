"use client";

import { Button } from "@rc/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-sm text-muted-foreground">
        Intente de nuevo. Si el problema continúa, comparta este código con soporte: {error.digest ?? "—"}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
