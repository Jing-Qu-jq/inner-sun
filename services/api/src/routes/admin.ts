// Researcher admin API (Feature 17), mounted under /admin/api.
//
// Auth here is deliberately separate from the student authentication Feature 12 will add:
// students are anonymous-first and most never create an account, while these are a closed
// list of colleagues who can rewrite the clinical knowledge base. See migration 0003.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LOCALES } from "@innersun/shared";
import { dbQuery } from "../db.js";
import { embedSituation } from "../embeddings.js";
import { AppError } from "../errors.js";
import {
  createCarePattern,
  getCarePattern,
  listCarePatterns,
  listRevisions,
  setCarePatternStatus,
  updateCarePattern,
  type CarePatternInput,
  type CarePatternRecord,
} from "../admin/care-patterns.js";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../admin/passwords.js";
import {
  createSession,
  destroyAllSessionsFor,
  destroySession,
  pruneExpiredSessions,
  requireActiveAdmin,
  requireAdmin,
} from "../admin/sessions.js";

/**
 * A real hash to check against when the email does not exist. Without it the "no such
 * user" path returns immediately while the "wrong password" path spends ~100ms hashing,
 * and that difference is a reliable oracle for which email addresses have accounts.
 * Computed once at startup from a value nothing can authenticate with.
 */
let decoyHash: string | undefined;
async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hashPassword(`decoy-${Math.random()}-${Date.now()}`);
  return decoyHash;
}

const MAX_TEXT = 4000;
const MAX_ITEMS = 30;

const stringArray = {
  type: "array",
  maxItems: MAX_ITEMS,
  items: { type: "string", minLength: 1, maxLength: MAX_TEXT },
} as const;

/**
 * Locale keys are validated against the shared LOCALES list rather than a hand-written
 * enum, so adding a language cannot leave this schema silently rejecting it.
 */
const localeNotesSchema = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(LOCALES.map((l) => [l, { type: "string", maxLength: MAX_TEXT }])),
} as const;

const carePatternBodySchema = {
  type: "object",
  required: ["title", "situation"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    situation: { type: "string", minLength: 1, maxLength: MAX_TEXT },
    signals: stringArray,
    strategies: stringArray,
    avoid: stringArray,
    escalation: { type: "string", maxLength: MAX_TEXT },
    sourceRefs: stringArray,
    localeNotes: localeNotesSchema,
  },
} as const;

const idParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

interface CarePatternBody {
  title: string;
  situation: string;
  signals?: string[];
  strategies?: string[];
  avoid?: string[];
  escalation?: string;
  sourceRefs?: string[];
  localeNotes?: Record<string, string>;
}

function toInput(body: CarePatternBody): CarePatternInput {
  return {
    title: body.title.trim(),
    situation: body.situation.trim(),
    signals: body.signals ?? [],
    strategies: body.strategies ?? [],
    avoid: body.avoid ?? [],
    escalation: body.escalation ?? "",
    sourceRefs: body.sourceRefs ?? [],
    localeNotes: body.localeNotes ?? {},
  };
}

/** Machine-readable, so the UI picks the wording (the Feature 5 error-code lesson). */
type EmbeddingStatus = "embedded" | "unchanged" | "failed";

/**
 * Decide whether this save needs a new vector, and produce it.
 *
 * Skipping the call when `situation` is untouched is what makes editing the strategies of
 * a pattern free — the researcher will do that far more often than rewriting the situation.
 *
 * A failure here does NOT fail the save. Discarding someone's writing because OpenAI
 * blipped would be the worse outcome; the pattern is stored and flagged instead, and the
 * flag is surfaced rather than left silent, because an unembedded pattern is invisible
 * to retrieval while looking perfectly healthy in the list.
 */
async function resolveEmbedding(
  request: FastifyRequest,
  situation: string,
  before: CarePatternRecord | null,
): Promise<{ embedding: Awaited<ReturnType<typeof embedSituation>> | null; keepExisting: boolean; status: EmbeddingStatus }> {
  const unchanged =
    before !== null &&
    before.situation === situation &&
    !before.needsEmbedding &&
    before.embeddedAt !== null;

  if (unchanged) {
    return { embedding: null, keepExisting: true, status: "unchanged" };
  }

  try {
    return { embedding: await embedSituation(situation), keepExisting: false, status: "embedded" };
  } catch (err) {
    // Full detail to the log; the client gets only the status code.
    request.log.error({ err }, "care pattern saved without an embedding");
    return { embedding: null, keepExisting: false, status: "failed" };
  }
}

async function loadOr404(id: string): Promise<CarePatternRecord> {
  const pattern = await getCarePattern(id);
  if (!pattern) {
    throw new AppError(404, "not_found", "That Care Pattern no longer exists.");
  }
  return pattern;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ---- Authentication -------------------------------------------------------

  app.post<{ Body: { email: string; password: string } }>(
    "/admin/api/login",
    {
      // A login form on the public internet gets brute-forced. Keyed per IP, this makes
      // an online guessing attack pointless against the high-entropy generated passwords
      // that admin:create issues, without locking out a colleague who mistypes twice.
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", minLength: 3, maxLength: 320 },
            password: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();

      const { rows } = await dbQuery<{
        id: string;
        email: string;
        password_hash: string;
        display_name: string;
        role: "researcher" | "admin";
        is_active: boolean;
        must_change_password: boolean;
      }>(
        `select id, email, password_hash, display_name, role, is_active, must_change_password
           from admin_users where email = $1`,
        [email],
      );

      const user = rows[0];
      const ok = await verifyPassword(request.body.password, user?.password_hash ?? (await getDecoyHash()));

      // One message for every failure — wrong email, wrong password, deactivated account.
      // Telling them apart would confirm which addresses have accounts.
      if (!user || !ok || !user.is_active) {
        request.log.warn({ email }, "failed admin login");
        throw new AppError(401, "invalid_credentials", "That email and password don't match.");
      }

      await dbQuery("update admin_users set last_login_at = now() where id = $1", [user.id]);
      await createSession(reply, user.id);
      await pruneExpiredSessions();

      request.log.info({ adminUserId: user.id }, "admin signed in");

      return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        mustChangePassword: user.must_change_password,
      };
    },
  );

  app.post("/admin/api/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    await destroySession(request, reply);
    return { ok: true };
  });

  app.get("/admin/api/me", { preHandler: requireAdmin }, async (request) => request.admin);

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    "/admin/api/password",
    {
      preHandler: requireAdmin,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          additionalProperties: false,
          properties: {
            currentPassword: { type: "string", minLength: 1, maxLength: 400 },
            newPassword: { type: "string", minLength: 1, maxLength: 400 },
          },
        },
      },
    },
    async (request, reply) => {
      const admin = request.admin!;

      const { rows } = await dbQuery<{ password_hash: string }>(
        "select password_hash from admin_users where id = $1",
        [admin.id],
      );
      if (!rows[0] || !(await verifyPassword(request.body.currentPassword, rows[0].password_hash))) {
        throw new AppError(400, "wrong_password", "Your current password is not correct.");
      }

      const problem = validatePasswordStrength(request.body.newPassword);
      if (problem) {
        throw new AppError(400, "weak_password", problem);
      }

      await dbQuery(
        "update admin_users set password_hash = $2, must_change_password = false where id = $1",
        [admin.id, await hashPassword(request.body.newPassword)],
      );

      // Everything opened with the old password ends, including this browser — then a
      // fresh session is issued so the person who just changed it stays signed in.
      await destroyAllSessionsFor(admin.id);
      await createSession(reply, admin.id);

      request.log.info({ adminUserId: admin.id }, "admin password changed");
      return { ok: true };
    },
  );

  // ---- Care Patterns --------------------------------------------------------

  app.get<{ Querystring: { includeRetired?: string } }>(
    "/admin/api/care-patterns",
    { preHandler: requireActiveAdmin },
    async (request) => ({
      patterns: await listCarePatterns(request.query.includeRetired === "true"),
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/admin/api/care-patterns/:id",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema } },
    async (request) => ({ pattern: await loadOr404(request.params.id) }),
  );

  app.post<{ Body: CarePatternBody }>(
    "/admin/api/care-patterns",
    { preHandler: requireActiveAdmin, schema: { body: carePatternBodySchema } },
    async (request, reply) => {
      const input = toInput(request.body);
      const { embedding, status } = await resolveEmbedding(request, input.situation, null);
      const pattern = await createCarePattern(input, embedding, request.admin!.id);

      request.log.info({ adminUserId: request.admin!.id, patternId: pattern.id, status }, "care pattern created");
      reply.status(201);
      return { pattern, embeddingStatus: status };
    },
  );

  app.put<{ Params: { id: string }; Body: CarePatternBody }>(
    "/admin/api/care-patterns/:id",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema, body: carePatternBodySchema } },
    async (request) => {
      const before = await loadOr404(request.params.id);
      const input = toInput(request.body);
      const { embedding, keepExisting, status } = await resolveEmbedding(request, input.situation, before);

      const pattern = await updateCarePattern(
        request.params.id,
        input,
        embedding,
        keepExisting,
        request.admin!.id,
        before,
      );

      request.log.info(
        { adminUserId: request.admin!.id, patternId: pattern.id, status },
        "care pattern updated",
      );
      return { pattern, embeddingStatus: status };
    },
  );

  /**
   * Publish is the deliberate act that makes a pattern retrievable. It covers both first
   * publication and bringing a retired one back; the revision history tells them apart.
   *
   * A pattern with no usable embedding cannot be published: it would sit in `published`
   * looking live while being unreachable by the matcher, which is precisely the silent
   * failure the rest of this feature exists to prevent. Better a clear refusal here.
   */
  app.post<{ Params: { id: string } }>(
    "/admin/api/care-patterns/:id/publish",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema } },
    async (request) => {
      const before = await loadOr404(request.params.id);
      if (before.needsEmbedding || !before.embeddedAt) {
        throw new AppError(
          409,
          "not_indexed",
          "This pattern isn't indexed yet, so publishing it would have no effect. Save it again to index it first.",
        );
      }

      const pattern = await setCarePatternStatus(request.params.id, "published", request.admin!.id, before);
      request.log.info(
        { adminUserId: request.admin!.id, patternId: pattern.id, from: before.status },
        "care pattern published",
      );
      return { pattern };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/api/care-patterns/:id/retire",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema } },
    async (request) => {
      const before = await loadOr404(request.params.id);
      const pattern = await setCarePatternStatus(request.params.id, "retired", request.admin!.id, before);
      request.log.info({ adminUserId: request.admin!.id, patternId: pattern.id }, "care pattern retired");
      return { pattern };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/admin/api/care-patterns/:id/revisions",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema } },
    async (request) => ({ revisions: await listRevisions(request.params.id) }),
  );
}
