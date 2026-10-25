# Preguntas abiertas

Cada pregunta tiene un **valor predeterminado** adoptado para no bloquear el avance. Cambiarlo es una decisión
de negocio; al resolverse, registrar la respuesta y, si aplica, un ADR.

## Bloqueantes antes de producción (no bloquean el desarrollo)

| Id | Pregunta | Predeterminado actual | Quién decide |
|---|---|---|---|
| Q-BIL-1 | ¿Qué entidad legal vende el SaaS y en qué país está constituida? Determina pasarelas elegibles, facturación propia e impuestos | Cobro manual con conciliación | Dirección + legal |
| Q-BIL-2 | ¿Moneda de cobro (USD, VES o ambas) y cómo se emite la factura del propio SaaS al cliente? | USD de referencia, cobro manual | Dirección + contador |
| Q-INF-1 | ¿Proveedor de nube y región? (latencia desde Venezuela, sanciones/restricciones de servicios, costos) | Sin decidir; nada desplegado | CTO |
| Q-LEG-1 | Aviso de privacidad, términos de servicio y base legal para tratar datos personales | Pendiente de redacción | Legal |
| Q-VE-4 | Si en el futuro se emiten documentos fiscales: ¿qué modalidad autorizada y con qué proveedor homologado? | Fuera del alcance del MVP | Dirección + asesor tributario |

## Producto

| Id | Pregunta | Predeterminado |
|---|---|---|
| Q-PRD-1 | ¿Duración de la prueba gratuita y plan de prueba? | 14 días, plan Básico |
| Q-PRD-2 | ¿Se requiere registro con contraseña además de Google y enlace mágico? | No (menos superficie de ataque); se puede añadir |
| Q-PRD-3 | ¿Tiempo de vida de sesión? | 12 h, renovación cada hora de uso |
| Q-PRD-4 | ¿Una persona puede crear varias empresas? | Sí, hasta 5 por día (límite antiabuso) |
| Q-RBAC-1 | ¿El almacenista registra mermas sin aprobación? | No: merma = ajuste (requiere `inventory.adjust`) |
| Q-RBAC-2 | ¿El comprador puede crear productos al cargar una orden? | No |
| Q-RBAC-3 | ¿Roles personalizables por empresa (plan Empresarial)? | Roles fijos; evaluar en F4 |

## Inventario

| Id | Pregunta | Predeterminado |
|---|---|---|
| Q-INV-1 | Método de valoración por defecto | Costo promedio ponderado; FIFO opcional |
| Q-INV-2 | Productos sin vencimiento en FEFO | Después de los que tienen vencimiento, por fecha de recepción |
| Q-INV-3 | ¿Un lote "vence" al inicio o al final del día de vencimiento? | Al final del día en la zona horaria de la empresa |
| Q-INV-4 | Umbral de aprobación de ajustes | 100 en moneda base (configurable por empresa) |
| Q-INV-5 | ¿Se permite stock negativo en algún caso? | No, salvo política explícita + permiso especial |

## Venezuela

| Id | Pregunta | Predeterminado |
|---|---|---|
| Q-VE-1 | Moneda base contable por defecto | USD (configurable) |
| Q-VE-2 | ¿Se automatiza la tasa BCV? ¿Con qué fuente verificable y con qué permiso de uso? | Carga manual auditada |
| Q-VE-3 | ¿Validar el dígito verificador del RIF? (algoritmo a confirmar con fuente oficial) | Solo formato |
| Q-VE-5 | Regla de redondeo en totales de documentos | 2 decimales, ROUND_HALF_UP |
| Q-VE-6 | Alícuotas de IVA y otros tributos a precargar | Ninguna precargada; configurables |

## Operación

| Id | Pregunta | Predeterminado |
|---|---|---|
| Q-OPS-1 | RPO/RTO comprometidos con clientes | Objetivo interno RPO 24 h / RTO 4 h |
| Q-OPS-2 | Retención de datos tras cancelación | ≥ 12 meses con exportación disponible |
| Q-OPS-3 | Retención de la bitácora de auditoría | Indefinida en MVP; definir con legal |
| Q-OPS-4 | Canal y horario de soporte; proceso de verificación de identidad para recuperar MFA | Correo; verificación fuera de banda + superadmin |
