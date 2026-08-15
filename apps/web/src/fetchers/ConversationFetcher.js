/**
 * Talks to the InnerSun API (Feature 5).
 *
 * Before this feature the browser called api.openai.com directly, which meant
 * shipping an OpenAI key and the counseling system prompt to every visitor.
 * Both now live only in the API service: this module sends a message to our
 * own POST /chat and gets back a reply. Nothing here knows which model answers,
 * what it was told to do, or how to authenticate to OpenAI.
 */

// Absolute rather than a relative path proxied by the dev server, so local
// development exercises the same cross-origin request that a deployed build
// will (the API allows WEB_ORIGIN via CORS). Feature 21 sets this for real.
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');

// Longest message the API accepts; mirrors MAX_MESSAGE_LENGTH in
// packages/shared. Enforced in the UI too so an over-long message is prevented
// rather than sent and rejected with a 400 the student cannot interpret.
export const MAX_MESSAGE_LENGTH = 4000;

// A little longer than the API's own OPENAI_TIMEOUT_MS (30s), so a slow model
// still gets a chance to answer while a genuinely stuck request always ends —
// the "..." placeholder must never be permanent.
const REQUEST_TIMEOUT_MS = 45000;

/**
 * A failed turn. Carries a machine-readable `code` instead of display text: the
 * Chat component picks the wording so error messages follow the language toggle
 * like every other string in the UI.
 */
export class ChatRequestError extends Error {
    constructor(code, { status, cause } = {}) {
        super(`chat request failed: ${code}`, { cause });
        this.name = 'ChatRequestError';
        this.code = code;
        this.status = status;
    }
}

async function postChat({ message, conversationId, locale }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // conversationId is omitted on the first message of a conversation;
            // the API answers with the id to send back on later turns.
            body: JSON.stringify({ message, locale, ...(conversationId ? { conversationId } : {}) }),
            signal: controller.signal,
        });
    } catch (error) {
        // fetch only rejects for transport-level failures: the API is not
        // running, the network is down, or our own timeout aborted it.
        throw new ChatRequestError(controller.signal.aborted ? 'timeout' : 'network_error', { cause: error });
    } finally {
        clearTimeout(timeout);
    }

    // The API answers with JSON for both success and its ApiError envelope, but
    // a proxy or a crash can still return something else — so parsing failure is
    // treated as a failed turn rather than allowed to throw a raw SyntaxError.
    let body;
    try {
        body = await response.json();
    } catch (error) {
        throw new ChatRequestError('bad_response', { status: response.status, cause: error });
    }

    if (!response.ok) {
        throw new ChatRequestError(body?.error?.code || 'request_failed', { status: response.status });
    }
    if (!body?.reply || !body?.conversationId) {
        throw new ChatRequestError('bad_response', { status: response.status });
    }

    return { reply: body.reply, conversationId: body.conversationId, locale: body.locale };
}

/**
 * Send one message and return `{ reply, conversationId, locale }`.
 *
 * Pass the `conversationId` from the previous reply to continue a conversation;
 * omit it to start one. History itself is the server's business — it lives in
 * PostgreSQL, so this module never accumulates message state.
 *
 * Throws {@link ChatRequestError} when the turn fails.
 */
export default async function ConversationFetcher({ message, conversationId, locale }) {
    try {
        return await postChat({ message, conversationId, locale });
    } catch (error) {
        // A conversation the API has never heard of — the database was reset, or
        // this tab has been open since an older one. Retrying once without the
        // stale id silently starts a fresh conversation, which is a far better
        // outcome for the student than an error they can do nothing about.
        if (conversationId && error instanceof ChatRequestError && error.code === 'conversation_not_found') {
            return postChat({ message, locale });
        }
        throw error;
    }
}
