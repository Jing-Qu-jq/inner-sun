// Canned response (FAQ) editing for the admin tool (Feature 17 AC 6).
//
// Feature 3's schema comment already called this table "DB-backed so non-engineers can
// edit without a deploy" — this is the half that makes that true. Feature 10 builds the
// student-facing half: quick-reply chips that return these answers with no model call.
//
// Simpler than Care Patterns on purpose: no embedding (these are matched by key, never by
// similarity) and no revision history (the audit requirement is about clinical guidance,
// and an FAQ answer is recoverable in a way a researcher's reasoning is not).

import type { FastifyInstance } from "fastify";
import { LOCALES } from "@innersun/shared";
import { dbQuery } from "../db.js";
import { AppError } from "../errors.js";
import { requireActiveAdmin } from "../admin/sessions.js";

const MAX_TEXT = 2000;

/** Both halves are keyed by locale, validated against the shared list. */
const bilingualText = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(LOCALES.map((l) => [l, { type: "string", maxLength: MAX_TEXT }])),
} as const;

const bodySchema = {
  type: "object",
  required: ["key", "answer"],
  additionalProperties: false,
  properties: {
    // Stable identifier the chat UI will reference, e.g. 'is_confidential'. Constrained
    // to a slug so it stays usable as a lookup key and safe in a URL.
    key: { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z0-9_]+$" },
    question: bilingualText,
    answer: bilingualText,
  },
} as const;

const idParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

interface Row {
  id: string;
  key: string;
  question: Record<string, string> | null;
  answer: Record<string, string> | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CannedResponseBody {
  key: string;
  question?: Record<string, string>;
  answer: Record<string, string>;
}

function toRecord(row: Row) {
  return {
    id: row.id,
    key: row.key,
    question: row.question ?? {},
    answer: row.answer ?? {},
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = "id, key, question, answer, is_active, created_at, updated_at";

/**
 * `key` is unique, so a duplicate is a 23505 from Postgres. Caught and turned into a
 * readable 409 — the researcher should see "that key is taken", not a database error.
 */
function asConflict(err: unknown): never {
  if ((err as { code?: string })?.code === "23505") {
    throw new AppError(409, "duplicate_key", "Another answer already uses that key.");
  }
  throw err;
}

export async function registerAdminFaqRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { includeRetired?: string } }>(
    "/admin/api/canned-responses",
    { preHandler: requireActiveAdmin },
    async (request) => {
      const { rows } = await dbQuery<Row>(
        `select ${COLUMNS} from canned_responses
         ${request.query.includeRetired === "true" ? "" : "where is_active"}
         order by is_active desc, key`,
      );
      return { cannedResponses: rows.map(toRecord) };
    },
  );

  app.post<{ Body: CannedResponseBody }>(
    "/admin/api/canned-responses",
    { preHandler: requireActiveAdmin, schema: { body: bodySchema } },
    async (request, reply) => {
      try {
        const { rows } = await dbQuery<Row>(
          `insert into canned_responses (key, question, answer)
           values ($1, $2::jsonb, $3::jsonb)
           returning ${COLUMNS}`,
          [request.body.key, JSON.stringify(request.body.question ?? {}), JSON.stringify(request.body.answer)],
        );
        request.log.info({ adminUserId: request.admin!.id, key: request.body.key }, "canned response created");
        reply.status(201);
        return { cannedResponse: toRecord(rows[0]) };
      } catch (err) {
        asConflict(err);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: CannedResponseBody }>(
    "/admin/api/canned-responses/:id",
    { preHandler: requireActiveAdmin, schema: { params: idParamsSchema, body: bodySchema } },
    async (request) => {
      try {
        const { rows } = await dbQuery<Row>(
          `update canned_responses
              set key = $2, question = $3::jsonb, answer = $4::jsonb
            where id = $1
            returning ${COLUMNS}`,
          [
            request.params.id,
            request.body.key,
            JSON.stringify(request.body.question ?? {}),
            JSON.stringify(request.body.answer),
          ],
        );
        if (!rows[0]) {
          throw new AppError(404, "not_found", "That answer no longer exists.");
        }
        request.log.info({ adminUserId: request.admin!.id, key: request.body.key }, "canned response updated");
        return { cannedResponse: toRecord(rows[0]) };
      } catch (err) {
        asConflict(err);
      }
    },
  );

  for (const [suffix, isActive] of [
    ["retire", false],
    ["restore", true],
  ] as const) {
    app.post<{ Params: { id: string } }>(
      `/admin/api/canned-responses/:id/${suffix}`,
      { preHandler: requireActiveAdmin, schema: { params: idParamsSchema } },
      async (request) => {
        const { rows } = await dbQuery<Row>(
          `update canned_responses set is_active = $2 where id = $1 returning ${COLUMNS}`,
          [request.params.id, isActive],
        );
        if (!rows[0]) {
          throw new AppError(404, "not_found", "That answer no longer exists.");
        }
        request.log.info({ adminUserId: request.admin!.id, id: request.params.id }, `canned response ${suffix}d`);
        return { cannedResponse: toRecord(rows[0]) };
      },
    );
  }
}
