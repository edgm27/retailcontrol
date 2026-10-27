import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
export const MAILBOX_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "test-results/.mailbox");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-VE",
    timezoneId: "America/Caracas",
    trace: "retain-on-failure",
    // Cámara simulada (sin diálogo de permiso) para probar el escáner de la recepción.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ALLOW_DEV_MAILBOX: "1",
      EMAIL_TRANSPORT: "dev-file",
      DEV_MAILBOX_DIR: MAILBOX_DIR,
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: "true",
      // Muestra «Crear empresa de demostración» a todos (solo en pruebas).
      DEMO_DATA_ENABLED: "true",
    },
  },
});
