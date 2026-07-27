import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ApiError, HealthResponse } from "@innersun/shared";
import { config, isProduction } from "./config.js";

const pkgVersion = "0.1.0";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: isProduction ? "info" : "debug",
      transport: isProduction
        ? undefined
        : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  app.register(cors, { origin: config.webOrigin });

  // Health check — confirms the service is up (DB connectivity added in Feature 3).
  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "@innersun/api", version: pkgVersion };
  });

  // Safe error handler: log the real error, never leak stack traces to clients.
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
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
  const app = buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
