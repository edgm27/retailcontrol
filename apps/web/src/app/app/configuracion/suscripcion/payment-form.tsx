"use client";

import { Field, Input, Select } from "@rc/ui";
import { useState } from "react";
import { ActionForm, type ClientFormState } from "@/components/action-form";

type Plan = { code: string; name: string; price: number };

export function PaymentForm({
  action,
  plans,
  defaultPlan,
  today,
}: {
  action: (s: ClientFormState<unknown>, fd: FormData) => Promise<ClientFormState<unknown>>;
  plans: Plan[];
  defaultPlan: string;
  today: string;
}) {
  const [plan, setPlan] = useState(defaultPlan);
  const [months, setMonths] = useState(1);
  const price = plans.find((p) => p.code === plan)?.price ?? 0;
  const expected = (price * months).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <ActionForm action={action} submitLabel="Registrar pago" pendingLabel="Registrando…" idempotent>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="pay-plan">
          <Select id="pay-plan" name="planCode" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — USD {p.price.toLocaleString("es-VE", { minimumFractionDigits: 2 })}/mes</option>)}
          </Select>
        </Field>
        <Field label="Meses que paga" htmlFor="pay-months">
          <Select id="pay-months" name="periodMonths" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? "mes" : "meses"}</option>)}
          </Select>
        </Field>
      </div>
      <p className="rounded-xl bg-accent/70 px-4 py-3 text-sm" data-testid="expected-amount">
        Monto a pagar: <strong className="tabular-nums">USD {expected}</strong>
        <span className="text-muted-foreground"> (o su equivalente en bolívares a la tasa del día del pago)</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medio de pago" htmlFor="pay-method">
          <Select id="pay-method" name="method" defaultValue="PAGO_MOVIL">
            <option value="PAGO_MOVIL">Pago móvil</option>
            <option value="TRANSFER">Transferencia bancaria</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="Número de referencia" htmlFor="pay-ref" hint="Tal como aparece en el comprobante del banco.">
          <Input id="pay-ref" name="reference" required minLength={4} maxLength={60} autoComplete="off" />
        </Field>
        <Field label="Monto pagado" htmlFor="pay-amount" hint="Use coma para decimales, p. ej. 1.450,50">
          <Input id="pay-amount" name="amount" required inputMode="decimal" autoComplete="off" />
        </Field>
        <Field label="Moneda" htmlFor="pay-cur">
          <Select id="pay-cur" name="currency" defaultValue="VES">
            <option value="VES">Bolívares (Bs.)</option>
            <option value="USD">Dólares (USD)</option>
          </Select>
        </Field>
        <Field label="Fecha del pago" htmlFor="pay-date">
          <Input id="pay-date" name="paidOn" type="date" required max={today} defaultValue={today} />
        </Field>
        <Field label="Titular que pagó (opcional)" htmlFor="pay-payer">
          <Input id="pay-payer" name="payerName" maxLength={120} autoComplete="off" />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor="pay-notes">
        <Input id="pay-notes" name="notes" maxLength={500} autoComplete="off" />
      </Field>
    </ActionForm>
  );
}
