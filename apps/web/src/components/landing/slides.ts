export interface Slide {
  id: string;
  title: string;
  text: string;
  href: string;
  video: string;
  poster: string;
  card: string;
}

/** Cada diapositiva usa su propio video de fondo (sin audio). */
export const SLIDES: Slide[] = [
  {
    id: "lotes",
    title: "Controla tus productos con lotes y vencimientos",
    text: "Evita pérdidas, aplica despacho FEFO y recibe alertas antes de que la mercancía venza.",
    href: "#funcionalidades",
    video: "/media/lotes.mp4",
    poster: "/media/lotes.jpg",
    card: "/media/lotes-card.jpg",
  },
  {
    id: "inventario",
    title: "Existencias al día en todas tus sucursales",
    text: "Almacenes, transferencias y permisos por sucursal. Cada movimiento queda registrado.",
    href: "#funcionalidades",
    video: "/media/inventario.mp4",
    poster: "/media/inventario.jpg",
    card: "/media/inventario-card.jpg",
  },
  {
    id: "reportes",
    title: "Reportes claros y datos protegidos",
    text: "Valorización en USD y Bs., verificación en dos pasos y la información de cada empresa aislada.",
    href: "#seguridad",
    video: "/media/reportes.mp4",
    poster: "/media/reportes.jpg",
    card: "/media/reportes-card.jpg",
  },
];

export const SLIDE_SECONDS = 10;
