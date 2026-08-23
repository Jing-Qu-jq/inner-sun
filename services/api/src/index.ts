import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { ApiError, HealthResponse } from "@innersun/shared";
import { config, isProduction, validateConfig } from "./config.js";
import { isDbReachable, pool } from "./db.js";
import { isAppError } from "./errors.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminFaqRoutes } from "./routes/admin-faq.js";
import { registerChatRoutes } from "./routes/chat.js";
import { logRetrievalReadiness } from "./retrieval.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where the built admin app lives. Production copies it into dist/public during the API
 * build; in development it is served straight out of the Vite output so `npm run build:admin`
 * once is enough to exercise the real same-origin setup rather than a dev-server proxy.
 * Returns undefined when neither exists, which is normal before the first admin build.
 */
function findAdminBundle(): string | undefined {
  const candidates = [join(here, "public"), join(here, "..", "..", "..", "apps", "admin", "dist")];
  return candidates.find((path) => existsSync(join(path, "index.html")));
}

const pkgVersion = "0.1.0";

export function buildServer() {
  const app = Fastify({
    /**
     * Behind a hosting platform's load balancer, every request arrives from the proxy, so
     * `request.ip` is the proxy's address unless we opt into the X-Forwarded-* headers.
     * Two things break without this, both quietly:
     *
     *   • @fastify/rate-limit keys on IP, so the login limiter would be a single global
     *     budget shared by everyone — a handful of failed attempts by anyone at all would
     *     lock the researcher out of her own tool.
     *   • `request.protocol` would read "http" behind TLS termination, which is what the
     *     session cookie consults to decide whether to set the Secure flag.
     *
     * Enabled only when hosted. Trusting forwarded headers from an arbitrary local client
     * would let anyone spoof their own IP and sidestep the rate limit entirely.
     */
    trustProxy: Boolean(process.env.PORT),
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
  app.register(cookie);
  // Opt-in rather than global: only the credential-checking routes are limited, so a
  // researcher saving twenty patterns in a burst is never throttled for it.
  app.register(rateLimit, { global: false });

  // Health check — confirms the service is up and reports DB connectivity (Feature 3).
  app.get("/health", async (): Promise<HealthResponse> => {
    const db = (await isDbReachable()) ? "up" : "down";
    return { status: "ok", service: "@innersun/api", version: pkgVersion, db };
  });

  // POST /chat — the orchestrator (Feature 4). Deliberately absent on the hosted admin
  // instance; see config.enableChatRoutes for why. When off, /chat falls through to the
  // 404 handler exactly as an unknown route would.
  if (config.enableChatRoutes) {
    app.register(registerChatRoutes);
    // Say at boot how much of the Care Pattern library retrieval can actually see. An
    // unembedded or unpublished pattern is invisible to the search and reports nothing,
    // so without this the first sign of trouble is students quietly getting generic
    // replies. Deliberately not awaited: it is a report, not a precondition for serving.
    app.ready(() => {
      void logRetrievalReadiness(app.log);
    });
  } else {
    app.log.warn("POST /chat is disabled (ENABLE_CHAT_ROUTES=false) — admin-only instance");
  }

  // Researcher admin tool (Feature 17): API under /admin/api, and the built UI at /admin
  // from the same origin, so the session cookie needs no cross-site handling.
  app.register(registerAdminRoutes);
  app.register(registerAdminFaqRoutes);

  const adminBundle = findAdminBundle();
  if (adminBundle) {
    app.register(fastifyStatic, { root: adminBundle, prefix: "/admin", redirect: true });
  } else {
    app.log.warn("Admin UI bundle not found — run `npm run build:admin`. The /admin/api routes still work.");
  }

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

/** Hostnames that only accept connections originating on this machine. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

async function start() {
  // `PORT` means a hosting platform assigned us one, and such a platform reaches the
  // process from outside the loopback interface. Binding loopback there produces the
  // worst kind of failure: the service starts, logs nothing wrong, answers nothing, and
  // the platform reports only that the health check timed out. Usually this means a
  // stray API_HOST — a committed .env, or one copied from .env.example onto the host.
  if (process.env.PORT && LOOPBACK.has(config.host)) {
    console.warn(
      `\n⚠️  API_HOST is ${config.host} while PORT is set, which is the signature of a\n` +
        "   hosted environment. Nothing outside this container will be able to reach the\n" +
        "   service and the platform's health check will time out with no error logged.\n" +
        "   Unset API_HOST to bind 0.0.0.0, or set it explicitly if this is deliberate.\n",
    );
  }

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
