"use client";

import { Alert, Button, Field, Input, Select } from "@rc/ui";
import { useState } from "react";
import { ActionForm, type ClientFormState } from "@/components/action-form";
import type { Credentials } from "./actions";

type Act<T> = (s: ClientFormState<T>, fd: FormData) => Promise<ClientFormState<T>>;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Clave temporal aleatoria (generada en el navegador), p. ej. "Kp7w-Rt3m-Xq9z". */
function generatePassword(): string {
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

export function TempPasswordField({ id = "tempPassword" }: { id?: string }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <Field label="Clave temporal" htmlFor={id} hint="Mínimo 12 caracteres. El usuario deberá cambiarla en su próximo ingreso.">
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          name="tempPassword"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={12}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 font-mono"
        />
        <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => { setValue(generatePassword()); setVisible(true); }}>
          Generar
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          {visible ? "Ocultar" : "Mostrar"}
        </Button>
      </div>
    </Field>
  );
}

function CredentialsCard({ data }: { data: Credentials }) {
  const [copied, setCopied] = useState(false);
  const text = data.password ? `Usuario: ${data.email}\nClave temporal: ${data.password}` : `Usuario: ${data.email}`;
  return (
    <div className="grid gap-2 rounded-xl border border-brand-strong/40 bg-accent/60 p-4 text-sm" data-testid="user-credentials">
      <p><span className="text-muted-foreground">Usuario:</span> <strong>{data.email}</strong></p>
      {data.password && (
        <p><span className="text-muted-foreground">Clave temporal:</span> <code className="select-all rounded bg-card px-1.5 py-0.5 font-mono">{data.password}</code></p>
      )}
      <p className="text-xs text-muted-foreground">{data.note} Esta clave no se volverá a mostrar.</p>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)}
        >
          {copied ? "Copiado" : "Copiar datos de acceso"}
        </Button>
      </div>
    </div>
  );
}

export function NewUserForm({ action, roles }: { action: Act<Credentials>; roles: { value: string; label: string }[] }) {
  return (
    <ActionForm<Credentials>
      action={action}
      submitLabel="Crear usuario"
      pendingLabel="Creando…"
      renderResult={(s) => (s.ok && s.data ? <CredentialsCard data={s.data} /> : null)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo electrónico" htmlFor="nu-email" hint="Será su usuario para entrar.">
          <Input id="nu-email" name="email" type="email" inputMode="email" autoComplete="off" required />
        </Field>
        <Field label="Nombre y apellido" htmlFor="nu-name">
          <Input id="nu-name" name="name" autoComplete="off" maxLength={120} />
        </Field>
        <Field label="Rol" htmlFor="nu-role">
          <Select id="nu-role" name="role" defaultValue="READONLY">
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <TempPasswordField id="nu-pass" />
      </div>
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="checkbox" name="mfaRequired" className="mt-0.5 size-4 accent-[var(--color-primary)]" />
        <span>
          <span className="font-medium">Activar verificación en dos pasos (Google Authenticator)</span>
          <span className="block text-muted-foreground">
            En su primer ingreso, después de cambiar la clave, vinculará la app escaneando un código QR o tocando un enlace desde el teléfono.
          </span>
        </span>
      </label>
    </ActionForm>
  );
}

export function ResetPasswordForm({ action, membershipId, email }: { action: Act<Credentials>; membershipId: string; email: string }) {
  return (
    <ActionForm<Credentials>
      action={action}
      submitLabel="Asignar clave temporal"
      variant="outline"
      renderResult={(s) => (s.ok && s.data ? <CredentialsCard data={s.data} /> : null)}
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="email" value={email} />
      <TempPasswordField id="rp-pass" />
    </ActionForm>
  );
}

export function RemoveUserForm({ action, membershipId, managed }: { action: Act<unknown>; membershipId: string; managed: boolean }) {
  return (
    <ActionForm action={action} submitLabel="Eliminar usuario" variant="destructive">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Alert variant="warning">
        {managed
          ? "Se quitará de la empresa y su cuenta quedará deshabilitada (sin clave). Su historial de movimientos y auditoría se conserva."
          : "Se quitará de la empresa. Su cuenta personal sigue existiendo para otras empresas. Su historial se conserva."}
      </Alert>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" className="size-4" required /> Confirmo que deseo eliminar este usuario
      </label>
    </ActionForm>
  );
}
