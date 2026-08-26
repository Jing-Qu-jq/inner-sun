/**
 * Shared types for InnerSun, consumed by both the API and (later) the web app.
 *
 * These are intentionally minimal for Phase 0 scaffolding; fields will be
 * fleshed out as the corresponding features land (see docs/PLAN.md).
 */

/**
 * Supported UI / reply languages. Extensible — add a code and a resource file.
 *
 * Exported as a runtime array as well as a type so that request validation can
 * check against the very same list the type is derived from; a JSON-schema enum
 * written out by hand would drift the first time a locale is added.
 */
export const LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];

/** Locale used when a client does not ask for one. */
export const DEFAULT_LOCALE: Locale = "en";

/** A single turn in a conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A researcher-authored Care Pattern: a situation and the strategy for it.
 * This is the proprietary clinical knowledge the RAG pipeline retrieves.
 * Authored in English; see docs/ARCHITECTURE.md and PLAN.md Feature 6.
 */
export interface CarePattern {
  id: string;
  title: string;
  /** The student situation this pattern addresses (this field gets embedded). */
  situation: string;
  /** Observable cues that indicate this situation is in play. */
  signals: string[];
  /** What the counselor guidance recommends doing. */
  strategies: string[];
  /** What to avoid saying/doing in this situation. */
  avoid: string[];
  /** When/whether to escalate toward a human counselor. */
  escalation: string;
  /** Citations / references backing this pattern (e.g. paper refs). */
  sourceRefs: string[];
  /** Locale-specific notes (cultural nuance) keyed by locale. */
  localeNotes?: Partial<Record<Locale, string>>;
}

/** Longest single user message the API accepts, in characters. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Request body for POST /chat. */
export interface ChatRequest {
  message: string;
  /**
   * Conversation/session identifier so history can be threaded server-side.
   * Omit it on the first message — the response carries the id to send back.
   */
  conversationId?: string;
  /** Language the user wants replies in. Defaults to DEFAULT_LOCALE. */
  locale?: Locale;
}

/**
 * One Care Pattern the retrieval step considered for a turn (Feature 22).
 * Scores are cosine similarity, 0-1. Only ever sent to a privileged viewer.
 */
export interface ChatDebugCandidate {
  id: string;
  title: string;
  score: number;
  /** True when it cleared the relevance floor and its strategies were injected. */
  applied: boolean;
}

/**
 * Why the reply is what it is (Feature 22).
 *
 * Present only when the request carried a valid inspector credential; an ordinary
 * visitor's response never contains this field. Everything here already exists inside
 * the turn — the inspector decides whether to send it, not whether to compute it.
 */
export interface ChatDebug {
  /** What retrieval concluded: applied, below_floor, no_patterns, low_signal, failed. */
  outcome: string;
  /** True when a real situation found no pattern close enough — a Care-Pattern gap. */
  gap: boolean;
  /** The relevance floor in force for this turn. */
  floor: number;
  /** The English match query the normalizer produced, which is what was embedded. */
  matchQuery?: string;
  /** Top-N candidates, closest first. */
  candidates: ChatDebugCandidate[];
  /** The exact guidance block injected into the system prompt; empty when none was. */
  guidance: string;
  /** How long retrieval took, in milliseconds. */
  retrievalMs: number;
  /** Token usage of the reply call. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Which model answered. */
  model?: string;
  /**
   * The same message answered with the Care-Pattern guidance withheld, for
   * side-by-side comparison. Present only when comparison was requested AND
   * guidance was actually applied — with nothing to withhold the two replies
   * would differ only by sampling noise, which demonstrates nothing.
   */
  replyWithoutGuidance?: string;
  usageWithoutGuidance?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Response body for POST /chat. */
export interface ChatResponse {
  conversationId: string;
  reply: string;
  /** The language the reply was requested in — echoed so the client can confirm. */
  locale: Locale;
  /** Retrieval internals — privileged viewers only (Feature 22). */
  debug?: ChatDebug;
}

/** Standard error envelope returned by the API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** Response body for the API health check. */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  /** Database connectivity, confirmed by a lightweight query (Feature 3). */
  db: "up" | "down";
}
