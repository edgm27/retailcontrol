"use client";

import { Field, Input, Select } from "@rc/ui";
import { ActionForm, type ClientFormState } from "@/components/action-form";

type Data = { link: string };

export function InviteForm({
  action,
  roles,
}: {
  action: (s: ClientFormState<Data>, fd: FormData) => Promise<ClientFormState<Data>>;
  roles: { value: string; label: string }[];
}) {
  return (
    <ActionForm<Data>
      action={action}
      submitLabel="Invitar"
      renderResult={(s) =>
        s.ok && s.data ? (
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs" data-testid="invite-link">{s.data.link}</code>
        ) : null
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo" htmlFor="inv-email">
          <Input id="inv-email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Rol" htmlFor="inv-role">
          <Select id="inv-role" name="role" defaultValue="READONLY">
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}
