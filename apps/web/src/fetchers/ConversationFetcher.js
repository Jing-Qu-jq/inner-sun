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

/**
 * The retrieval inspector's credential (Feature 22).
 *
 * Kept in sessionStorage rather than localStorage so it dies with the tab: this unlocks a
 * view of the Care Pattern library's scores, and a credential for that should not outlive
 * the demo it was pasted in for. It grants visibility only — it cannot author or publish a
 * pattern — and an ordinary visitor never has one, which is what makes their responses
 * byte-identical to what the API returned before this feature existed.
 */
const INSPECTOR_TOKEN_KEY = 'innersun.inspector.token';

export function getInspectorToken() {
    try {
        return window.sessionStorage.getItem(INSPECTOR_TOKEN_KEY) || '';
    } catch {
        // Private-mode browsers can throw on storage access. No token, no inspector.
        return '';
    }
}

export function setInspectorToken(token) {
    try {
        window.sessionStorage.setItem(INSPECTOR_TOKEN_KEY, token);
    } catch {
        // Nothing to do: the inspector simply stays off for this tab.
    }
}

export function clearInspectorToken() {
    try {
        window.sessionStorage.removeItem(INSPECTOR_TOKEN_KEY);
    } catch {
        // As above.
    }
}

/**
 * Ask the API whether a token works, before anything is unlocked (Feature 22, amended).
 *
 * Unlocking used to be purely local, so a wrong token gave you the bar, the compare switch and
 * no panel — indistinguishable from a working inspector with nothing to report. The API is the
 * only thing that can answer this, so the unlock button asks it.
 *
 * Returns a machine-readable outcome rather than a sentence, for the same reason chat errors do:
 * the component picks the wording at render time, so the message follows the language toggle.
 */
export async function checkInspectorToken(token) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}/inspect`, {
            method: 'GET',
            headers: { 'X-InnerSun-Inspect': token },
        });
    } catch {
        return 'unreachable';
    }

    if (response.status === 204) return 'ok';
    if (response.status === 401) return 'invalid';
    // 404 is the API saying the inspector does not exist here — INSPECTOR_TOKEN is unset, and an
    // unknown route answers the same way, which is what keeps that property true.
    if (response.status === 404) return 'not_configured';
    if (response.status === 429) return 'rate_limited';
    return 'unreachable';
}

async function postChat({ message, conversationId, locale, compare }) {
    // Sent only when a token exists, so an ordinary turn is the same request it always was.
    const token = getInspectorToken();
    const inspectorHeaders = token
        ? { 'X-InnerSun-Inspect': token, ...(compare ? { 'X-InnerSun-Inspect-Compare': '1' } : {}) }
        : {};

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...inspectorHeaders },
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

    // `debug` is present only for a valid inspector token; undefined for everyone else.
    return { reply: body.reply, conversationId: body.conversationId, locale: body.locale, debug: body.debug };
}

/**
 * Send one message and return `{ reply, conversationId, locale, debug }`.
 *
 * Pass the `conversationId` from the previous reply to continue a conversation;
 * omit it to start one. History itself is the server's business — it lives in
 * PostgreSQL, so this module never accumulates message state.
 *
 * Throws {@link ChatRequestError} when the turn fails.
 */
export default async function ConversationFetcher({ message, conversationId, locale, compare }) {
    try {
        return await postChat({ message, conversationId, locale, compare });
    } catch (error) {
        // A conversation the API has never heard of — the database was reset, or
        // this tab has been open since an older one. Retrying once without the
        // stale id silently starts a fresh conversation, which is a far better
        // outcome for the student than an error they can do nothing about.
        if (conversationId && error instanceof ChatRequestError && error.code === 'conversation_not_found') {
            return postChat({ message, locale, compare });
        }
        throw error;
    }
}
