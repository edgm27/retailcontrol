# Checklist de salida a producción

Estado al 2026-10-27 (v0.9.0). ✅ hecho y con evidencia · 🟡 parcial · ⏳ pendiente · 💲 requiere contratar un servicio
(no se contrata nada sin su aprobación).

## Producto y calidad
| Ítem | Estado | Evidencia / nota |
|---|---|---|
| 12 pruebas de aceptación del PRD | ✅ | [roadmap.md](roadmap.md) (tabla de aceptación) |
| CI en verde (tipos, lint, unitarias, integración con PostgreSQL real, respaldo, E2E, secretos, dependencias) | ✅ | `.github/workflows/ci.yml` |
| Accesibilidad automática WCAG 2.2 AA (axe) | ✅ | [accessibility.md](accessibility.md) |
| Revisión manual de accesibilidad (teclado, lector de pantalla) | ⏳ | — |
| Rendimiento p95 < 500 ms (50 000 productos) | 🟡 | 8/10 pantallas; tablero y ABC de 90 días ~0,75 s ([performance.md](performance.md)) |
| Medición de rendimiento en el servidor de producción | ⏳ | — |

## Seguridad
| Ítem | Estado | Evidencia / nota |
|---|---|---|
| Aislamiento entre empresas (RLS forzado, pruebas) | ✅ | [tenant-isolation.md](tenant-isolation.md) |
| MFA obligatorio para propietario/administrador | 🟡 | Implementado; **desactivado en Render** para pruebas (`MFA_ENFORCE_PRIVILEGED_ROLES=false`). Activar antes de clientes reales |
| CSP con nonce y cabeceras de seguridad | ✅ | E2E `auth-mfa.spec.ts` |
| Escaneo de secretos y dependencias | ✅ | gitleaks + `pnpm audit` + CodeQL en CI |
| Pentest externo | ⏳💲 | Contratar un tercero antes de clientes con datos reales |
| Quitar `ADMIN_INITIAL_PASSWORD` / `ADMIN_RESET_PASSWORD` de Render tras el primer ingreso | ⏳ | Acción del administrador |
| Rotación de secretos documentada | ✅ | [runbooks/rotacion-de-secretos.md](runbooks/rotacion-de-secretos.md) |

## Infraestructura (Render)
| Ítem | Estado | Nota |
|---|---|---|
| Base de datos con respaldos automáticos y PITR | ⏳💲 | El plan **gratuito** de Render no tiene respaldos y la base gratuita **expira**. Pasar a un plan de pago |
| Servicio web sin suspensión por inactividad | ⏳💲 | El plan gratuito se duerme (primer acceso lento) |
| Dominio propio + TLS | ⏳💲 | Configurar en Render y actualizar `AUTH_URL` |
| Correo transaccional (SMTP) | ⏳💲 | Necesario para enlaces de acceso y alertas por correo (`EMAIL_TRANSPORT=smtp`) |
| Monitor externo de `/api/health` y alertas | ⏳ | Hay servicios gratuitos; ver [observability.md](observability.md) |
| Logs con retención y trazas (OpenTelemetry) | 🟡 | Soportado por variables; falta elegir proveedor |
| Infraestructura como código | 🟡 | `render.yaml` (Blueprint); sin entornos staging/producción separados |
| Entorno de staging | ⏳💲 | Recomendado para probar migraciones antes de producción |

## Operación
| Ítem | Estado | Evidencia |
|---|---|---|
| Runbooks: incidentes, respaldo/restauración, despliegue/rollback, secretos | ✅ | [runbooks/](runbooks/) |
| Prueba de restauración de respaldo | ✅ (local/CI) | `pnpm backup:test`; repetir con la base de producción |
| Instrucciones de pago reales en el panel de plataforma | ⏳ | Acción del superadministrador |
| Términos de servicio y política de privacidad | ⏳ | Requiere asesoría legal |
| Facturación fiscal del servicio SaaS (SENIAT) | ⏳ | Fuera del sistema; asesoría contable/legal |

**Recomendación**: no recibir clientes con datos reales hasta cerrar los ítems 💲 de infraestructura (base de datos
de pago con respaldos, servicio sin suspensión, SMTP), activar el MFA obligatorio y hacer el pentest.
