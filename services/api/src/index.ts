import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { ApiError, HealthResponse, PublicConfig } from "@innersun/shared";
import { config, isProduction, validateConfig } from "./config.js";
import { logChatLimits } from "./chat-limits.js";
import { isDbReachable, pool } from "./db.js";
import { AppError, isAppError } from "./errors.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminFaqRoutes } from "./routes/admin-faq.js";
import { registerChatRoutes } from "./routes/chat.js";
import { logRetrievalReadiness } from "./retrieval.js";
import { logSafetyReadiness } from "./safety.js";
import { logBookingReadiness } from "./booking.js";
import { logCostControls } from "./usage.js";

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

/**
 * Where the built student app lives (Feature 24 AC 2).
 *
 * Same arrangement as the admin bundle above, and for the same reason: served from the API's
 * own origin, so there is one URL and CORS stops being a consideration. Built with
 * `npm run build:web:hosted`, which is the ordinary CRA build with PUBLIC_URL and
 * REACT_APP_API_BASE_URL pointed at the root — the plain `build:web` still targets the
 * GitHub Pages path and is left alone.
 *
 * Returns undefined when neither exists, which is the normal state on the admin-only
 * deployment and during local API work.
 */
function findWebBundle(): string | undefined {
  const candidates = [join(here, "web"), join(here, "..", "..", "..", "apps", "web", "build")];
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
          // The Feature 22 inspector credential. Fastify's default serializer does not log
          // headers at all, so this masks nothing today — which is the point: it is here so
          // that turning on header logging some day cannot quietly start printing a secret.
          'req.headers["x-innersun-inspect"]',
          "req.body",
          "*.apiKey",
          "*.OPENAI_API_KEY",
          "*.INSPECTOR_TOKEN",
          "*.inspectorToken",
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
  app.register(rateLimit, {
    global: false,
    /**
     * Answer a throttled request in the same `{error:{code,message}}` envelope every other
     * failure uses. @fastify/rate-limit throws whatever this returns, so returning an
     * AppError routes it through the handler at the bottom of this file — which matters
     * because both clients read `error.code` and would otherwise see a 429 body they cannot
     * parse, and fall back to "something went wrong" on the one error that has a clear
     * explanation and a clear remedy.
     */
    errorResponseBuilder: (_request, context) =>
      // 403 is the plugin's own status for a banned client; nothing here configures `ban`,
      // so this is a 429 in practice. Taken from the context rather than hardcoded because
      // the plugin's published type omits its `statusCode` field, and inventing a status
      // that disagreed with the headers it already sent would be worse than deriving one.
      new AppError(context.ban ? 403 : 429, "rate_limited", `Too many requests. Try again in ${context.after}.`),
  });

  /**
   * Keep the whole origin out of search results (Feature 24 AC 4).
   *
   * "Private preview" here means unadvertised, not authenticated — there is no login on the
   * student app and there does not need to be one for an audience of one reviewer. What it
   * does need is to not turn up in a search for the practice's name while it is still a
   * preview. `apps/web/public/robots.txt` asks crawlers not to fetch; this header covers
   * anything they fetch anyway, including the admin bundle and any URL someone links to
   * directly, since a robots.txt disallow does not by itself prevent indexing.
   *
   * Feature 21 removes both, deliberately and together: that is most of what "public launch"
   * means.
   */
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
  });

  /**
   * Public, unauthenticated configuration the browser needs before it has anything to send
   * (Feature 11).
   *
   * Only one field so far: where a student goes to book a real counselor. The chat page gets
   * that link attached to the turn that nudges, because the server is what decided to nudge —
   * but the home page's "Talk to a human" button has no turn to ride on and still has to lead
   * somewhere real. Serving it from here rather than baking a second copy into `REACT_APP_*`
   * keeps ONE source of truth: a link that changes changes in one place, and a static build
   * cannot go stale against the running API.
   *
   * Everything here is public by construction — a scheduling link is meant to be handed out.
   * Nothing that is secret, per-user, or expensive to compute may be added to this response;
   * the inspector's payload deliberately went the other way, gated behind a credential on the
   * one endpoint that already knew who was asking.
   *
   * Registered outside `enableChatRoutes` because it is app configuration rather than a chat
   * feature, and because a booking link is exactly the sort of thing an instance with chat
   * switched off might still want to hand out.
   */
  app.get("/public-config", async (): Promise<PublicConfig> => {
    // Absent rather than empty when unset, so the client's check is "is there a link?" and
    // not "is the link the empty string?" — the same shape as `crisis` and `booking` on a
    // chat response, and the same reason: presence is the signal.
    return config.booking.url ? { bookingUrl: config.booking.url } : {};
  });

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
      // The Feature 8 cost controls, for the same reason: model tiering, the token caps, the
      // history window and prompt caching all fail by being quietly expensive rather than by
      // breaking, so each is stated once at boot where it can be read against the intent.
      logCostControls(app.log);
      // And the Feature 9 safety layer. Same reasoning again, with more at stake: a lexicon
      // that failed to load or a classifier prompt missing from dist/ produces a service
      // that answers every message beautifully and screens none of them.
      logSafetyReadiness(app.log);
      // And the Feature 11 funnel. Its silent failure is the mirror image of the safety
      // layer's: with BOOKING_URL unset the service builds trust exactly as designed and
      // then never once asks the question the business depends on.
      logBookingReadiness(app.log);
      // And the Feature 24 limits, which are what allow this route to be served on a public
      // URL at all. They fail in both directions without a symptom: too loose and the
      // protection is decorative, too tight and a reviewer's demo stops mid-conversation.
      logChatLimits(app.log);
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

  /**
   * The student app at the origin root (Feature 24 AC 2).
   *
   * Registered AFTER the admin bundle and after every declared route, because this one owns
   * the `/*` wildcard. Fastify's router prefers a literal segment to a wildcard, so
   * `/health`, `/chat`, `/public-config`, `/inspect` and everything under `/admin` still win;
   * this catches what is left, which is the bundle's own assets.
   *
   * `decorateReply: false` when the admin bundle is already registered: @fastify/static adds
   * `reply.sendFile`, and adding it twice is an error rather than a no-op.
   *
   * No SPA history fallback is needed. The app routes with a HashRouter, so every URL a
   * student can reach is `/` with a fragment the server never sees.
   */
  const webBundle = findWebBundle();
  if (webBundle) {
    app.register(fastifyStatic, { root: webBundle, prefix: "/", decorateReply: !adminBundle });
  } else if (config.enableChatRoutes) {
    app.log.warn(
      "Student app bundle not found — run `npm run build:web:hosted`. The API still serves POST /chat.",
    );
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
