/**
 * Worker de RetailControl (Fase 1: esqueleto).
 * - Jobs idempotentes; cada job por empresa usa forEachActiveTenant (RLS).
 * - Sin Redis: planificación simple por intervalo. En Fase 3 se añade una cola
 *   en PostgreSQL (FOR UPDATE SKIP LOCKED) para alertas de vencimiento.
 */
import { prisma } from "@rc/db";
import { purgeExpiredEphemeralData, runAllTenantAlerts } from "@rc/domain";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "retailcontrol-worker" } });
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60_000);
let stopping = false;

async function tick() {
  const started = Date.now();
  try {
    const purged = await purgeExpiredEphemeralData();
    log.info({ job: "purge-ephemeral", purged, ms: Date.now() - started }, "job completado");
  } catch (err) {
    log.error({ job: "purge-ephemeral", err: { message: (err as Error).message } }, "job falló");
  }
  try {
    const t0 = Date.now();
    const r = await runAllTenantAlerts();
    log.info({ job: "alerts", ...r, ms: Date.now() - t0 }, "job completado");
  } catch (err) {
    log.error({ job: "alerts", err: { message: (err as Error).message } }, "job falló");
  }
}

async function main() {
  log.info({ intervalMs: INTERVAL_MS }, "worker iniciado");
  await tick();
  if (process.argv.includes("--once")) return shutdown();
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    void shutdown();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function shutdown() {
  await prisma.$disconnect();
  log.info("worker detenido");
}

void main();
