# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado semántico.

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
