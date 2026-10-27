# Accesibilidad (WCAG 2.2 AA)

## Automatizado (en CI)

[`apps/web/e2e/accesibilidad.spec.ts`](../apps/web/e2e/accesibilidad.spec.ts) ejecuta **axe-core** con las reglas
WCAG 2.0/2.1/2.2 A y AA en: landing, login, Inicio, Inventario, Productos, Importar, Lotes, Compras, Reportes (ABC y
existencias), Usuarios, Suscripción y Seguridad, en vista de celular. Resultado v0.9.0: **0 violaciones**.

Corregido en esta fase: contraste insuficiente de los subtítulos cian del landing (#0e9aa7 → #0b6f7f, 5,8:1).

Ya incorporado en el diseño: enlace «Saltar al contenido», foco visible, etiquetas en todos los campos, tablas con
encabezados `scope`, gráficos con texto alternativo y vista de tabla («Ver datos»), estados no solo por color
(insignias con texto), menú móvil como diálogo modal con cierre por Escape.

## Pendiente (revisión manual)

axe detecta solo una parte de los problemas. Falta, antes de declarar conformidad:
- Recorrido completo con teclado y con lector de pantalla (NVDA/Windows y TalkBack/Android).
- Pantallas con datos reales (las pruebas automáticas usan una empresa nueva con pocos datos).
- Zoom al 200 % y orientación horizontal en celular.
No se afirma conformidad WCAG hasta completar esta revisión.
