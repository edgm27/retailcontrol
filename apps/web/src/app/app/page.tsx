import { getDashboardAnalytics, hasPermission, listWarehouses } from "@rc/domain";
import { Alert, EmptyState, Table, TBody, THead } from "@rc/ui";
import Link from "next/link";
import { BarList, ChartCard, ColumnChart, LineChart } from "@/components/dashboard/charts";
import { money, moneyCompact, SERIES } from "@/components/dashboard/format";
import { DashboardFilters } from "@/components/dashboard/filters";
import { StatTile } from "@/components/dashboard/stat-tile";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import { fmtDate, fmtNumber, MOVEMENT_LABELS } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Inicio" };

const PERIODS = [7, 30, 90];
const longDate = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dias?: string; almacen?: string }>;
}) {
  const sp = await searchParams;
  const { actor, access, user } = await requireTenant();
  const canInventory = hasPermission(access.role, "inventory.read");
  const canPurchases = hasPermission(access.role, "purchases.read");
  const firstName = (user.name ?? user.email).split(/[\s@]/)[0];

  if (!canInventory) {
    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-bold">Inicio</h1>
        {sp.error === "permiso" && <Alert variant="error">No tiene permiso para acceder a esa sección.</Alert>}
        <EmptyState title={`Hola, ${firstName}`} description="Use el menú para acceder a las secciones disponibles para su rol." />
      </div>
    );
  }

  const days = PERIODS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const warehouses = await listWarehouses(actor);
  const warehouseId = warehouses.some((w) => w.id === sp.almacen) ? sp.almacen! : "";
  const d = await getDashboardAnalytics(actor, { days, warehouseId: warehouseId || undefined });
  const k = d.kpis;
  const cur = d.currency;
  const dates = d.daily.map((x) => x.date);
  const Icon = NAV_ICONS;
  const whName = warehouses.find((w) => w.id === warehouseId)?.name;

  const pending = [
    { label: "Ajustes por aprobar", value: k.pendingAdjustments, href: "/app/ajustes", show: true },
    { label: "Órdenes de compra abiertas", value: k.openPurchaseOrders, href: "/app/compras", show: canPurchases },
    { label: "Lotes vencidos con existencia", value: d.expiryBuckets.find((b) => b.key === "expired")?.lots ?? 0, href: "/app/lotes?dias=7", show: true },
    { label: "Reponer (stock bajo)", value: k.lowStock, href: canPurchases ? "/app/reposicion" : "/app/inventario?bajo=1", show: true },
  ].filter((p) => p.show);

  return (
    <div className="grid gap-6">
      {sp.error === "permiso" && <Alert variant="error">No tiene permiso para acceder a esa sección.</Alert>}

      {/* Encabezado + filtros (una sola fila, arriba de todos los gráficos) */}
      <section className="hero-band relative overflow-hidden rounded-3xl px-5 py-6 text-white sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-white/70 first-letter:uppercase">{longDate.format(new Date(`${d.today}T12:00:00Z`))}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Panel de <span className="text-brand">control</span>
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Hola, {firstName}. Indicadores de los últimos {days} días{whName ? ` · ${whName}` : ""}, a costo en {cur === "VES" ? "bolívares" : "dólares"}.
            </p>
          </div>
          <DashboardFilters days={days} warehouseId={warehouseId} warehouses={warehouses.map((w) => ({ id: w.id, label: `${w.name} · ${w.branch.name}` }))} />
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Inventario valorizado"
          value={money(k.inventoryValue, cur)}
          sub={`${fmtNumber(k.productsWithStock)} de ${fmtNumber(k.activeProducts)} productos con existencia`}
          href="/app/inventario"
          spark={d.daily.map((x) => x.inventory)}
          icon={<Icon.box />}
        />
        <StatTile
          label="Salidas a costo"
          value={money(k.outbound.value, cur)}
          delta={{ current: k.outbound.value, previous: k.outbound.previous }}
          spark={d.daily.map((x) => x.outbound)}
          sparkColor={SERIES.s2}
          icon={<Icon.cart />}
        />
        <StatTile
          label="Entradas a costo"
          value={money(k.inbound.value, cur)}
          delta={{ current: k.inbound.value, previous: k.inbound.previous }}
          spark={d.daily.map((x) => x.inbound)}
          icon={<Icon.truck />}
        />
        {canPurchases ? (
          <StatTile
            label="Compras recibidas"
            value={money(k.purchases.value, cur)}
            sub={`${k.purchases.receipts} recepción(es) en el período`}
            delta={{ current: k.purchases.value, previous: k.purchases.previous }}
            href="/app/recepciones"
            icon={<Icon.clipboard />}
          />
        ) : (
          <StatTile label="Ajustes por aprobar" value={k.pendingAdjustments} href="/app/ajustes" tone={k.pendingAdjustments ? "warning" : "default"} icon={<Icon.sliders />} />
        )}
        <StatTile
          label="Productos con stock bajo"
          value={k.lowStock}
          sub="Por debajo del mínimo definido"
          href="/app/inventario?bajo=1"
          tone={k.lowStock ? "warning" : "good"}
          icon={<Icon.bell />}
        />
        <StatTile
          label="Lotes por vencer (30 días)"
          value={k.expiringLots}
          sub={`${money(k.expiringValue, cur)} en riesgo${k.expiredValue ? ` · ${money(k.expiredValue, cur)} ya vencido` : ""}`}
          href="/app/lotes?dias=30"
          tone={k.expiredValue ? "critical" : k.expiringLots ? "warning" : "default"}
          icon={<Icon.calendar />}
        />
        <StatTile
          label="Mermas"
          value={money(k.waste.value, cur)}
          delta={{ current: k.waste.value, previous: k.waste.previous, upIsGood: false }}
          sub={k.outbound.value ? `${((k.waste.value / k.outbound.value) * 100).toFixed(1).replace(".", ",")}% de las salidas` : undefined}
          icon={<Icon.sliders />}
        />
        <StatTile
          label="Cobertura de inventario"
          value={k.coverageDays === null ? "—" : `${fmtNumber(k.coverageDays, 1)} días`}
          sub={k.turnover === null ? "Sin salidas en el período" : `Rotación del período: ${fmtNumber(k.turnover, 2)} veces`}
          icon={<Icon.rate />}
        />
      </div>

      {/* Tendencia + vencimientos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Entradas vs. salidas"
          subtitle={`Valor diario a costo · últimos ${days} días`}
          legend={[{ label: "Entradas", color: SERIES.s1 }, { label: "Salidas", color: SERIES.s2 }]}
          table={{
            head: ["Fecha", "Entradas", "Salidas"],
            rows: d.daily.map((x) => [fmtDate(x.date), money(x.inbound, cur), money(x.outbound, cur)]),
            alignRight: [1, 2],
          }}
        >
          <LineChart
            dates={dates}
            currency={cur}
            series={[
              { key: "in", label: "Entradas", color: SERIES.s1, values: d.daily.map((x) => x.inbound) },
              { key: "out", label: "Salidas", color: SERIES.s2, values: d.daily.map((x) => x.outbound) },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Vencimientos"
          subtitle="Valor a costo por días para vencer · el número indica lotes"
          table={{
            head: ["Rango", "Lotes", "Valor"],
            rows: d.expiryBuckets.map((b) => [b.key === "expired" ? b.label : `${b.label}${b.label.includes("días") ? "" : " días"}`, b.lots, money(b.value, cur)]),
            alignRight: [1, 2],
          }}
          action={<Link href="/app/lotes?dias=90" className="text-xs font-medium text-primary hover:underline">Ver lotes</Link>}
        >
          <ColumnChart currency={cur} items={d.expiryBuckets.map((b) => ({ ...b, label: b.label.replace(" días", ""), critical: b.key === "expired" }))} />
        </ChartCard>
      </div>

      {/* Valor de inventario + pendientes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Valor del inventario"
          subtitle="Estimado al cierre de cada día, a costo registrado"
          table={{ head: ["Fecha", "Valor"], rows: d.daily.map((x) => [fmtDate(x.date), money(x.inventory, cur)]), alignRight: [1] }}
        >
          <LineChart dates={dates} currency={cur} height={200} series={[{ key: "inv", label: "Valor del inventario", color: SERIES.s1, values: d.daily.map((x) => x.inventory), area: true }]} emptyText="Aún no hay inventario valorizado." />
        </ChartCard>
        <section aria-labelledby="pend-t" className="flex flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(6,20,35,.04),0_4px_16px_rgba(6,20,35,.04)] sm:p-5">
          <h2 id="pend-t" className="mb-3 text-[0.95rem] font-semibold">Pendientes</h2>
          <ul className="grid gap-2">
            {pending.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm hover:border-brand-strong hover:bg-accent/60"
                >
                  <span>{p.label}</span>
                  <span className={`min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-bold ${p.value ? "bg-navy text-white" : "bg-muted text-muted-foreground"}`}>{p.value}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/app/alertas" className="mt-auto pt-4 text-sm font-medium text-primary hover:underline">Ver todas las alertas →</Link>
        </section>
      </div>

      {/* Rankings */}
      <div className={`grid gap-4 ${canPurchases ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <ChartCard
          title="Productos con mayor valor"
          subtitle="Existencia actual a costo promedio"
          table={{ head: ["SKU", "Producto", "Valor"], rows: d.topProducts.map((p) => [p.sku, p.name, money(p.value, cur)]), alignRight: [2] }}
        >
          <BarList currency={cur} items={d.topProducts.map((p) => ({ label: p.name, sub: p.sku, value: p.value }))} emptyText="Sin existencias valorizadas." />
        </ChartCard>
        <ChartCard
          title="Valor por almacén"
          subtitle="Existencia actual a costo promedio"
          table={{ head: ["Almacén", "Valor"], rows: d.byWarehouse.map((w) => [w.name, money(w.value, cur)]), alignRight: [1] }}
        >
          <BarList currency={cur} items={d.byWarehouse.map((w) => ({ label: w.name, value: w.value }))} emptyText="Sin existencias valorizadas." />
        </ChartCard>
        {canPurchases && (
          <ChartCard
            title="Compras por proveedor"
            subtitle={`Recepciones de los últimos ${days} días`}
            table={{ head: ["Proveedor", "Valor"], rows: d.purchasesBySupplier.map((s) => [s.name, money(s.value, cur)]), alignRight: [1] }}
          >
            <BarList currency={cur} color={SERIES.s3} items={d.purchasesBySupplier.map((s) => ({ label: s.name, value: s.value }))} emptyText="Sin recepciones en el período." />
          </ChartCard>
        )}
      </div>

      {/* Últimas operaciones */}
      <section aria-labelledby="recent-t" className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 id="recent-t" className="text-[0.95rem] font-semibold">Últimas operaciones</h2>
          <Link href="/app/inventario/movimiento" className="text-sm font-medium text-primary hover:underline">Registrar movimiento</Link>
        </div>
        {d.recent.length === 0 ? (
          <EmptyState title="Aún no hay movimientos" description="Registre su primera entrada en Inventario → Registrar entrada o salida." />
        ) : (
          <Table>
            <THead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Producto</th><th scope="col">Almacén</th><th scope="col" className="text-right">Cantidad</th></tr></THead>
            <TBody>
              {d.recent.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{fmtDate(r.createdAt, true)}</td>
                  <td>{MOVEMENT_LABELS[r.type] ?? r.type}</td>
                  <td><span className="font-mono text-xs text-muted-foreground">{r.sku}</span> {r.name}</td>
                  <td>{r.warehouse}</td>
                  <td className={`text-right tabular-nums ${Number(r.quantity) > 0 ? "text-success" : ""}`}>{Number(r.quantity) > 0 ? "+" : ""}{fmtNumber(r.quantity)} {r.baseUnit}</td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Valores a costo (no a precio de venta). Escala compacta en ejes: {moneyCompact(1500, cur)} = {money(1500, cur)}.
      </p>
    </div>
  );
}
