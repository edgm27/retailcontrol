"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/*
 * Gráficos del tablero en SVG/HTML propio (sin librerías ni estilos en línea
 * externos: compatible con la CSP). Reglas: marcas delgadas, un solo eje Y,
 * cuadrícula tenue, leyenda con ≥2 series, tooltip al pasar el cursor y vista de tabla.
 */

import { fmtDay, fmtDayLong, money, moneyCompact, SERIES } from "./format";


/** Marcas "redondas" para el eje Y (0 incluido). */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ---------------------------------------------------------------- Marco */

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string; dashed?: boolean }[];
  table?: { head: string[]; rows: (string | number)[][]; alignRight?: number[] };
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-t`}
      className={`flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(6,20,35,.04),0_4px_16px_rgba(6,20,35,.04)] sm:p-5 ${className}`}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="text-[0.95rem] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-pressed={showTable}
            >
              {showTable ? "Ver gráfico" : "Ver datos"}
            </button>
          )}
        </div>
      </header>
      {legend && legend.length > 1 && !showTable && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden>
                <line x1="1" y1="4" x2="15" y2="4" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={l.dashed ? "3 3" : undefined} />
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="min-w-0 flex-1">
        {showTable && table ? (
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>{table.head.map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${table.alignRight?.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${table.alignRight?.includes(j) ? "text-right tabular-nums" : ""}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Se coloca a la derecha del cursor; si no cabe, a la izquierda.
  const flip = x > width - 190;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-white/10 bg-navy px-3 py-2 text-xs text-white shadow-xl"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y) }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ Líneas */

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  area?: boolean;
}

export function LineChart({
  dates,
  series,
  currency,
  height = 240,
  emptyText = "Sin movimientos en el período.",
}: {
  dates: string[];
  series: LineSeries[];
  currency: string;
  height?: number;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const allZero = series.every((s) => s.values.every((v) => v === 0));
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const m = { l: 56, r: 12, t: 8, b: 26 };
  const w = Math.max(0, width - m.l - m.r);
  const h = height - m.t - m.b;
  const n = dates.length;
  const x = (i: number) => m.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => m.t + h - (v / top) * h;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 72))));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Gráfico de líneas: ${series.map((s) => s.label).join(", ")}`}>
          <defs>
            {series.filter((s) => s.area).map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity=".22" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke={SERIES.grid} strokeWidth="1" />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {moneyCompact(t, currency)}
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              (i === n - 1 && i % labelEvery !== 0 && (n - 1) % labelEvery < labelEvery / 2) ? null : (
                <text key={d} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                  {fmtDay(d)}
                </text>
              )
            ) : null,
          )}
          {!allZero &&
            series.map((s) => {
              const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
              return (
                <g key={s.key}>
                  {s.area && <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill={`url(#${gid}-${s.key})`} />}
                  <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
          {!allZero && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + h} stroke="var(--color-muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r="4.5" fill={s.color} stroke="var(--color-card)" strokeWidth="2" />
              ))}
            </g>
          )}
          <rect
            x={m.l}
            y={m.t}
            width={w}
            height={h}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
          {allZero && (
            <text x={m.l + w / 2} y={m.t + h / 2} textAnchor="middle" className="fill-muted-foreground text-xs">{emptyText}</text>
          )}
        </svg>
      )}
      {!allZero && hover !== null && (
        <Tooltip x={x(hover)} y={m.t} width={width}>
          <p className="mb-1 font-semibold capitalize">{fmtDayLong(dates[hover]!)}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">{money(s.values[hover]!, currency)}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Barras horizontales */

export function BarList({
  items,
  currency,
  color = SERIES.s1,
  emptyText = "Sin datos.",
}: {
  items: { label: string; sub?: string; value: number }[];
  currency: string;
  color?: string;
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <ul className="grid gap-2.5">
      {items.map((it, i) => (
        <li
          key={`${it.label}-${i}`}
          className={`relative rounded-lg px-1.5 py-1 transition ${hover === i ? "bg-accent/70" : ""}`}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {it.sub && <span className="mr-1.5 font-mono text-[0.7rem] text-muted-foreground">{it.sub}</span>}
              {it.label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{moneyCompact(it.value, currency)}</span>
          </div>
          <div className="h-2.5 w-full rounded-r-[4px] bg-muted">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%`, background: color }} />
          </div>
          {hover === i && (
            <div role="presentation" className="pointer-events-none absolute right-1 top-full z-10 mt-1 rounded-xl bg-navy px-3 py-2 text-xs text-white shadow-xl">
              <p className="font-semibold">{it.label}</p>
              <p className="tabular-nums">{money(it.value, currency)} · {total ? ((it.value / total) * 100).toFixed(1).replace(".", ",") : 0}% del total</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------- Columnas */

export function ColumnChart({
  items,
  currency,
  height = 220,
}: {
  items: { key: string; label: string; lots: number; value: number; critical?: boolean }[];
  currency: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...items.map((i) => i.value));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1]!;
  const m = { l: 48, r: 4, t: 18, b: 24 };
  const w = Math.max(0, width - m.l - m.r);
  const h = height - m.t - m.b;
  const slot = items.length ? w / items.length : 0;
  const bw = Math.min(24, slot * 0.6);
  const y = (v: number) => m.t + h - (v / top) * h;
  const r = 4;
  const empty = max === 0;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Gráfico de columnas: valor de lotes por rango de vencimiento">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} stroke={SERIES.grid} strokeWidth="1" />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{moneyCompact(t, currency)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const cx = m.l + slot * i + slot / 2;
            const x0 = cx - bw / 2;
            const y0 = y(it.value);
            const bh = m.t + h - y0;
            const color = it.critical ? SERIES.critical : SERIES.s1;
            const rr = Math.min(r, bh);
            return (
              <g key={it.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                {bh > 0.5 && (
                  <path
                    d={`M${x0},${m.t + h} V${y0 + rr} Q${x0},${y0} ${x0 + rr},${y0} H${x0 + bw - rr} Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr} V${m.t + h} Z`}
                    fill={color}
                  />
                )}
                {it.lots > 0 && (
                  <text x={cx} y={y0 - 5} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">{it.lots}</text>
                )}
                <text x={cx} y={height - 6} textAnchor="middle" className={`text-[10px] ${it.critical ? "fill-foreground font-semibold" : "fill-muted-foreground"}`}>{it.label}</text>
                <rect
                  x={m.l + slot * i}
                  y={m.t}
                  width={slot}
                  height={h}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
          {empty && <text x={m.l + w / 2} y={m.t + h / 2} textAnchor="middle" className="fill-muted-foreground text-xs">Sin lotes con vencimiento en los próximos 90 días.</text>}
        </svg>
      )}
      {hover !== null && !empty && (
        <Tooltip x={m.l + slot * hover + slot / 2} y={m.t} width={width}>
          <p className="mb-1 font-semibold">{items[hover]!.critical ? "Lotes vencidos" : `Vencen en ${items[hover]!.label}${items[hover]!.label.includes("días") ? "" : " días"}`}</p>
          <p className="flex justify-between gap-4"><span className="text-white/80">Lotes</span><span className="font-semibold tabular-nums">{items[hover]!.lots}</span></p>
          <p className="flex justify-between gap-4"><span className="text-white/80">Valor a costo</span><span className="font-semibold tabular-nums">{money(items[hover]!.value, currency)}</span></p>
        </Tooltip>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Sparkline */

export function Sparkline({ values, color = SERIES.s1, label }: { values: number[]; color?: string; label: string }) {
  const W = 120;
  const H = 32;
  if (values.length < 2 || values.every((v) => v === values[0])) {
    return <svg width={W} height={H} aria-hidden><line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke={SERIES.grid} strokeWidth="2" strokeLinecap="round" /></svg>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i * (W - 4)) / (values.length - 1) + 2},${H - 3 - ((v - min) / (max - min || 1)) * (H - 8)}`);
  const last = pts[pts.length - 1]!.split(",");
  return (
    <svg width={W} height={H} role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="var(--color-card)" strokeWidth="1.5" />
    </svg>
  );
}
