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

type Status = "disponible" | "proximamente";
const FUNCIONES: { icon: typeof IconBox; title: string; text: string; status: Status }[] = [
  { icon: IconStore, title: "Sucursales y almacenes", text: "Organice su negocio por sucursal y almacén, con códigos propios.", status: "disponible" },
  { icon: IconUsers, title: "Usuarios y roles", text: "Propietario, administrador, gerente, almacenista, comprador, auditor y consulta.", status: "disponible" },
  { icon: IconBox, title: "Catálogo de productos", text: "SKU único por empresa y búsqueda rápida, también con lector de código de barras.", status: "disponible" },
  { icon: IconLog, title: "Bitácora de auditoría", text: "Cada cambio queda registrado con quién, qué y cuándo. No se puede borrar.", status: "disponible" },
  { icon: IconCalendar, title: "Lotes y vencimientos", text: "Despacho FEFO, alertas a 7, 15, 30, 60 y 90 días y bloqueo de lotes vencidos.", status: "proximamente" },
  { icon: IconTransfer, title: "Movimientos y transferencias", text: "Entradas, salidas, ajustes con aprobación y Kardex por producto.", status: "proximamente" },
  { icon: IconScan, title: "Compras y recepciones", text: "Órdenes de compra, recepción parcial por lote y proveedores con RIF.", status: "proximamente" },
  { icon: IconChart, title: "Reportes y valorización", text: "Existencias, rotación, mermas y valor del inventario en USD y Bs.", status: "proximamente" },
];

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#0e9aa7]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#061423] sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg text-slate-600">{text}</p>}
    </div>
  );
}

export function Funcionalidades() {
  return (
    <section id="funcionalidades" className="scroll-mt-6 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle
        eyebrow="Funcionalidades"
        title="Todo su inventario en un solo lugar"
        text="Construimos RetailControl por etapas. Le mostramos con claridad qué ya puede usar y qué viene en camino."
      />
      <ul className="mx-auto mt-12 grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FUNCIONES.map((f) => (
          <li key={f.title} className="rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#e6fbfb] text-[#0e9aa7]"><f.icon className="h-6 w-6" /></span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${f.status === "disponible" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                {f.status === "disponible" ? "Disponible" : "Próximamente"}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#061423]">{f.title}</h3>
            <p className="mt-2 text-slate-600">{f.text}</p>
          </li>
        ))}
      </ul>
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
  code: string;
  name: string;
  description: string | null;
  price: string;
  maxBranches: number | null;
  maxUsers: number | null;
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
              </ul>
              <Link
                href="/login?registro=1"
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
    "Respaldos cifrados con prueba de restauración.",
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
    ["¿Qué pasa con mis datos si dejo de pagar?", "No se borran. Su cuenta pasa a modo de solo lectura y puede exportar su información."],
    ["¿Funciona desde el teléfono?", "Sí. Está diseñado para usarse desde el celular, la tablet o la computadora."],
  ];
  return (
    <section id="preguntas" className="scroll-mt-6 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Recursos" title="Preguntas frecuentes" />
      <div className="mx-auto mt-10 grid max-w-3xl gap-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-slate-200 p-5 open:shadow-sm">
            <summary className="cursor-pointer list-none font-semibold text-[#061423] [&::-webkit-details-marker]:hidden">
              <span className="mr-2 text-[#0e9aa7] group-open:hidden">+</span>
              <span className="mr-2 hidden text-[#0e9aa7] group-open:inline">−</span>
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
