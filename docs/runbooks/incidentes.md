# Runbook: respuesta a incidentes

**Severidades**: S1 servicio caído o fuga de datos · S2 función crítica degradada (inventario, login) · S3 menor.

1. **Detectar y registrar**: abra un registro del incidente (hora, quién, síntoma, severidad). Para S1 avise al
   responsable de seguridad y al CTO de inmediato.
2. **Contener**
   - Servicio caído: revise `/api/health` y los logs del servicio (Render → Logs). Si fue un despliegue, haga
     *rollback* ([despliegue-y-rollback.md](despliegue-y-rollback.md)).
   - Sospecha de acceso indebido: revoque sesiones del usuario afectado (Seguridad → Cerrar todas, o Usuarios →
     Desactivar), rote secretos ([rotacion-de-secretos.md](rotacion-de-secretos.md)) y conserve logs.
   - Sospecha de fuga entre empresas: S1. Suspenda el acceso de la empresa afectada desde el panel de plataforma si
     es necesario, conserve evidencia (`audit_events`, logs) y ejecute las pruebas de aislamiento.
3. **Erradicar y recuperar**: corrija la causa; si hubo pérdida de datos, restaure ([respaldo-y-restauracion.md](respaldo-y-restauracion.md)).
4. **Comunicar**: a las empresas afectadas, con hechos verificados, sin especular. Si hubo datos personales
   comprometidos, evalúe obligaciones legales de notificación con asesoría.
5. **Lecciones aprendidas** (≤ 5 días): causa raíz, línea de tiempo, acciones con responsable y fecha.

Evidencia útil: `audit_events` (inmutable), logs con `correlationId`, historial de despliegues, `pg_stat_activity`.
