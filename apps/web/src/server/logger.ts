import pino from "pino";

/** Logs estructurados JSON. Nunca registrar secretos, tokens ni códigos. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "retailcontrol-web" },
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.secret",
      "*.code",
      "*.cookie",
      "*.authorization",
      "req.headers.cookie",
      "req.headers.authorization",
      "url",
    ],
    censor: "[REDACTADO]",
  },
});
