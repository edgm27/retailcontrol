"use client";

import { Field, Input } from "@rc/ui";
import { ActionForm, type ClientFormState } from "@/components/action-form";
import { RecoveryCodesList } from "@/components/recovery-codes";

type Data = { recoveryCodes: string[] };

export function RegenerateCodesForm({
  action,
}: {
  action: (s: ClientFormState<Data>, fd: FormData) => Promise<ClientFormState<Data>>;
}) {
  return (
    <ActionForm<Data>
      action={action}
      submitLabel="Generar nuevos códigos"
      variant="outline"
      renderResult={(s) => (s.ok && s.data ? <RecoveryCodesList codes={s.data.recoveryCodes} /> : null)}
    >
      <Field label="Código actual de su app" htmlFor="regen-code">
        <Input id="regen-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      </Field>
    </ActionForm>
  );
}
