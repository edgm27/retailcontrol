import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkline } from "./charts";

type Tone = "default" | "warning" | "critical" | "good";

/** Variación vs. período anterior. `upIsGood=false` para mermas. */
function Delta({ current, previous, upIsGood = true }: { current: number; previous: number; upIsGood?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">Sin cambios</span>;
  if (previous === 0) return <span className="text-xs text-muted-foreground">Nuevo en el período</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const up = pct >= 0;
  const good = up === upIsGood;
  const text = `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1).replace(".", ",")}%`;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`rounded-full px-1.5 py-0.5 font-semibold ${good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{text}</span>
      <span className="text-muted-foreground">vs. período anterior</span>
    </span>
  );
}

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  warning: "text-warning",
  critical: "text-destructive",
  good: "text-success",
};

export function StatTile({
  label,
  value,
  sub,
  href,
  tone = "default",
  delta,
  spark,
  sparkColor,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  tone?: Tone;
  delta?: { current: number; previous: number; upIsGood?: boolean };
  spark?: number[];
  sparkColor?: string;
  icon?: ReactNode;
}) {
  const body = (
    <div className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(6,20,35,.04),0_4px_16px_rgba(6,20,35,.04)] transition group-hover:border-brand-strong group-hover:shadow-[0_6px_24px_rgba(11,111,127,.12)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.8rem] font-medium text-muted-foreground">{label}</span>
        {icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{icon}</span>}
      </div>
      <span className={`text-2xl font-bold tracking-tight tabular-nums ${TONE[tone]}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
        {delta ? <Delta {...delta} /> : <span />}
        {spark && <Sparkline values={spark} color={sparkColor} label={`Tendencia de ${label.toLowerCase()}`} />}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="group block h-full rounded-2xl">{body}</Link>
  ) : (
    <div className="group h-full">{body}</div>
  );
}
