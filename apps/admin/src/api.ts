// Fetch layer for the admin API.
//
// Paths are relative because the bundle is served by the API itself at /admin — same
// origin, so the session cookie rides along with no CORS and no cross-site cookie rules
// to negotiate. That is the main reason the admin UI is served this way rather than
// deployed separately alongside the student app.

const BASE = "/admin/api";

/** Carries the server's machine-readable code so callers can branch without string matching. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      // Only declare a JSON body when there actually is one. Fastify rejects a request
      // that claims `Content-Type: application/json` and then sends nothing —
      // "Body cannot be empty when content-type is set to 'application/json'" — which
      // breaks every action that is a bare POST: publish, retire, and sign-out.
      headers: {
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server. Is the API running?");
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "Something went wrong.",
    );
  }

  return body as T;
}

// ---- Types (mirroring the API's responses) ---------------------------------

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
  role: "researcher" | "admin";
  mustChangePassword: boolean;
}

/**
 * Publication lifecycle. A new pattern starts as `draft` — writing one does not put it in
 * front of students. Only `published` is ever matched.
 */
export type CarePatternStatus = "draft" | "published" | "retired";

export interface CarePattern {
  id: string;
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  sourceRefs: string[];
  localeNotes: Record<string, string>;
  status: CarePatternStatus;
  embeddingModel: string | null;
  embeddedAt: string | null;
  /** True when the stored vector does not reflect `situation` — the pattern is unsearchable. */
  needsEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EmbeddingStatus = "embedded" | "unchanged" | "failed";

export interface Revision {
  id: string;
  action: "create" | "update" | "publish" | "retire" | "restore";
  authorName: string | null;
  authorEmail: string | null;
  before: CarePattern | null;
  after: CarePattern;
  createdAt: string;
}

export interface CannedResponse {
  id: string;
  key: string;
  question: Record<string, string>;
  answer: Record<string, string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CarePatternDraft {
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  sourceRefs: string[];
  localeNotes: Record<string, string>;
}

// ---- Auth ------------------------------------------------------------------

export const login = (email: string, password: string) =>
  request<AdminIdentity>("/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const logout = () => request<{ ok: true }>("/logout", { method: "POST" });

export const me = () => request<AdminIdentity>("/me");

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: true }>("/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

// ---- Care Patterns ---------------------------------------------------------

export const listCarePatterns = (includeRetired: boolean) =>
  request<{ patterns: CarePattern[] }>(`/care-patterns?includeRetired=${includeRetired}`);

export const createCarePattern = (draft: CarePatternDraft) =>
  request<{ pattern: CarePattern; embeddingStatus: EmbeddingStatus }>("/care-patterns", {
    method: "POST",
    body: JSON.stringify(draft),
  });

export const updateCarePattern = (id: string, draft: CarePatternDraft) =>
  request<{ pattern: CarePattern; embeddingStatus: EmbeddingStatus }>(`/care-patterns/${id}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });

/** Makes a pattern retrievable — covers both first publication and un-retiring one. */
export const publishCarePattern = (id: string) =>
  request<{ pattern: CarePattern }>(`/care-patterns/${id}/publish`, { method: "POST" });

export const retireCarePattern = (id: string) =>
  request<{ pattern: CarePattern }>(`/care-patterns/${id}/retire`, { method: "POST" });

export const listRevisions = (id: string) =>
  request<{ revisions: Revision[] }>(`/care-patterns/${id}/revisions`);

// ---- Canned responses ------------------------------------------------------

export const listCannedResponses = (includeRetired: boolean) =>
  request<{ cannedResponses: CannedResponse[] }>(`/canned-responses?includeRetired=${includeRetired}`);

export interface CannedResponseDraft {
  key: string;
  question: Record<string, string>;
  answer: Record<string, string>;
}

export const createCannedResponse = (draft: CannedResponseDraft) =>
  request<{ cannedResponse: CannedResponse }>("/canned-responses", {
    method: "POST",
    body: JSON.stringify(draft),
  });

export const updateCannedResponse = (id: string, draft: CannedResponseDraft) =>
  request<{ cannedResponse: CannedResponse }>(`/canned-responses/${id}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });

export const retireCannedResponse = (id: string) =>
  request<{ cannedResponse: CannedResponse }>(`/canned-responses/${id}/retire`, { method: "POST" });

export const restoreCannedResponse = (id: string) =>
  request<{ cannedResponse: CannedResponse }>(`/canned-responses/${id}/restore`, { method: "POST" });
