// Care Pattern reads and writes for the researcher admin tool (Feature 17).
//
// Every mutation writes a `care_pattern_revisions` row in the SAME transaction as the
// change itself. That is the point of the design: the audit is part of the write, not a
// courtesy call afterwards that an error path could skip. If the revision insert fails,
// the edit rolls back with it — there is no way to change a pattern without leaving a record.
//
// Embedding happens BEFORE the transaction opens, never inside it. An OpenAI call takes
// hundreds of milliseconds and can hang until its timeout; holding row locks across it
// would let one slow upstream request block every other save.

import type { PoolClient } from "pg";
import { dbConnect, dbQuery } from "../db.js";
import type { EmbeddingResult } from "../embeddings.js";

export interface CarePatternInput {
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  sourceRefs: string[];
  localeNotes: Record<string, string>;
}

/**
 * Publication lifecycle (migration 0004). Only `published` patterns are ever retrieved,
 * and a new pattern starts as `draft` — writing one does not put it in front of students.
 */
export type CarePatternStatus = "draft" | "published" | "retired";

export interface CarePatternRecord extends CarePatternInput {
  id: string;
  status: CarePatternStatus;
  /** Which model produced the stored vector; 'placeholder' for --fake seeds. */
  embeddingModel: string | null;
  embeddedAt: string | null;
  /** True when the stored vector does not reflect `situation` — see migration 0002. */
  needsEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RevisionAction = "create" | "update" | "publish" | "retire" | "restore";

export interface Revision {
  id: string;
  action: RevisionAction;
  authorName: string | null;
  authorEmail: string | null;
  before: CarePatternRecord | null;
  after: CarePatternRecord;
  createdAt: string;
}

interface Row {
  id: string;
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  source_refs: string[];
  locale_notes: Record<string, string> | null;
  status: CarePatternStatus;
  embedding_model: string | null;
  embedded_at: Date | null;
  needs_embedding: boolean;
  created_at: Date;
  updated_at: Date;
}

// Note the absence of `embedding`: 1536 floats are never sent to a browser, and never
// written into a revision snapshot where they would dominate the table.
const COLUMNS = `id, title, situation, signals, strategies, avoid, escalation, source_refs,
                 locale_notes, status, embedding_model, embedded_at, needs_embedding,
                 created_at, updated_at`;

function toRecord(row: Row): CarePatternRecord {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    signals: row.signals,
    strategies: row.strategies,
    avoid: row.avoid,
    escalation: row.escalation,
    sourceRefs: row.source_refs,
    localeNotes: row.locale_notes ?? {},
    status: row.status,
    embeddingModel: row.embedding_model,
    embeddedAt: row.embedded_at?.toISOString() ?? null,
    needsEmbedding: row.needs_embedding,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Drafts are always listed — they are the researcher's unfinished work and hiding them
 * would lose it. Only `retired` is filtered out by default, since a withdrawn pattern is
 * something you look up deliberately rather than scroll past every day.
 */
export async function listCarePatterns(includeRetired: boolean): Promise<CarePatternRecord[]> {
  const { rows } = await dbQuery<Row>(
    `select ${COLUMNS} from care_patterns
      ${includeRetired ? "" : "where status <> 'retired'"}
      order by (status = 'retired'), updated_at desc`,
  );
  return rows.map(toRecord);
}

export async function getCarePattern(id: string): Promise<CarePatternRecord | null> {
  const { rows } = await dbQuery<Row>(`select ${COLUMNS} from care_patterns where id = $1`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** Write the audit row. Always called with the same client as the change it records. */
async function recordRevision(
  client: PoolClient,
  patternId: string,
  adminUserId: string,
  action: RevisionAction,
  before: CarePatternRecord | null,
  after: CarePatternRecord,
): Promise<void> {
  await client.query(
    `insert into care_pattern_revisions (care_pattern_id, admin_user_id, action, before, after)
     values ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [patternId, adminUserId, action, before ? JSON.stringify(before) : null, JSON.stringify(after)],
  );
}

/**
 * Run `work` in a transaction, always releasing the client.
 * Every mutation below goes through here so none can forget the rollback.
 */
async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbConnect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * `embedding` is null when the OpenAI call failed. The pattern is still saved — losing a
 * researcher's writing to a transient upstream error would be far worse — but it is flagged
 * `needs_embedding`, which keeps it out of retrieval-quality checks and gets it swept up by
 * `npm run db:reembed -- --stale`. The UI surfaces the flag so it is never a silent state.
 */
export async function createCarePattern(
  input: CarePatternInput,
  embedding: EmbeddingResult | null,
  adminUserId: string,
): Promise<CarePatternRecord> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<Row>(
      `insert into care_patterns
         (title, situation, signals, strategies, avoid, escalation, source_refs, locale_notes,
          embedding, embedding_model, embedded_at, needs_embedding)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::vector, $10, $11, $12)
       returning ${COLUMNS}`,
      [
        input.title,
        input.situation,
        input.signals,
        input.strategies,
        input.avoid,
        input.escalation,
        input.sourceRefs,
        JSON.stringify(input.localeNotes),
        embedding?.vector ?? null,
        embedding?.model ?? null,
        embedding ? new Date() : null,
        embedding === null,
      ],
    );

    const record = toRecord(rows[0]);
    await recordRevision(client, record.id, adminUserId, "create", null, record);
    return record;
  });
}

/**
 * `embedding` is null in two very different cases, which is why the caller decides rather
 * than this function guessing: either `situation` did not change (so the stored vector is
 * still correct and must be kept), or the embedding call failed (so it must be flagged).
 * `keepExistingEmbedding` tells them apart.
 */
export async function updateCarePattern(
  id: string,
  input: CarePatternInput,
  embedding: EmbeddingResult | null,
  keepExistingEmbedding: boolean,
  adminUserId: string,
  before: CarePatternRecord,
): Promise<CarePatternRecord> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<Row>(
      `update care_patterns set
         title = $2,
         situation = $3,
         signals = $4,
         strategies = $5,
         avoid = $6,
         escalation = $7,
         source_refs = $8,
         locale_notes = $9::jsonb,
         embedding = coalesce($10::vector, case when $12 then embedding else null end),
         embedding_model = coalesce($11, case when $12 then embedding_model else null end),
         embedded_at = case when $10::vector is not null then now()
                            when $12 then embedded_at
                            else null end,
         needs_embedding = ($10::vector is null and not $12)
       where id = $1
       returning ${COLUMNS}`,
      [
        id,
        input.title,
        input.situation,
        input.signals,
        input.strategies,
        input.avoid,
        input.escalation,
        input.sourceRefs,
        JSON.stringify(input.localeNotes),
        embedding?.vector ?? null,
        embedding?.model ?? null,
        keepExistingEmbedding,
      ],
    );

    const record = toRecord(rows[0]);
    await recordRevision(client, id, adminUserId, "update", before, record);
    return record;
  });
}

/**
 * Which transition this was, so the audit trail says "published" rather than the vaguer
 * "changed status". Publishing for the first time and bringing something back after it was
 * withdrawn are different events and should read differently in the history.
 */
function transitionAction(from: CarePatternStatus, to: CarePatternStatus): RevisionAction {
  if (to === "retired") return "retire";
  return from === "retired" ? "restore" : "publish";
}

/**
 * Move a pattern through its lifecycle. Nothing is ever deleted: retiring is a soft
 * withdrawal that keeps the row readable, keeps its history, and can be undone — clinical
 * guidance that turned out to be wrong is something you want the record of.
 */
export async function setCarePatternStatus(
  id: string,
  status: CarePatternStatus,
  adminUserId: string,
  before: CarePatternRecord,
): Promise<CarePatternRecord> {
  return inTransaction(async (client) => {
    const { rows } = await client.query<Row>(
      `update care_patterns set status = $2 where id = $1 returning ${COLUMNS}`,
      [id, status],
    );
    const record = toRecord(rows[0]);
    await recordRevision(client, id, adminUserId, transitionAction(before.status, status), before, record);
    return record;
  });
}

export async function listRevisions(patternId: string): Promise<Revision[]> {
  const { rows } = await dbQuery<{
    id: string;
    action: RevisionAction;
    display_name: string | null;
    email: string | null;
    before: CarePatternRecord | null;
    after: CarePatternRecord;
    created_at: Date;
  }>(
    `select r.id, r.action, u.display_name, u.email, r.before, r.after, r.created_at
       from care_pattern_revisions r
       left join admin_users u on u.id = r.admin_user_id
      where r.care_pattern_id = $1
      order by r.created_at desc`,
    [patternId],
  );

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    authorName: r.display_name,
    authorEmail: r.email,
    before: r.before,
    after: r.after,
    createdAt: r.created_at.toISOString(),
  }));
}
