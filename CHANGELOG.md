# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado semántico.

## [0.10.0] — 2026-10-27 — Recepción de mercancía con el celular

### Añadido
- **Recibir con escáner** (Compras → Recibir con escáner, o desde Recepciones): pensado para el celular.
  - Escaneo del código de barras con la **cámara** (lector nativo del navegador en Android; ZXing en iPhone y otros),
    con linterna si el teléfono la tiene. También acepta código/SKU escrito o lector USB/Bluetooth.
  - Por cada producto: cantidad (con botones + / −), unidad o presentación (el código de una caja selecciona la caja),
    costo sugerido (último costo, convertido a la moneda y presentación), lote (con sugerencia de lotes existentes) y
    vencimiento; exige lote/vencimiento cuando el producto lo requiere y no acepta mercancía vencida.
  - Proveedor, almacén, moneda (tasa del día congelada), factura y gastos adicionales.
  - Código no registrado: buscar el producto por nombre y guardar el código para la próxima vez.
  - Borrador guardado en el teléfono (no se pierde si se cae la señal) y envío idempotente (un reintento no duplica).
- Prueba E2E con cámara simulada y pruebas de integración del escaneo (presentaciones, aislamiento, permisos).

### Seguridad
- `Permissions-Policy` permite la cámara solo para el propio sitio. La imagen se procesa en el teléfono; no se envía ni se guarda.

## [0.9.0] — 2026-10-27 — Fase 5: reportes, exportaciones y preparación para producción

### Añadido
- **Reportes** (`/app/reportes`, menú General): Reporte ABC, existencias valorizadas, rotación y cobertura, mermas,
  vencimientos y movimientos, con filtros de período y almacén.
- **Exportación** a Excel (XLSX) y CSV listo para Excel en español; **PDF** desde la vista imprimible. Hasta
  50 000 filas, permiso `reports.export`, auditoría y protección contra inyección de fórmulas.
- **Importación de productos** desde CSV con plantilla, vista previa, errores por fila y aplicación todo o nada.
- **Observabilidad**: OpenTelemetry opcional, errores de servidor con id de correlación, registro de consultas
  lentas, latencia de BD en `/api/health`.
- **Prueba de carga** (`pnpm perf:load`, 50 000 productos / 300 000 movimientos) y auditoría de accesibilidad
  WCAG 2.2 AA (axe) en E2E.
- Runbooks (incidentes, respaldo, despliegue/rollback, secretos) y checklist de salida a producción.

### Cambiado
- Tablero de Inicio 5× más rápido con muchos datos (consultas en paralelo e índice por fecha); Reporte ABC calculado en SQL.
- Landing: Reporte ABC, exportación e importación pasan a «Disponible».

### Corregido
- Contraste de los subtítulos del landing (WCAG AA).

## [0.8.1] — 2026-10-26

### Corregido
- Celular: el menú lateral no se veía al tocar el botón superior izquierdo (quedaba recortado dentro de la barra
  superior). Ahora se abre a pantalla completa con todas las secciones, bloquea el desplazamiento de fondo y el
  botón muestra la palabra «Menú». Prueba E2E que verifica el alto del menú y sus opciones.
- Logo del menú en celular aplastado.

## [0.8.0] — 2026-10-26 — Fase 4: comercialización

### Añadido
- Landing: módulos **disponibles** (12) y **pendientes** (Reporte ABC, exportación Excel/PDF, importación CSV),
  funciones por plan y enlace al registro con el plan elegido.
- Registro de empresa con elección de plan (prueba gratis de 14 días).
- Suscripción (`/app/configuracion/suscripcion`): plan y estado, uso del plan, instrucciones de pago, registro de
  pagos por transferencia o pago móvil (USD o Bs.) con monto esperado e historial; aviso de días de prueba y de gracia.
- Panel de plataforma (`/plataforma`): resumen (MRR, conversión, pagos por conciliar), empresas (plan, uso,
  extender prueba, suspender/reactivar/cancelar con motivo), conciliación de pagos, planes e instrucciones de pago.
- Rol de superadministrador por `PLATFORM_SUPERADMIN_EMAILS`; 2FA obligatoria en el panel.
- Período pagado con 7 días de gracia antes de pasar a solo lectura.

### Seguridad
- Pagos con RLS, inmutables una vez revisados y con segregación de funciones (nadie concilia su propio pago).
- Pruebas de integración (`billing`) y E2E (`comercializacion`).

### Corregido
- El landing ya no promete exportación de datos (está en desarrollo).

## [0.7.0] — 2026-10-26 — Usuarios con clave temporal y 2FA administrada

### Añadido
- Módulo Usuarios sin invitaciones: crear (correo, nombre, rol, clave temporal con generador), editar
  (nombre, rol, estado), asignar nueva clave temporal y eliminar. Los datos de acceso se muestran una sola vez
  con botón para copiarlos.
- Cambio de clave obligatorio en el primer ingreso (`/cuenta/cambiar-clave`); la nueva debe ser distinta.
- Activar/desactivar la verificación en dos pasos por usuario. Al activarla, en su próximo ingreso el usuario
  vincula Google Authenticator con código QR o con el enlace «Abrir en Google Authenticator» (desde el teléfono).
  Desactivarla desvincula la app y cierra sus sesiones.
- Columna de 2FA (activa / pendiente / inactiva) y de clave (temporal / personal) en la lista.

### Seguridad
- Solo se restablecen clave o 2FA de cuentas creadas por la empresa y que no pertenecen a otra; si el correo ya
  tenía cuenta propia se agrega sin tocar su clave. Todo queda auditado. Pruebas de integración y E2E.

### Corregido
- Alineación de campos en formularios de dos columnas.

## [0.6.0] — 2026-10-26 — Tablero de indicadores y nueva imagen

### Añadido
- Inicio convertido en tablero de indicadores: filtros de período (7/30/90 días) y almacén; tarjetas de
  inventario valorizado, salidas y entradas a costo, compras recibidas (con variación vs. período anterior y
  minigráfico), stock bajo, lotes por vencer, mermas, cobertura y rotación.
- Gráficos: entradas vs. salidas por día, valor del inventario, vencimientos por rango (vencidos resaltados),
  productos con mayor valor, valor por almacén y compras por proveedor; tooltip al pasar el cursor y botón
  "Ver datos" con la tabla de cada gráfico; panel de pendientes.
- Servicio `getDashboardAnalytics` (valores a costo, fechas en la zona horaria de la empresa) con prueba de integración.

### Cambiado
- Toda la aplicación usa la paleta del landing: menú lateral azul marino agrupado con íconos (cajón en móvil),
  botones cian redondeados, tablas con encabezado azul marino, tarjetas redondeadas y fuente Plus Jakarta Sans.
- Páginas de acceso, MFA, empresas, invitación y seguridad con fondo azul marino y logo.

## [0.5.0] — 2026-10-26 — Fase 3: compras y localización

### Añadido
- Proveedores con RIF (validación de formato), contacto y días de crédito.
- Órdenes de compra (borrador → aprobada → recibida parcial → recibida / cancelada) con numeración por empresa,
  impuestos por línea desde alícuotas configurables y totales con redondeo de documento.
- Recepciones con o sin orden, parciales y por lote: gastos adicionales prorrateados por valor, costo puesto en
  almacén, diferencias contra el precio pactado, idempotentes; no se recibe más de lo pendiente.
- Tasas Bs./USD de solo inserción con fuente y referencia; estado "actualizada / desactualizada"; la tasa queda
  congelada en cada orden aprobada y en cada recepción (los históricos no cambian).
- Precio de referencia por producto en USD o Bs. con equivalente a la tasa vigente; proveedor preferido.
- Reposición sugerida (mínimo, demanda de 30 días, cobertura y lo ya pedido) que prellena un borrador de orden.
- Alertas de vencimiento por umbral configurable (3–90 días) y de stock bajo, sin duplicados, por usuario;
  campana en el encabezado; job en el worker y ejecución automática sin worker.
- Configuración de la empresa: moneda base (bloqueada si ya hay valoración), umbral de aprobación, días de
  alerta, correo de alertas, existencias negativas, MFA para todos; alícuotas de impuesto.

## [0.4.0] — 2026-10-26 — Fase 2: inventario

### Añadido
- Unidades base (UND, KG, G, L, ML, M, CM) con conversión exacta por dimensión y presentaciones por producto
  (CAJA, BULTO…); códigos de barra con validación EAN/UPC; búsqueda por SKU o código (lector USB).
- Libro de inventario: movimientos de solo inserción, saldos por almacén y lote sin negativos ante operaciones
  simultáneas, claves de idempotencia (doble clic o reenvío no duplican), reversos auditados, Kardex con saldo.
- Lotes con vencimiento y estados (cuarentena, dañado, retirado); despacho FEFO que excluye vencidos y bloqueados;
  vista de lotes por vencer a 7/15/30/60/90 días con valor.
- Costo promedio ponderado e inventario valorizado.
- Ajustes y mermas con aprobación de otro usuario sobre el umbral; conteos físicos con aprobación.
- Transferencias entre almacenes (borrador → enviada → recibida, cancelación con retorno), plan Profesional+.
- Tablero de inicio con stock bajo, lotes por vencer, valor del inventario, ajustes pendientes y últimas operaciones.

### Corregido
- Formularios: tras un envío exitoso se reconstruyen completos (antes un selector podía mostrar un valor distinto
  del que se enviaba). Mensajes de validación en español.

## [0.3.0] — 2026-10-25

### Añadido
- Nueva landing page: portada con video de fondo (3 clips sin pista de audio, optimizados para web),
  carrusel 01/03 sincronizado con el video, video completo en ventana, menú con desplegables y versión móvil.
- Secciones de funcionalidades (con estado "Disponible" / "Próximamente"), sectores, precios desde la base de
  datos, seguridad, preguntas frecuentes y pie con aviso fiscal.
- Con "reducir movimiento" o ahorro de datos se muestran imágenes fijas en lugar de video.

## [0.2.1] — 2026-10-25

### Corregido / añadido
- Administrador inicial: ignora espacios accidentales en `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`; si el correo
  ya existía sin contraseña, se la asigna; `ADMIN_RESET_PASSWORD=true` la restablece (cierra sesiones, auditado).
- `/api/health` indica si las variables del administrador están configuradas (sin mostrar valores).

## [0.2.0] — 2026-10-25

### Añadido
- Inicio de sesión con correo y contraseña (hash scrypt, límites de intentos, auditoría de fallos).
- Definir y cambiar contraseña desde **Seguridad** (cierra las demás sesiones).
- Administrador inicial creado al desplegar desde variables secretas (`ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`).
- MFA de propietario/administrador configurable (`MFA_ENFORCE_PRIVILEGED_ROLES`); activable por cada usuario desde **Seguridad**.
- Despliegue en Render (Blueprint) y `/api/health` con versión y commit.

### Corregido
- Los formularios ya no se vacían tras un error de validación.
- Falsos positivos del escáner de secretos en CI.

## [0.1.0] — 2026-10-25

### Añadido
- Fase 0 (documentación) y Fase 1 (fundaciones): multiempresa con RLS, Google OIDC y enlace mágico,
  MFA TOTP con códigos de recuperación, sesiones revocables, RBAC, auditoría inmutable, límites de plan,
  respaldo verificado y CI.
