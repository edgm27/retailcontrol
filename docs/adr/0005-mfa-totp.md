# ADR-0005 — MFA TOTP propio sobre otplib, secretos cifrados y códigos con HMAC

**Estado**: Aceptado · **Fecha**: 2026-10-25

## Decisión
- TOTP RFC 6238 (SHA-1, 6 dígitos, 30 s, ±1 paso) con **otplib 13** (criptografía @noble); compatible con Google
  Authenticator. Verificado con los vectores oficiales del RFC 6238.
- Secreto de 160 bits **cifrado con AES-256-GCM** (`MFA_ENCRYPTION_KEY`), AAD = id de usuario, formato versionado `v1.`.
- Enrolamiento pendiente hasta confirmar con un código válido; el QR se genera en el servidor (data URL).
- **Anti-replay**: se guarda `last_used_step`; un paso igual o anterior se rechaza. La fila se bloquea
  (`FOR UPDATE`) para serializar intentos concurrentes.
- **Bloqueo**: 5 fallos → 15 minutos. Los fallos se confirman en la BD aunque la operación falle y se auditan.
- **10 códigos de recuperación** de un solo uso (≈ 49 bits cada uno) almacenados como HMAC-SHA256 con pimienta
  (`RECOVERY_CODE_PEPPER`); consumo atómico (`UPDATE … WHERE used_at IS NULL`). Regenerar exige TOTP.
- MFA obligatorio para Propietario, Administrador y roles de plataforma; desactivarlo exige TOTP y solo es
  posible si ningún rol lo exige. Recuperación asistida solo por superadmin, con justificación, revocando todas
  las sesiones.
- RLS por usuario en `mfa_totp` y `recovery_codes`.

## Consecuencias
+ Control total de las reglas (replay, bloqueo, auditoría) y pruebas propias. − Código de seguridad propio que
mantener; mitigado con librería auditada para el algoritmo y pruebas exhaustivas.

## Pendiente
WebAuthn/passkeys como segundo factor adicional; job de re-cifrado para rotar la clave (`v2.`).
