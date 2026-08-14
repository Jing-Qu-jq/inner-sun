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

/** Response body for POST /chat. */
export interface ChatResponse {
  conversationId: string;
  reply: string;
  /** The language the reply was requested in — echoed so the client can confirm. */
  locale: Locale;
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
