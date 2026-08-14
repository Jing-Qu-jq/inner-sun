import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ApiError, HealthResponse } from "@innersun/shared";
import { config, isProduction, validateConfig } from "./config.js";
import { isDbReachable, pool } from "./db.js";
import { isAppError } from "./errors.js";
import { registerChatRoutes } from "./routes/chat.js";

const pkgVersion = "0.1.0";

export function buildServer() {
  const app = Fastify({
    // Fastify's ajv defaults are lenient in two ways that hide client bugs:
    // coerceTypes turns `{"message": 123}` into the string "123", and
    // removeAdditional silently drops properties the schema does not declare,
    // so a misspelled field looks like it worked. Both are turned off, which is
    // what makes `additionalProperties: false` and the declared types actually
    // reject bad input with a 400 instead of quietly repairing it.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    logger: {
      level: isProduction ? "info" : "debug",
      // Belt and braces: nothing should put a secret or a request body into a
      // log line, but if something ever does, it is masked rather than written.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body",
          "*.apiKey",
          "*.OPENAI_API_KEY",
        ],
        censor: "[redacted]",
      },
      transport: isProduction
        ? undefined
        : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  app.register(cors, { origin: config.webOrigin });

  // Health check — confirms the service is up and reports DB connectivity (Feature 3).
  app.get("/health", async (): Promise<HealthResponse> => {
    const db = (await isDbReachable()) ? "up" : "down";
    return { status: "ok", service: "@innersun/api", version: pkgVersion, db };
  });

  // POST /chat — the orchestrator (Feature 4).
  app.register(registerChatRoutes);

  // Close the DB pool when the server shuts down.
  app.addHook("onClose", async () => {
    await pool.end();
  });

  // Safe error handler: log the real error, never leak stack traces to clients.
  //
  // Three cases, in order of how much the client is told:
  //  - AppError    — we chose this message deliberately; send it as-is.
  //  - validation  — Fastify's own "body/message must be string"; useful and safe.
  //  - anything else — an unplanned failure, so the client gets a generic 500
  //    while the full error (including an AppError's `cause`) goes to the log.
  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "request failed");

    if (isAppError(err)) {
      const body: ApiError = { error: { code: err.code, message: err.publicMessage } };
      reply.status(err.statusCode).send(body);
      return;
    }

    if (err.validation) {
      const body: ApiError = { error: { code: "bad_request", message: err.message } };
      reply.status(400).send(body);
      return;
    }

    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const body: ApiError = {
      error: {
        code: statusCode >= 500 ? "internal_error" : "bad_request",
        message: statusCode >= 500 ? "Something went wrong." : err.message,
      },
    };
    reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    const body: ApiError = { error: { code: "not_found", message: "Route not found." } };
    reply.status(404).send(body);
  });

  return app;
}

async function start() {
  // Check configuration before binding a port: a server that boots and then
  // fails every request is harder to diagnose than one that says why up front.
  const problems = validateConfig();
  if (problems.length > 0) {
    console.error("Cannot start @innersun/api — configuration problems:");
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error("\nSee .env.example at the repo root for the full list of variables.");
    process.exit(1);
  }

  const app = buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
