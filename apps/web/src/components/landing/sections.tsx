import Link from "next/link";
import {
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconChart,
  IconCheckCircle,
  IconLog,
  IconScan,
  IconShield,
  IconStore,
  IconTransfer,
  IconUsers,
  Logo,
} from "./icons";

type Modulo = { icon: typeof IconBox; title: string; text: string };

/** Módulos que ya se pueden usar (verificados con pruebas automáticas). */
const DISPONIBLES: Modulo[] = [
  { icon: IconChart, title: "Tablero de indicadores", text: "Inventario valorizado, entradas y salidas, mermas, cobertura y vencimientos en gráficos, por período y almacén." },
  { icon: IconBox, title: "Catálogo de productos", text: "SKU único, unidades y presentaciones (caja, bulto, kilo), códigos de barra y lector USB." },
  { icon: IconTransfer, title: "Movimientos y Kardex", text: "Entradas y salidas sin existencias negativas, reversos auditados y Kardex con costo promedio." },
  { icon: IconCalendar, title: "Lotes y vencimientos", text: "Despacho FEFO automático, bloqueo de lotes vencidos y lotes por vencer a 7, 15, 30, 60 y 90 días." },
  { icon: IconCheckCircle, title: "Ajustes, mermas y conteos", text: "Ajustes con motivo y aprobación por monto, conteos físicos con diferencias aprobadas." },
  { icon: IconStore, title: "Sucursales, almacenes y transferencias", text: "Existencias por almacén y transferencias entre sucursales con salida y entrada conciliadas." },
  { icon: IconScan, title: "Compras y recepciones", text: "Órdenes de compra con aprobación, recepción parcial por lote, gastos prorrateados y reposición sugerida." },
  { icon: IconUsers, title: "Proveedores y tasas Bs./USD", text: "Proveedores con RIF, tasa del día con fuente; la tasa queda congelada en cada documento." },
  { icon: IconShield, title: "Alertas", text: "Avisos de stock bajo y de vencimientos según los días que usted configure." },
  { icon: IconUsers, title: "Usuarios, roles y 2FA", text: "Siete roles, clave temporal con cambio obligatorio y verificación en dos pasos con Google Authenticator." },
  { icon: IconLog, title: "Bitácora de auditoría", text: "Cada cambio queda registrado con quién, qué y cuándo. No se puede modificar ni borrar." },
  { icon: IconStore, title: "Suscripción y planes", text: "Prueba gratis de 14 días, elección de plan y registro de pagos por transferencia o pago móvil." },
  { icon: IconChart, title: "Reportes y Reporte ABC", text: "Clasificación A, B y C de productos, existencias valorizadas, rotación y cobertura, mermas, vencimientos y movimientos." },
  { icon: IconLog, title: "Exportación a Excel, CSV y PDF", text: "Descargue cualquier reporte en Excel o CSV, o imprímalo y guárdelo como PDF." },
  { icon: IconBox, title: "Importación de productos", text: "Cargue su catálogo desde una hoja de cálculo, con vista previa y errores por fila antes de guardar." },
];

/** En desarrollo: se muestran como pendientes, sin fecha comprometida. */
const PENDIENTES: Modulo[] = [
  { icon: IconBox, title: "Categorías, marcas y variantes", text: "Organice el catálogo por categoría y marca, con variantes de talla, color o presentación." },
  { icon: IconCalendar, title: "Recordatorios por correo", text: "Avisos por correo antes del vencimiento de la suscripción y resúmenes de alertas." },
];

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#0b6f7f]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#061423] sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg text-slate-600">{text}</p>}
    </div>
  );
}

function ModuloCard({ m, pendiente = false }: { m: Modulo; pendiente?: boolean }) {
  return (
    <li className={`flex flex-col rounded-2xl p-6 ${pendiente ? "border border-dashed border-amber-300 bg-amber-50/40" : "border border-slate-200 bg-white shadow-sm"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-12 w-12 place-items-center rounded-xl ${pendiente ? "bg-amber-100 text-amber-800" : "bg-[#e6fbfb] text-[#0b6f7f]"}`}>
          <m.icon className="h-6 w-6" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pendiente ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-700"}`}>
          {pendiente ? "Pendiente" : "Disponible"}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-bold text-[#061423]">{m.title}</h3>
      <p className="mt-2 text-slate-600">{m.text}</p>
    </li>
  );
}

export function Funcionalidades() {
  return (
    <section id="funcionalidades" className="scroll-mt-6 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle
        eyebrow="Funcionalidades"
        title="Todo su inventario en un solo lugar"
        text="Construimos RetailControl por etapas y le mostramos con claridad qué ya puede usar y qué está en desarrollo."
      />
      <div className="mx-auto mt-12 max-w-7xl">
        <h3 className="flex items-center gap-3 text-xl font-bold text-[#061423]">
          Disponible hoy
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700">{DISPONIBLES.length} módulos</span>
        </h3>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" data-testid="modulos-disponibles">
          {DISPONIBLES.map((m) => <ModuloCard key={m.title} m={m} />)}
        </ul>
        <h3 className="mt-14 flex items-center gap-3 text-xl font-bold text-[#061423]">
          Pendiente
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900">en desarrollo</span>
        </h3>
        <ul className="mt-5 grid gap-5 sm:grid-cols-2" data-testid="modulos-pendientes">
          {PENDIENTES.map((m) => <ModuloCard key={m.title} m={m} pendiente />)}
        </ul>
        <p className="mt-6 text-sm text-slate-500">
          Las funciones pendientes no tienen fecha comprometida. No incluye facturación fiscal ni punto de venta.
        </p>
      </div>
    </section>
  );
}

export function Sectores() {
  const items = [
    { title: "Abastos y bodegas", text: "Controle víveres, charcutería y productos perecederos por lote, y evite pérdidas por vencimiento." },
    { title: "Minimarkets", text: "Varias cajas y almacenes, existencias por sucursal y personal con permisos distintos." },
    { title: "Ferreterías", text: "Miles de referencias, unidades como metro, caja o kilo, y códigos internos o de fabricante." },
  ];
  return (
    <section id="sectores" className="scroll-mt-6 bg-[#f3fbfc] px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Sectores" title="Hecho para el comercio venezolano" />
      <ul className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
        {items.map((i) => (
          <li key={i.title} className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-bold text-[#061423]">{i.title}</h3>
            <p className="mt-3 text-slate-600">{i.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface PlanView {
  features?: string[];
  code: string;
  name: string;
  description: string | null;
  price: string;
  maxBranches: number | null;
  maxUsers: number | null;
}

const FEATURE_LABELS: Record<string, string> = {
  catalogo: "Inventario, lotes, vencimientos, reportes y exportación",
  compras: "Compras, recepciones y proveedores",
  transferencias: "Transferencias entre almacenes",
  alertas: "Alertas de stock y vencimiento",
  auditoria_ampliada: "Auditoría ampliada",
  soporte_prioritario: "Soporte prioritario",
};

function planHighlights(features: string[]): string[] {
  return Object.keys(FEATURE_LABELS).filter((k) => features.includes(k)).map((k) => FEATURE_LABELS[k]!);
}

export function Precios({ plans }: { plans: PlanView[] }) {
  return (
    <section id="precios" className="scroll-mt-6 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Precios" title="Planes simples, en dólares de referencia" text="Pruebe gratis durante 14 días, sin tarjeta de crédito." />
      <ul className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const featured = p.code === "PROFESIONAL";
          const custom = p.maxUsers === null && p.maxBranches === null;
          return (
            <li key={p.code} className={`flex flex-col rounded-2xl p-7 ${featured ? "bg-[#061423] text-white shadow-xl ring-2 ring-[#2ee6e0]" : "bg-white ring-1 ring-slate-200"}`}>
              <h3 className="text-xl font-bold">{p.name}</h3>
              {p.description && <p className={`mt-2 text-sm ${featured ? "text-white/75" : "text-slate-600"}`}>{p.description}</p>}
              <p className="mt-6 text-4xl font-extrabold">
                {custom ? "A convenir" : <>USD {p.price}<span className="text-base font-medium opacity-70"> /mes</span></>}
              </p>
              <ul className={`mt-6 grid gap-2 text-sm ${featured ? "text-white/85" : "text-slate-700"}`}>
                <li className="flex gap-2"><IconCheckCircle className="h-5 w-5 shrink-0 text-[#2ee6e0]" />{p.maxBranches ? `Hasta ${p.maxBranches} sucursal(es)` : "Sucursales según contrato"}</li>
                <li className="flex gap-2"><IconCheckCircle className="h-5 w-5 shrink-0 text-[#2ee6e0]" />{p.maxUsers ? `Hasta ${p.maxUsers} usuarios` : "Usuarios según contrato"}</li>
                <li className="flex gap-2"><IconCheckCircle className="h-5 w-5 shrink-0 text-[#2ee6e0]" />Verificación en dos pasos</li>
                {planHighlights(p.features ?? []).map((t) => (
                  <li key={t} className="flex gap-2"><IconCheckCircle className="h-5 w-5 shrink-0 text-[#2ee6e0]" />{t}</li>
                ))}
              </ul>
              <Link
                href={custom ? "/login?registro=1" : `/login?registro=1&next=${encodeURIComponent(`/onboarding?plan=${p.code}`)}`}
                className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full font-bold ${featured ? "bg-[#2ee6e0] text-[#04202a]" : "border border-[#061423] text-[#061423] hover:bg-slate-50"}`}
              >
                {custom ? "Contactar" : "Comenzar gratis"} <IconArrowRight className="h-5 w-5" />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-slate-500">
        Precios referenciales en USD; la moneda y forma de pago se confirman al contratar. Si la suscripción vence,
        sus datos se conservan en modo de solo lectura.
      </p>
    </section>
  );
}

export function Seguridad() {
  const items = [
    "Verificación en dos pasos con Google Authenticator y códigos de recuperación.",
    "Los datos de cada empresa están aislados en la base de datos.",
    "Bitácora de auditoría que no se puede modificar ni borrar.",
    "Sesiones que usted puede cerrar a distancia en cualquier momento.",
    "Procedimiento de respaldo y restauración probado automáticamente.",
  ];
  return (
    <section id="seguridad" className="scroll-mt-6 bg-[#061423] px-4 py-20 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#2ee6e0]">Seguridad</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Su información, protegida</h2>
          <p className="mt-4 text-lg text-white/75">
            Diseñamos la seguridad desde el primer día, tomando como referencia las buenas prácticas de ISO/IEC 27001.
            Aún no contamos con certificación.
          </p>
        </div>
        <ul className="grid gap-3">
          {items.map((t) => (
            <li key={t} className="flex gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <IconShield className="h-6 w-6 shrink-0 text-[#2ee6e0]" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Preguntas() {
  const faqs = [
    ["¿Necesito tarjeta de crédito para probar?", "No. La prueba gratuita de 14 días no requiere tarjeta."],
    ["¿RetailControl emite facturas fiscales?", "No. RetailControl controla su inventario; no sustituye su sistema de facturación o máquina fiscal homologada."],
    ["¿Puedo trabajar en dólares y bolívares?", "Sí. Puede registrar precios de referencia en USD o Bs. La tasa usada en cada documento se guarda y no cambia después."],
    ["¿Qué pasa con mis datos si dejo de pagar?", "No se borran. Su cuenta pasa a modo de solo lectura: puede seguir consultándolos y exportarlos a Excel o CSV."],
    ["¿Cómo pago la suscripción?", "Desde la aplicación registra su pago por transferencia o pago móvil con la referencia; lo verificamos y su plan queda activo."],
    ["¿Funciona desde el teléfono?", "Sí. Está diseñado para usarse desde el celular, la tablet o la computadora."],
  ];
  return (
    <section id="preguntas" className="scroll-mt-6 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Recursos" title="Preguntas frecuentes" />
      <div className="mx-auto mt-10 grid max-w-3xl gap-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-slate-200 p-5 open:shadow-sm">
            <summary className="cursor-pointer list-none font-semibold text-[#061423] [&::-webkit-details-marker]:hidden">
              <span className="mr-2 text-[#0b6f7f] group-open:hidden">+</span>
              <span className="mr-2 hidden text-[#0b6f7f] group-open:inline">−</span>
              {q}
            </summary>
            <p className="mt-3 text-slate-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CtaFinal() {
  return (
    <section className="bg-gradient-to-r from-[#0b8fa3] to-[#2ee6e0] px-4 py-16 text-center sm:px-6">
      <h2 className="text-3xl font-extrabold text-[#04202a] sm:text-4xl">Ordene su inventario desde hoy</h2>
      <p className="mt-3 text-lg text-[#04202a]/80">Cree su cuenta y registre su empresa en minutos.</p>
      <Link href="/login?registro=1" className="mt-8 inline-flex h-14 items-center gap-3 rounded-full bg-[#061423] px-8 font-bold text-white hover:bg-[#0b2033]">
        Comenzar gratis <IconArrowRight className="h-5 w-5" />
      </Link>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-[#061423] px-4 py-10 text-white/70 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <Logo />
        <p className="max-w-xl text-sm">
          RetailControl no emite facturas fiscales ni sustituye su sistema de facturación homologado.
          © {new Date().getFullYear()} Rumbo Digital.
        </p>
        <Link href="/login" className="text-sm font-semibold text-white hover:text-[#2ee6e0]">Iniciar sesión</Link>
      </div>
    </footer>
  );
}
