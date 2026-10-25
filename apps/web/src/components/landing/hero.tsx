"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconChart,
  IconCheckCircle,
  IconChevron,
  IconMouse,
  IconPlay,
  IconShield,
  IconStore,
} from "./icons";
import { SLIDES, SLIDE_SECONDS } from "./slides";

/**
 * Portada con video de fondo SIN audio (los archivos no tienen pista de sonido).
 * - Cada diapositiva del carrusel tiene su video; al terminar pasa a la siguiente.
 * - Con "reducir movimiento" o ahorro de datos solo se muestran imágenes fijas.
 */
function useLowMotionOrData(): boolean {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setLow(mq.matches || conn?.saveData === true);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return low;
}

const FEATURES = [
  { icon: IconBox, title: "Inventario en tiempo real", text: "Conoce tus existencias en cada sucursal." },
  { icon: IconStore, title: "Múltiples sucursales", text: "Almacenes, transferencias y permisos por sucursal." },
  { icon: IconChart, title: "Precios en USD y Bs.", text: "Tasa BCV, historial y precios de referencia." },
  { icon: IconShield, title: "Seguridad empresarial", text: "Verificación en dos pasos y datos aislados por empresa." },
];

function CardWidget({ index }: { index: number }) {
  if (index === 0) {
    const rows = [
      { name: "Leche UHT 1L", days: 5, tone: "bg-red-50 text-red-600" },
      { name: "Atún en lata", days: 12, tone: "bg-amber-50 text-amber-600" },
      { name: "Harina de maíz", days: 28, tone: "bg-emerald-50 text-emerald-600" },
    ];
    return (
      <div className="w-44 rounded-xl bg-white/95 p-3 text-[#0b1b2b] shadow-xl">
        <ul className="grid gap-2.5">
          {rows.map((r) => (
            <li key={r.name} className="grid gap-1">
              <span className="text-[0.7rem] font-semibold">{r.name}</span>
              <span className={`w-fit rounded px-1.5 py-0.5 text-[0.65rem] font-medium ${r.tone}`}>
                Vence: {r.days} días
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (index === 1) {
    const rows = [
      { name: "Sucursal Centro", pct: 82 },
      { name: "Sucursal Este", pct: 54 },
      { name: "Almacén principal", pct: 91 },
    ];
    return (
      <div className="w-44 rounded-xl bg-white/95 p-3 text-[#0b1b2b] shadow-xl">
        <p className="mb-2 text-[0.7rem] font-semibold">Existencias</p>
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.name} className="grid gap-1">
              <span className="text-[0.65rem]">{r.name}</span>
              <span className="h-1.5 rounded bg-slate-200">
                <span className="block h-1.5 rounded bg-[#19c6c9]" style={{ width: `${r.pct}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="w-44 rounded-xl bg-white/95 p-3 text-[#0b1b2b] shadow-xl">
      <p className="text-[0.7rem] font-semibold">Inventario valorizado</p>
      <p className="mt-1 text-sm font-bold">USD 12.480</p>
      <div className="mt-2 flex h-10 items-end gap-1" aria-hidden>
        {[40, 65, 50, 80, 70, 95].map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-[#19c6c9]" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const lowMotion = useLowMotionOrData();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [modalClip, setModalClip] = useState(0);

  const go = useCallback((i: number) => setIndex((i + SLIDES.length) % SLIDES.length), []);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Sin video (movimiento reducido / ahorro de datos): avanza por tiempo solo si no se pidió reducir movimiento.
  useEffect(() => {
    if (!lowMotion || !playing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setTimeout(next, SLIDE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [lowMotion, playing, next]);

  // Pausar / reanudar el video de fondo junto con el carrusel.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, index]);

  const slide = SLIDES[index]!;

  function openVideo() {
    setModalClip(0);
    dialogRef.current?.showModal();
  }

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#061423] text-white">
      {/* Fondo: video de la diapositiva activa (sin audio) */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        {lowMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slide.poster} src={slide.poster} alt="" className="rc-fade h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            key={slide.video}
            className="rc-fade h-full w-full object-cover"
            src={slide.video}
            poster={slide.poster}
            autoPlay={playing}
            muted
            playsInline
            preload="auto"
            onEnded={() => playing && next()}
            data-testid="hero-video"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#061423]/95 via-[#061423]/75 to-[#061423]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#061423]/90 via-transparent to-[#061423]/50" />
      </div>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-4 pb-8 pt-28 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:px-8 lg:pt-32">
        {/* Texto principal */}
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm backdrop-blur">
            <span className="flex h-3.5 w-5 flex-col overflow-hidden rounded-[2px]" aria-hidden>
              <span className="flex-1 bg-[#f7d117]" />
              <span className="flex-1 bg-[#1f3c99]" />
              <span className="flex-1 bg-[#cf1f2b]" />
            </span>
            SaaS de inventario para <span className="font-semibold text-[#2ee6e0]">Venezuela</span>
          </span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
            Tu inventario
            <span className="block text-[#2ee6e0]">siempre al día</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/85 sm:text-xl">
            Controla productos, lotes, vencimientos y almacenes en un solo lugar. Diseñado para abastos, minimarkets,
            ferreterías y comercios venezolanos.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login?registro=1"
              className="inline-flex h-14 items-center gap-3 rounded-full bg-[#2ee6e0] px-8 text-base font-bold text-[#04202a] shadow-[0_0_30px_rgba(46,230,224,.35)] transition hover:bg-[#5ff0eb] focus-visible:outline-white"
            >
              Comenzar gratis <IconArrowRight className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={openVideo}
              className="inline-flex h-14 items-center gap-3 rounded-full border border-white/70 px-8 text-base font-semibold transition hover:bg-white/10 focus-visible:outline-white"
            >
              <IconPlay className="h-5 w-5" /> Ver video (30 seg)
            </button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
            {["Sin tarjeta de crédito", "Configuración en minutos", "Soporte en español"].map((t) => (
              <li key={t} className="inline-flex items-center gap-2">
                <IconCheckCircle className="h-5 w-5 text-[#2ee6e0]" /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Carrusel */}
        <div
          className="relative mx-auto w-full max-w-2xl"
          role="region"
          aria-roledescription="carrusel"
          aria-label="Funciones destacadas"
        >
          <div className="rounded-2xl border border-white/15 bg-[#0b2033]/55 p-5 shadow-2xl backdrop-blur-md sm:p-7">
            <div className="grid items-center gap-6 sm:grid-cols-[1fr_1.15fr]">
              <div aria-live={playing ? "off" : "polite"}>
                <p className="text-sm text-white/70">
                  <span className="font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mx-2">/</span>
                  {String(SLIDES.length).padStart(2, "0")}
                </p>
                <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-[1.7rem]" data-testid="slide-title">
                  {slide.title}
                </h2>
                <p className="mt-3 text-[0.95rem] leading-relaxed text-white/80">{slide.text}</p>
                <a
                  href={slide.href}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-[#2ee6e0]/70 px-6 text-sm font-semibold text-[#2ee6e0] transition hover:bg-[#2ee6e0]/10"
                >
                  Conocer más <IconArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={slide.card}
                  src={slide.card}
                  alt=""
                  className="rc-fade h-64 w-full object-cover sm:h-80"
                  loading="lazy"
                />
                <span className="absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-lg bg-white text-[#0b1b2b] shadow">
                  {index === 0 ? <IconBox className="h-6 w-6" /> : index === 1 ? <IconStore className="h-6 w-6" /> : <IconChart className="h-6 w-6" />}
                </span>
                <div className="absolute bottom-3 right-3 hidden sm:block">
                  <div className="relative">
                    <CardWidget index={index} />
                    {index === 0 && (
                      <span className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-[#0b1b2b] shadow">
                        <IconCalendar className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              {SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Ir a la diapositiva ${i + 1} de ${SLIDES.length}`}
                  aria-current={i === index}
                  className="h-1.5 w-12 overflow-hidden rounded-full bg-white/25"
                >
                  {i === index && (
                    <span
                      key={`${index}-${playing}`}
                      className={`block h-full bg-[#2ee6e0] ${playing && !lowMotion ? "rc-progress" : "w-full"}`}
                      style={{ animationDuration: `${SLIDE_SECONDS}s` }}
                    />
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="ml-auto rounded-full px-3 py-1 text-xs text-white/70 hover:text-white"
                aria-label={playing ? "Pausar el carrusel" : "Reanudar el carrusel"}
              >
                {playing ? "Pausar" : "Reanudar"}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={prev}
            aria-label="Diapositiva anterior"
            className="absolute -left-4 top-1/2 hidden h-14 w-14 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-[#061423]/60 backdrop-blur transition hover:bg-white/10 lg:-left-8 lg:grid"
          >
            <IconChevron className="h-6 w-6 rotate-90" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Diapositiva siguiente"
            className="absolute -right-4 top-1/2 hidden h-14 w-14 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-[#061423]/60 backdrop-blur transition hover:bg-white/10 lg:-right-8 lg:grid"
          >
            <IconChevron className="h-6 w-6 -rotate-90" />
          </button>
        </div>
      </div>

      {/* Ventajas */}
      <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-4 gap-y-8 px-4 pb-6 sm:px-6 lg:grid-cols-4 lg:px-8">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl border border-[#2ee6e0]/50 bg-[#2ee6e0]/5 text-[#2ee6e0]">
              <f.icon className="h-8 w-8" />
            </span>
            <h3 className="mt-4 font-bold sm:text-lg">{f.title}</h3>
            <p className="mt-1 max-w-[16rem] text-sm text-white/75 sm:text-base">{f.text}</p>
          </li>
        ))}
      </ul>

      <a href="#funcionalidades" className="mx-auto mb-10 flex flex-col items-center gap-1 text-sm text-white/70 hover:text-white">
        <span className="inline-flex items-center gap-2">
          <IconMouse className="h-6 w-6" /> Desliza para conocer más
        </span>
        <IconChevron className="h-5 w-5" />
      </a>

      {/* Onda inferior */}
      <svg className="pointer-events-none absolute bottom-0 left-0 -z-10 h-28 w-full" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden>
        <path d="M0 60c240 50 480 50 720 10s480-40 720 10v40H0z" fill="#0fb5c2" opacity=".55" />
        <path d="M0 85c260-40 520-30 760 5s460 30 680-5v35H0z" fill="#0b8fa3" opacity=".6" />
      </svg>

      {/* Video completo (los 3 clips seguidos, sin sonido) */}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,960px)] rounded-2xl bg-black p-0 text-white backdrop:bg-black/80"
        onClose={() => setModalClip(0)}
        aria-label="Video de presentación de RetailControl"
      >
        <div className="relative">
          <video
            key={`modal-${modalClip}`}
            src={SLIDES[modalClip]!.video}
            poster={SLIDES[modalClip]!.poster}
            className="aspect-video w-full"
            autoPlay
            muted
            playsInline
            controls
            onEnded={() => setModalClip((c) => (c + 1 < SLIDES.length ? c + 1 : c))}
          />
          <form method="dialog" className="absolute right-3 top-3">
            <button className="rounded-full bg-black/70 px-4 py-2 text-sm font-semibold hover:bg-black" aria-label="Cerrar video">
              Cerrar ✕
            </button>
          </form>
          <p className="px-4 py-3 text-sm text-white/70">
            Parte {modalClip + 1} de {SLIDES.length} · Video sin sonido
          </p>
        </div>
      </dialog>
    </section>
  );
}
