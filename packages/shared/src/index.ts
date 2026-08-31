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
 * One place a student in crisis can reach a human, right now (Feature 9).
 *
 * Deliberately a plain, server-supplied record rather than something the model writes. A
 * hallucinated phone number is not a cosmetic error in a mental-health product, so the
 * numbers never pass through a language model on their way to the student: the reply is
 * generated, the resources are data. Localized for the conversation's language by the API,
 * which is also where the decision to show them is made — a client that received "crisis:
 * true" and had to look up its own copy of the list could show nothing at all.
 */
export interface CrisisResource {
  /** Who or what it is, in the student's language. */
  name: string;
  /** How to reach it: a phone number, a short code, or a URL. Rendered verbatim. */
  contact: string;
  /** Where it applies, or when to use it. One short line. */
  note?: string;
}

/**
 * What the app surfaces on a turn where crisis screening fired (Feature 9 AC 2).
 *
 * Present on the response only for such a turn, and never for an ordinary one — so a client
 * renders the panel by asking whether the field exists, not by re-deriving the judgement.
 */
export interface ChatCrisis {
  /**
   * Which kind of risk was detected: self_harm, harm_to_others, abuse_or_violence,
   * medical_emergency. Carried so a client can adapt its wording; the resource list is
   * already chosen for it.
   */
  category: string;
  resources: CrisisResource[];
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
 * Token counts for one upstream call.
 *
 * `cachedPromptTokens` is the slice of the prompt OpenAI served from its prompt cache and
 * bills at a discount (Feature 8). It is the only observable proof that caching is working,
 * so it is carried all the way to the inspector rather than being folded into the total.
 */
export interface ChatTokenUsage {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * One upstream call made while answering a turn, and what it cost (Feature 8).
 *
 * A turn is several calls, not one — the match query, the embedding, sometimes a
 * summarization, then the reply — and the cheap ones are cheap precisely because of the
 * model tiering this feature enforces. Listing them individually is what makes that
 * visible; a single total would hide the fact that the expensive model ran once.
 */
export interface ChatDebugCall {
  /** Which step made it: match-query, match-embedding, summary, reply, reply-no-guidance. */
  step: string;
  model: string;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  /** Estimated USD, from the list prices in services/api/src/usage.ts. */
  costUsd: number;
}

/**
 * How the prompt for this turn was assembled (Feature 8).
 *
 * The counts are the cost control made legible: `verbatimMessages` is what was resent word
 * for word, `summarizedMessages` is what was replaced by a few sentences instead. A long
 * conversation should show the first number flat and the second one growing.
 */
export interface ChatDebugPrompt {
  /** Messages replayed to the reply model word for word, this turn's message included. */
  verbatimMessages: number;
  /** Earlier messages represented by the running summary rather than resent. */
  summarizedMessages: number;
  /** The running summary in force for this turn. Absent until there is one. */
  summary?: string;
  /** True when this is the turn that folded older messages into the summary. */
  summarizedThisTurn: boolean;
  /** The cap on reply length in force, in tokens. */
  maxReplyTokens: number;
}

/**
 * How this turn was screened for crisis signals, and what that decided (Feature 9 AC 6).
 *
 * Screening is invisible in the reply and invisible in the retrieval trace: a turn where
 * crisis handling took over and dropped a matched Care Pattern looks, from the outside,
 * exactly like a turn where nothing matched. This is the record that tells them apart.
 *
 * Nothing here is the student's text. `rules` carries rule *identifiers*, not the phrase
 * that matched, for the same reason no other log line in this service carries content.
 */
export interface ChatDebugSafety {
  /** True when this turn triggered crisis handling. */
  crisis: boolean;
  /** What decided it: rules, classifier, both, or none. */
  source: string;
  /** The kind of risk, or "none". */
  category: string;
  /** Identifiers of the phrase rules that fired — never the phrase, never the message. */
  rules: string[];
  /**
   * What the classifier answered: a label, "skipped" when the rules already decided,
   * "unparsed" when it replied with something outside the label set, or "failed".
   */
  classifier: string;
  /** True when patterns cleared the relevance floor and were dropped because crisis won. */
  overrodeRetrieval: boolean;
  /** How long screening took, in milliseconds. */
  durationMs: number;
}

/**
 * Why the reply is what it is (Feature 22).
 *
 * Present only when the request carried a valid inspector credential; an ordinary
 * visitor's response never contains this field. Everything here already exists inside
 * the turn — the inspector decides whether to send it, not whether to compute it.
 */
export interface ChatDebug {
  /**
   * Crisis screening for this turn (Feature 9). Listed first because it outranks every
   * other decision here: when `crisis` is true the retrieval below was computed and then
   * discarded, and the reply was written to a different directive entirely.
   */
  safety?: ChatDebugSafety;
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
  usage?: ChatTokenUsage;
  /** Which model answered. */
  model?: string;
  /** How the prompt was assembled and how much of the history was summarized (Feature 8). */
  prompt?: ChatDebugPrompt;
  /** Every upstream call this turn made, in the order they were started (Feature 8). */
  calls?: ChatDebugCall[];
  /** Estimated cost of this turn in USD (Feature 8). */
  turnCostUsd?: number;
  /**
   * Estimated cost of the whole conversation so far, this turn included (Feature 8).
   *
   * This is the number the plan's "~$0.05 per conversation" claim is about, which is why
   * it is shown next to the turn cost rather than left to be added up by hand.
   */
  conversationCostUsd?: number;
  /**
   * The same message answered with the Care-Pattern guidance withheld, for
   * side-by-side comparison. Present only when comparison was requested AND
   * guidance was actually applied — with nothing to withhold the two replies
   * would differ only by sampling noise, which demonstrates nothing.
   */
  replyWithoutGuidance?: string;
  usageWithoutGuidance?: ChatTokenUsage;
}

/** Response body for POST /chat. */
export interface ChatResponse {
  conversationId: string;
  reply: string;
  /** The language the reply was requested in — echoed so the client can confirm. */
  locale: Locale;
  /**
   * Crisis resources for this turn (Feature 9). Present only when screening fired, which
   * is what tells a client to show them — the judgement is the server's, not the browser's.
   */
  crisis?: ChatCrisis;
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
