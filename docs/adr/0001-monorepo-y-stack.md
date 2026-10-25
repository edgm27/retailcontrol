# ADR-0001 — Monorepo pnpm con Next.js 15, TypeScript y Tailwind

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Contexto
Se necesita un producto web responsive, con servidor y UI en un solo lenguaje, compartir reglas entre la app y
un worker, y un despliegue inicial simple.

## Decisión
- Monorepo **pnpm workspaces**: `apps/web`, `apps/worker`, `packages/{db,domain,ui,config}`. Sin Turborepo
  (innecesario a este tamaño).
- **Next.js 15.5** (App Router, Server Components, Server Actions) con React 19.1 y TypeScript 5.9 estricto.
  Next.js 16 ya existe; se eligió la línea 15 por madurez y compatibilidad conocida con Auth.js v5. Migrar a 16
  es una tarea planificada, no urgente.
- **Tailwind CSS v4** + componentes propios estilo shadcn/ui en `packages/ui` (código propio, sin dependencia de
  runtime de shadcn).
- Los paquetes internos se consumen como código fuente TypeScript (`transpilePackages`), sin paso de build.
- `packages/domain` contiene reglas puras **y** servicios con acceso a datos, para que web y worker usen
  exactamente la misma autorización (desviación consciente de un dominio 100 % puro).

## Consecuencias
+ Un solo lenguaje y tipos compartidos de punta a punta. + Pocas piezas que desplegar.
− Acoplamiento a Next.js en la capa web (mitigado: la lógica vive en `packages/domain`).

## Alternativas
NestJS + SPA (más piezas), Remix/React Router (equipo menos familiarizado), Next.js 16 (más reciente, menos rodado).
