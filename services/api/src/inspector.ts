import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { config } from "./config.js";

/**
 * The inspector credential (Feature 22).
 *
 * `POST /chat` returns retrieval internals — matched patterns, similarity scores, the
 * guidance injected — to a privileged viewer, so that the difference between a
 * Care-Pattern-grounded reply and a generic one can be *shown* rather than asserted.
 * This module decides who counts as privileged, and nothing else.
 *
 * Three properties are deliberate:
 *
 *   1. **Off unless switched on.** With INSPECTOR_TOKEN unset the feature does not exist:
 *      the route never builds a debug payload, and a response is byte-identical to what an
 *      ordinary visitor receives. That is the right default for a hosted instance, and it
 *      fails closed rather than open.
 *   2. **Visibility only.** This is NOT the Feature 17 admin session, which can publish and
 *      retire clinical guidance. A credential that lives in the student site's browser
 *      should buy the ability to look, and nothing more. (It also could not be that session:
 *      the admin cookie is sameSite "lax" on the API origin and CORS runs without
 *      credentials, so a cross-origin chat request never carries it.)
 *   3. **A header, not a cookie.** Cookies would mean loosening both of those settings for
 *      every visitor, to serve a debugging affordance for one person.
 *
 * When Feature 12 brings real accounts this becomes a role check on the signed-in user and
 * the token disappears. The payload it gates does not change.
 */

/** Carries the token. */
export const INSPECT_HEADER = "x-innersun-inspect";

/** Asks for the extra unguided reply. Only honoured for a valid inspector. */
export const COMPARE_HEADER = "x-innersun-inspect-compare";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Hashed first so the comparison is over two fixed-length digests: timingSafeEqual throws
 * on a length mismatch, and catching that would itself reveal the token's length.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether this request may see retrieval internals.
 *
 * Everything about the check fails closed: no configured token, no header, or a header that
 * is not a single string (a repeated header arrives as an array) all mean "no".
 */
export function isInspector(request: FastifyRequest): boolean {
  const expected = config.inspectorToken;
  if (!expected) return false;

  const provided = request.headers[INSPECT_HEADER];
  if (typeof provided !== "string" || provided.length === 0) return false;

  return secretsMatch(provided, expected);
}

/**
 * Whether this turn should also be answered WITHOUT the matched guidance, for the
 * side-by-side comparison. Doubles the cost of the turn, so it is opt-in per request
 * rather than a mode the inspector is left in.
 */
export function wantsComparison(request: FastifyRequest): boolean {
  const value = request.headers[COMPARE_HEADER];
  return typeof value === "string" && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}
