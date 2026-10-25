import Link from "next/link";
import { IconArrowRight, IconChevron, Logo } from "./icons";

const SECTORES = [
  { href: "#sectores", label: "Abastos y bodegas" },
  { href: "#sectores", label: "Minimarkets" },
  { href: "#sectores", label: "Ferreterías" },
];
const RECURSOS = [
  { href: "#preguntas", label: "Preguntas frecuentes" },
  { href: "#seguridad", label: "Seguridad y privacidad" },
  { href: "/login", label: "Acceso de clientes" },
];

function Dropdown({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-2 font-semibold hover:text-[#2ee6e0] [&::-webkit-details-marker]:hidden">
        {label}
        <IconChevron className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <ul className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-white/10 bg-[#0b2033]/95 p-2 shadow-xl backdrop-blur">
        {items.map((i) => (
          <li key={i.label}>
            <a href={i.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">{i.label}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="RetailControl, inicio"><Logo /></Link>

        <nav aria-label="Principal" className="hidden items-center gap-8 text-[0.95rem] lg:flex">
          <a href="#funcionalidades" className="font-semibold hover:text-[#2ee6e0]">Funcionalidades</a>
          <Dropdown label="Sectores" items={SECTORES} />
          <a href="#precios" className="font-semibold hover:text-[#2ee6e0]">Precios</a>
          <a href="#seguridad" className="font-semibold hover:text-[#2ee6e0]">Seguridad</a>
          <Dropdown label="Recursos" items={RECURSOS} />
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="inline-flex h-12 items-center rounded-full border border-white/70 px-6 font-semibold transition hover:bg-white/10">
            Iniciar sesión
          </Link>
          <Link href="/login?registro=1" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#2ee6e0] px-6 font-bold text-[#04202a] transition hover:bg-[#5ff0eb]">
            Comenzar gratis <IconArrowRight className="h-5 w-5" />
          </Link>
        </div>

        {/* Menú móvil sin JavaScript */}
        <details className="relative lg:hidden">
          <summary className="flex h-11 cursor-pointer list-none items-center rounded-full border border-white/60 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Menú
          </summary>
          <nav aria-label="Principal (móvil)" className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#0b2033]/95 p-3 shadow-xl backdrop-blur">
            <ul className="grid gap-1 text-sm">
              {[
                ["#funcionalidades", "Funcionalidades"],
                ["#sectores", "Sectores"],
                ["#precios", "Precios"],
                ["#seguridad", "Seguridad"],
                ["#preguntas", "Preguntas frecuentes"],
              ].map(([h, l]) => (
                <li key={h}><a href={h} className="block rounded-lg px-3 py-2 hover:bg-white/10">{l}</a></li>
              ))}
              <li className="mt-2 grid gap-2">
                <Link href="/login" className="rounded-full border border-white/70 px-4 py-2 text-center font-semibold">Iniciar sesión</Link>
                <Link href="/login?registro=1" className="rounded-full bg-[#2ee6e0] px-4 py-2 text-center font-bold text-[#04202a]">Comenzar gratis</Link>
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
