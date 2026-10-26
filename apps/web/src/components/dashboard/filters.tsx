"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const PERIODS = [7, 30, 90] as const;

export function DashboardFilters({ days, warehouseId, warehouses }: {
  days: number;
  warehouseId: string;
  warehouses: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div role="group" aria-label="Período" className="inline-flex rounded-full bg-white/10 p-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={days === p}
            onClick={() => set("dias", String(p))}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              days === p ? "bg-brand text-brand-foreground" : "text-white/80 hover:text-white"
            }`}
          >
            {p} días
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="f-almacen">Almacén</label>
      <select
        id="f-almacen"
        value={warehouseId}
        onChange={(e) => set("almacen", e.target.value)}
        className="h-10 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white [&>option]:text-foreground"
      >
        <option value="">Todos los almacenes</option>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
      {pending && <span className="text-xs text-white/70" role="status">Actualizando…</span>}
    </div>
  );
}
