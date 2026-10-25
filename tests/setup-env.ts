// Claves FICTICIAS solo para pruebas (no son secretos de ningún entorno).
process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.RECOVERY_CODE_PEPPER ??= "pimienta-de-prueba-no-usar-en-produccion-0123456789";
