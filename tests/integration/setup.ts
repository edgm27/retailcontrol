import { testAppUrl } from "./db-urls";

// Debe ejecutarse antes de importar @rc/db: el cliente Prisma lee DATABASE_URL al crearse.
process.env.DATABASE_URL = testAppUrl();
// Pool pequeño para forzar la reutilización de conexiones (prueba de fugas de contexto).
const u = new URL(process.env.DATABASE_URL);
u.searchParams.set("connection_limit", "3");
process.env.DATABASE_URL = u.toString();

// Las pruebas negativas provocan errores esperados de PostgreSQL; no ensuciar la salida.
process.env.PRISMA_QUIET = "1";
