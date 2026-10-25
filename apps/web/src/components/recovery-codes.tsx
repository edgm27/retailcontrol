import { Alert } from "@rc/ui";

export function RecoveryCodesList({ codes }: { codes: string[] }) {
  return (
    <div className="grid gap-3">
      <Alert variant="warning">
        Guarde estos códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez y no volverán a
        mostrarse.
      </Alert>
      <ol className="grid grid-cols-2 gap-2 font-mono text-sm" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c} className="rounded border bg-muted px-2 py-1 text-center">{c}</li>
        ))}
      </ol>
    </div>
  );
}
