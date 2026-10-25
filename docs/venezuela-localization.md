# Localización Venezuela

> Nada de este documento constituye asesoría legal o tributaria. Toda regla fiscal debe confirmarse con fuentes
> oficiales vigentes (SENIAT, BCV, Gaceta Oficial) y asesoría local antes de implementarse.

## 1. Idioma, zona horaria y formatos

| Aspecto | Decisión | Estado |
|---|---|---|
| Locale | `es-VE` por defecto (`<html lang="es-VE">`, `Intl` con `es-VE`) | ✅ |
| Zona horaria | `America/Caracas` por empresa (`tenant_settings.timezone`); fechas en BD en UTC; se muestran en la zona de la empresa | ✅ |
| Números | Separador decimal coma, miles punto (`Intl.NumberFormat('es-VE')`) | ⏳ F2 (utilidad de formato) |
| Textos | Español neutro venezolano; i18n preparado (mensajes centralizados en F2) | 🟡 |
| "Vencido" | Un lote vence al final del día de `expires_at` en la zona de la empresa (pregunta abierta Q-INV-3) | ⏳ F2 |

## 2. Monedas

- Monedas soportadas: **VES** y **USD** (`enum Currency`). La moneda base contable es configurable por empresa
  (`tenant_settings.base_currency`, por defecto USD — pregunta abierta Q-VE-1).
- Se mantienen separados: moneda de **referencia** del precio, moneda del **documento**, **tasa** aplicada,
  **costo**, **importe** e **impuestos**. Ningún campo mezcla monedas implícitamente.
- Todos los valores monetarios, cantidades y tasas son `DECIMAL` (ver [data-model.md](data-model.md#5-tipos-numéricos));
  en TypeScript se operan con `Prisma.Decimal` (decimal.js), nunca con `number` para dinero.

### Reglas de conversión y redondeo (propuesta F3)

1. `importe_destino = importe_origen × tasa` con precisión completa; se redondea **solo** al totalizar el
   documento, a 2 decimales, `ROUND_HALF_UP` (configurable si el negocio lo requiere).
2. Costos unitarios se guardan con 6 decimales; no se redondean en pasos intermedios.
3. La tasa se guarda con la precisión publicada por la fuente (hasta 8 decimales).

## 3. Tasas de cambio

### Servicio desacoplado

```ts
interface ExchangeRateSource {
  id: "manual" | "bcv" | string;
  fetchLatest(pair: "USD/VES"): Promise<{ rate: Decimal; effectiveAt: Date; fetchedAt: Date; evidence?: string }>;
}
```

- **Fuente manual auditada** (predeterminada en el MVP): un usuario con `exchange_rates.manage` carga la tasa,
  la fecha efectiva y la fuente declarada; queda en auditoría con actor, hora y valor.
- **Fuente BCV**: el Banco Central de Venezuela publica un tipo de cambio oficial en su sitio web. Hasta donde
  sabemos **no existe una API oficial documentada**; extraerla del HTML es frágil y debe evaluarse legal y
  técnicamente (Q-VE-2). Si se implementa, se guardará evidencia (hora de consulta, URL, hash del contenido) y
  la UI mostrará claramente el estado de actualización ("tasa del dd/mm, consultada hh:mm").
- Las tasas de plataforma (p. ej. BCV) son globales; cada empresa puede usar además tasas propias.

### Invariante: los históricos no cambian

Cada documento (recepción, ajuste valorizado, etc.) guarda `exchange_rate_id` **y** el valor de la tasa usada.
Los reportes históricos usan siempre el valor congelado; una tasa nueva solo afecta documentos nuevos.
Aceptación 8 — se implementa y prueba en Fase 3.

## 4. Identificación fiscal

- **RIF**: se valida solo el formato `[VEJPGC]-########-#` y se normaliza (`normalizeRif`). No se verifica el
  dígito verificador ni la existencia ante el SENIAT (Q-VE-3).
- Razón social y RIF de la empresa en `tenants.legal_name` / `tenants.rif`; de proveedores en F3.

## 5. Impuestos

- No se codifican alícuotas. Se modelará una tabla `tax_rates` por empresa (código, descripción, porcentaje,
  vigencia desde/hasta, tipo: IVA general/reducida/adicional, exento, exonerado) para que los valores se
  configuren y versionen sin cambiar código.
- Los productos referencian un código de tratamiento fiscal; el cálculo de impuestos solo informa precios de
  referencia en el MVP.

## 6. Facturación fiscal (fuera del MVP)

- RetailControl **no emite facturas fiscales** ni sustituye máquinas fiscales, imprentas digitales u otros
  medios autorizados. La landing y los términos lo dirán explícitamente.
- Antes de cualquier integración fiscal se debe: (1) investigar la normativa oficial vigente sobre emisión de
  documentos fiscales y proveedores autorizados/homologados; (2) obtener asesoría tributaria local;
  (3) registrar la decisión en un ADR. Ver Q-VE-4.

## 7. Conectividad

- Páginas livianas (≈ 103 kB JS compartido en la primera carga, medido en el build actual), renderizado en
  servidor, formularios que funcionan con envío nativo.
- Offline/PWA solo en una etapa futura, tras diseñar resolución de conflictos y seguridad del dispositivo.
