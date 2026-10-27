/*
 * Catálogo FICTICIO para la empresa de demostración. Nombres genéricos (sin marcas reales),
 * costos de referencia en USD inventados y códigos de barras del rango GS1 "200–299"
 * (uso interno de tienda), que no corresponden a productos reales.
 */

export interface DemoItem {
  name: string;
  unit: "UND" | "KG" | "L" | "M";
  cost: number;
  /** Ventas diarias promedio en unidad base. */
  demand: number;
  pack?: { code: string; name: string; factor: number };
  minStock?: number;
}

export interface DemoCategory {
  prefix: string;
  label: string;
  supplier: number;
  /** Vida útil en días (productos perecederos con lote y vencimiento); null = sin vencimiento. */
  shelfLife: number | null;
  items: DemoItem[];
}

const caja = (n: number) => ({ code: "CAJA", name: `Caja x${n}`, factor: n });
const bulto = (n: number) => ({ code: "BULTO", name: `Bulto x${n}`, factor: n });
const paq = (n: number) => ({ code: "PAQ", name: `Paquete x${n}`, factor: n });

export const DEMO_SUPPLIERS = [
  { name: "Distribuidora Los Andes (ficticia)", rif: "J-40000001-1", paymentTermsDays: 15 },
  { name: "Alimentos del Valle C.A. (ficticia)", rif: "J-40000002-2", paymentTermsDays: 7 },
  { name: "Lácteos y Embutidos Carabobo (ficticia)", rif: "J-40000003-3", paymentTermsDays: 0 },
  { name: "Química Limpia Oriente (ficticia)", rif: "J-40000004-4", paymentTermsDays: 30 },
  { name: "Bebidas del Centro (ficticia)", rif: "J-40000005-5", paymentTermsDays: 15 },
  { name: "Ferremayor Venezuela (ficticia)", rif: "J-40000006-6", paymentTermsDays: 30 },
];

export const DEMO_CATALOG: DemoCategory[] = [
  {
    prefix: "VIV",
    label: "Víveres",
    supplier: 0,
    shelfLife: 270,
    items: [
      { name: "Harina de maíz precocida 1 kg", unit: "UND", cost: 0.95, demand: 30, pack: bulto(20), minStock: 120 },
      { name: "Harina de trigo todo uso 1 kg", unit: "UND", cost: 1.05, demand: 8, pack: bulto(20), minStock: 40 },
      { name: "Arroz blanco tipo I 1 kg", unit: "UND", cost: 1.1, demand: 22, pack: bulto(24), minStock: 100 },
      { name: "Pasta larga 1 kg", unit: "UND", cost: 1.25, demand: 14, pack: bulto(20), minStock: 60 },
      { name: "Pasta corta 500 g", unit: "UND", cost: 0.7, demand: 10, pack: bulto(24), minStock: 48 },
      { name: "Azúcar refinada 1 kg", unit: "UND", cost: 1.15, demand: 16, pack: bulto(20), minStock: 60 },
      { name: "Sal refinada 1 kg", unit: "UND", cost: 0.4, demand: 5, pack: bulto(25), minStock: 25 },
      { name: "Caraotas negras 500 g", unit: "UND", cost: 1.2, demand: 9, pack: caja(24), minStock: 36 },
      { name: "Lentejas 500 g", unit: "UND", cost: 1.1, demand: 5, pack: caja(24), minStock: 24 },
      { name: "Arvejas secas 500 g", unit: "UND", cost: 0.95, demand: 3, pack: caja(24) },
      { name: "Avena en hojuelas 400 g", unit: "UND", cost: 1.35, demand: 4, pack: caja(24) },
      { name: "Café molido 500 g", unit: "UND", cost: 4.6, demand: 7, pack: caja(12), minStock: 24 },
      { name: "Café molido 250 g", unit: "UND", cost: 2.4, demand: 6, pack: caja(24) },
      { name: "Aceite vegetal 1 L", unit: "UND", cost: 2.8, demand: 12, pack: caja(12), minStock: 48 },
      { name: "Aceite de oliva 500 ml", unit: "UND", cost: 6.5, demand: 1, pack: caja(12) },
      { name: "Vinagre blanco 1 L", unit: "UND", cost: 0.9, demand: 2, pack: caja(12) },
      { name: "Salsa de tomate 397 g", unit: "UND", cost: 1.3, demand: 6, pack: caja(24) },
      { name: "Mayonesa 445 g", unit: "UND", cost: 2.6, demand: 5, pack: caja(12) },
      { name: "Atún en lata 140 g", unit: "UND", cost: 1.45, demand: 9, pack: caja(48), minStock: 48 },
      { name: "Sardinas en lata 170 g", unit: "UND", cost: 0.85, demand: 8, pack: caja(50) },
      { name: "Leche en polvo completa 400 g", unit: "UND", cost: 4.2, demand: 6, pack: caja(24), minStock: 24 },
      { name: "Chocolate en polvo 400 g", unit: "UND", cost: 3.1, demand: 2, pack: caja(12) },
      { name: "Galletas de soda 12 paquetes", unit: "UND", cost: 1.6, demand: 7, pack: caja(12) },
      { name: "Galletas dulces surtidas 300 g", unit: "UND", cost: 1.9, demand: 4, pack: caja(12) },
      { name: "Mantequilla vegetal 500 g", unit: "UND", cost: 2.2, demand: 5, pack: caja(12) },
      { name: "Maíz para cotufas 500 g", unit: "UND", cost: 1.0, demand: 2, pack: caja(24) },
      { name: "Gelatina en polvo 85 g", unit: "UND", cost: 0.55, demand: 3, pack: caja(48) },
      { name: "Sopa instantánea 60 g", unit: "UND", cost: 0.6, demand: 6, pack: caja(48) },
    ],
  },
  {
    prefix: "PER",
    label: "Lácteos y charcutería",
    supplier: 2,
    shelfLife: 25,
    items: [
      { name: "Leche UHT completa 1 L", unit: "UND", cost: 1.55, demand: 18, pack: caja(12), minStock: 48 },
      { name: "Leche UHT descremada 1 L", unit: "UND", cost: 1.6, demand: 5, pack: caja(12) },
      { name: "Yogur natural 1 kg", unit: "UND", cost: 2.9, demand: 3, pack: caja(6) },
      { name: "Queso blanco duro", unit: "KG", cost: 6.2, demand: 6, minStock: 15 },
      { name: "Queso amarillo rebanado", unit: "KG", cost: 9.4, demand: 3, minStock: 6 },
      { name: "Queso crema 200 g", unit: "UND", cost: 2.1, demand: 3, pack: caja(12) },
      { name: "Jamón de pierna rebanado", unit: "KG", cost: 8.9, demand: 4, minStock: 8 },
      { name: "Mortadela", unit: "KG", cost: 4.3, demand: 4, minStock: 8 },
      { name: "Salchichas de pollo 500 g", unit: "UND", cost: 2.4, demand: 6, pack: caja(20) },
      { name: "Mantequilla con sal 250 g", unit: "UND", cost: 2.7, demand: 3, pack: caja(20) },
      { name: "Huevos blancos cartón x30", unit: "UND", cost: 4.8, demand: 8, minStock: 20 },
      { name: "Nata 250 g", unit: "UND", cost: 1.9, demand: 3, pack: caja(12) },
      { name: "Chorizo ahumado 500 g", unit: "UND", cost: 3.6, demand: 2, pack: caja(10) },
      { name: "Tocineta rebanada 250 g", unit: "UND", cost: 3.2, demand: 2, pack: caja(10) },
      { name: "Queso de mano", unit: "KG", cost: 5.8, demand: 2 },
      { name: "Pan de sándwich 550 g", unit: "UND", cost: 2.3, demand: 7, minStock: 12 },
    ],
  },
  {
    prefix: "LIM",
    label: "Limpieza y cuidado personal",
    supplier: 3,
    shelfLife: null,
    items: [
      { name: "Detergente en polvo 1 kg", unit: "UND", cost: 2.4, demand: 6, pack: caja(12), minStock: 24 },
      { name: "Detergente líquido 2 L", unit: "UND", cost: 4.1, demand: 2, pack: caja(6) },
      { name: "Lavaplatos en crema 500 g", unit: "UND", cost: 1.5, demand: 4, pack: caja(24) },
      { name: "Cloro 1 L", unit: "UND", cost: 0.9, demand: 7, pack: caja(12), minStock: 24 },
      { name: "Desinfectante multiuso 1 L", unit: "UND", cost: 1.6, demand: 4, pack: caja(12) },
      { name: "Suavizante de ropa 1 L", unit: "UND", cost: 2.2, demand: 2, pack: caja(12) },
      { name: "Papel higiénico paquete x4", unit: "UND", cost: 1.9, demand: 10, pack: bulto(12), minStock: 36 },
      { name: "Servilletas paquete x100", unit: "UND", cost: 0.8, demand: 4, pack: bulto(24) },
      { name: "Jabón de baño 110 g", unit: "UND", cost: 0.7, demand: 7, pack: caja(72) },
      { name: "Champú 400 ml", unit: "UND", cost: 3.3, demand: 2, pack: caja(12) },
      { name: "Crema dental 100 ml", unit: "UND", cost: 1.4, demand: 5, pack: caja(36) },
      { name: "Desodorante en barra 50 g", unit: "UND", cost: 2.6, demand: 2, pack: caja(12) },
      { name: "Toallas sanitarias paquete x10", unit: "UND", cost: 1.7, demand: 3, pack: caja(24) },
      { name: "Pañales talla G paquete x30", unit: "UND", cost: 9.5, demand: 2, pack: bulto(4) },
      { name: "Bolsas de basura x10", unit: "UND", cost: 1.1, demand: 3, pack: caja(24) },
      { name: "Esponja doble uso", unit: "UND", cost: 0.35, demand: 3, pack: paq(12) },
      { name: "Escoba plástica", unit: "UND", cost: 2.8, demand: 0.5 },
      { name: "Coleto de algodón", unit: "UND", cost: 2.1, demand: 0.6 },
    ],
  },
  {
    prefix: "BEB",
    label: "Bebidas",
    supplier: 4,
    shelfLife: 180,
    items: [
      { name: "Refresco de cola 2 L", unit: "UND", cost: 1.6, demand: 14, pack: paq(6), minStock: 36 },
      { name: "Refresco de naranja 2 L", unit: "UND", cost: 1.5, demand: 6, pack: paq(6) },
      { name: "Refresco de limón 1,5 L", unit: "UND", cost: 1.3, demand: 4, pack: paq(6) },
      { name: "Agua mineral 1,5 L", unit: "UND", cost: 0.75, demand: 12, pack: paq(6), minStock: 36 },
      { name: "Agua mineral 600 ml", unit: "UND", cost: 0.45, demand: 10, pack: paq(24) },
      { name: "Jugo de durazno 1 L", unit: "UND", cost: 1.4, demand: 5, pack: caja(12) },
      { name: "Jugo de naranja 1 L", unit: "UND", cost: 1.7, demand: 3, pack: caja(12) },
      { name: "Bebida achocolatada 250 ml", unit: "UND", cost: 0.8, demand: 6, pack: caja(24) },
      { name: "Malta 355 ml", unit: "UND", cost: 0.65, demand: 9, pack: caja(36) },
      { name: "Bebida isotónica 500 ml", unit: "UND", cost: 1.1, demand: 3, pack: paq(12) },
      { name: "Té frío limón 500 ml", unit: "UND", cost: 0.9, demand: 2, pack: paq(12) },
      { name: "Café listo para tomar 250 ml", unit: "UND", cost: 1.2, demand: 1, pack: caja(24) },
    ],
  },
  {
    prefix: "FER",
    label: "Ferretería",
    supplier: 5,
    shelfLife: null,
    items: [
      { name: "Cable eléctrico N° 12 (metro)", unit: "M", cost: 0.55, demand: 18, minStock: 100 },
      { name: "Cable eléctrico N° 14 (metro)", unit: "M", cost: 0.4, demand: 12, minStock: 100 },
      { name: "Tubo PVC 1/2 pulgada 3 m", unit: "UND", cost: 2.9, demand: 2, minStock: 10 },
      { name: "Tubo PVC 3/4 pulgada 3 m", unit: "UND", cost: 3.8, demand: 1.5, minStock: 10 },
      { name: "Codo PVC 1/2 pulgada", unit: "UND", cost: 0.25, demand: 6, pack: paq(50) },
      { name: "Llave de paso 1/2 pulgada", unit: "UND", cost: 3.4, demand: 1 },
      { name: "Pega para PVC 118 ml", unit: "UND", cost: 2.6, demand: 1.5 },
      { name: "Cinta teflón 1/2 pulgada", unit: "UND", cost: 0.3, demand: 4, pack: paq(10) },
      { name: "Bombillo LED 9 W", unit: "UND", cost: 1.2, demand: 6, pack: caja(50), minStock: 30 },
      { name: "Bombillo LED 15 W", unit: "UND", cost: 1.9, demand: 3, pack: caja(50) },
      { name: "Tomacorriente doble", unit: "UND", cost: 1.6, demand: 2, pack: caja(10) },
      { name: "Interruptor sencillo", unit: "UND", cost: 1.3, demand: 2, pack: caja(10) },
      { name: "Breaker 20 A", unit: "UND", cost: 5.2, demand: 0.6 },
      { name: "Teipe eléctrico negro", unit: "UND", cost: 0.6, demand: 4, pack: paq(10) },
      { name: "Clavos de acero 2 pulgadas", unit: "KG", cost: 2.4, demand: 2 },
      { name: "Tornillo para madera 1 1/2 (caja x100)", unit: "UND", cost: 2.2, demand: 1.5 },
      { name: "Tirro de papel 1 pulgada", unit: "UND", cost: 0.9, demand: 2 },
      { name: "Silicón transparente 280 ml", unit: "UND", cost: 3.1, demand: 1 },
      { name: "Pintura de caucho blanca galón", unit: "UND", cost: 14.5, demand: 0.8, minStock: 6 },
      { name: "Pintura de esmalte negra 1/4 galón", unit: "UND", cost: 6.8, demand: 0.5 },
      { name: "Brocha 2 pulgadas", unit: "UND", cost: 1.4, demand: 1 },
      { name: "Rodillo de felpa 9 pulgadas", unit: "UND", cost: 3.5, demand: 0.6 },
      { name: "Lija de agua N° 150", unit: "UND", cost: 0.35, demand: 3, pack: paq(50) },
      { name: "Cemento gris saco 42,5 kg", unit: "UND", cost: 8.9, demand: 3, minStock: 20 },
      { name: "Cabilla 3/8 pulgada 6 m", unit: "UND", cost: 4.7, demand: 2, minStock: 20 },
      { name: "Alambre dulce N° 18", unit: "KG", cost: 2.1, demand: 1 },
      { name: "Candado de acero 40 mm", unit: "UND", cost: 4.2, demand: 0.5 },
      { name: "Martillo de uña 16 oz", unit: "UND", cost: 6.5, demand: 0.3 },
      { name: "Destornillador de estrías", unit: "UND", cost: 2.3, demand: 0.6 },
      { name: "Alicate universal 8 pulgadas", unit: "UND", cost: 5.4, demand: 0.3 },
      { name: "Cinta métrica 5 m", unit: "UND", cost: 3.1, demand: 0.5 },
      { name: "Manguera de jardín (metro)", unit: "M", cost: 0.6, demand: 4 },
      { name: "Guantes de carnaza", unit: "UND", cost: 1.8, demand: 1 },
      { name: "Bisagra de 3 pulgadas", unit: "UND", cost: 0.9, demand: 1.5, pack: paq(12) },
      { name: "Pila AA paquete x2", unit: "UND", cost: 1.1, demand: 3, pack: caja(24) },
      { name: "Extensión eléctrica 3 m", unit: "UND", cost: 4.4, demand: 0.5 },
    ],
  },
  {
    prefix: "CHU",
    label: "Chucherías y panadería",
    supplier: 1,
    shelfLife: 90,
    items: [
      { name: "Papas fritas 150 g", unit: "UND", cost: 1.3, demand: 6, pack: caja(24) },
      { name: "Tostones de plátano 150 g", unit: "UND", cost: 1.2, demand: 3, pack: caja(24) },
      { name: "Chocolate con leche 30 g", unit: "UND", cost: 0.6, demand: 10, pack: caja(24) },
      { name: "Caramelos surtidos bolsa x100", unit: "UND", cost: 2.5, demand: 2, pack: caja(12) },
      { name: "Chupetas paquete x24", unit: "UND", cost: 1.8, demand: 2, pack: caja(12) },
      { name: "Galleta rellena de chocolate", unit: "UND", cost: 0.45, demand: 8, pack: caja(36) },
      { name: "Pan dulce 6 unidades", unit: "UND", cost: 1.7, demand: 4 },
      { name: "Ponqué de vainilla 250 g", unit: "UND", cost: 1.9, demand: 3, pack: caja(12) },
      { name: "Maní salado 100 g", unit: "UND", cost: 0.9, demand: 4, pack: caja(24) },
      { name: "Chicles paquete x5", unit: "UND", cost: 0.3, demand: 8, pack: caja(40) },
      { name: "Cereal de maíz 500 g", unit: "UND", cost: 3.4, demand: 2, pack: caja(12) },
      { name: "Barra de granola 25 g", unit: "UND", cost: 0.5, demand: 4, pack: caja(24) },
      { name: "Pan de jamón (temporada)", unit: "UND", cost: 6.5, demand: 0.5 },
      { name: "Tequeños congelados x20", unit: "UND", cost: 5.2, demand: 1.5 },
      { name: "Hielo bolsa 2 kg", unit: "UND", cost: 0.8, demand: 6 },
    ],
  },
];

/** EAN-13 con dígito verificador válido, en el rango 200–299 (uso interno; no son productos reales). */
export function demoEan(n: number): string {
  const base = `2${String(n).padStart(11, "0")}`.slice(0, 12);
  const sum = base
    .split("")
    .reverse()
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return base + String((10 - (sum % 10)) % 10);
}
