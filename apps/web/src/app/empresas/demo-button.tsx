"use client";

import { ActionForm, type ClientFormState } from "@/components/action-form";

export function DemoButton({ action }: { action: (s: ClientFormState<unknown>) => Promise<ClientFormState<unknown>> }) {
  return (
    <ActionForm action={action} submitLabel="Crear empresa de demostración" pendingLabel="Iniciando…" variant="secondary">
      <p className="text-sm text-muted-foreground">
        Crea una empresa <strong>aparte</strong> con datos ficticios para probar todo: ~125 productos con presentaciones y códigos
        de barras, proveedores, tasas, compras y recepciones con lotes y vencimientos, 60 días de ventas, mermas,
        transferencias, conteos, órdenes pendientes y alertas. No modifica sus empresas actuales.
      </p>
    </ActionForm>
  );
}
