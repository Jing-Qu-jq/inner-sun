/**
 * Errors the API deliberately shows to clients.
 *
 * Everything thrown from a route lands in the error handler in index.ts. That
 * handler only trusts an AppError to carry a client-safe message; anything else
 * becomes a generic 500. So the rule is: if a client should read the reason,
 * throw an AppError, and keep the detail out of `publicMessage`.
 */
export class AppError extends Error {
  /** HTTP status Fastify should reply with. */
  readonly statusCode: number;
  /** Stable machine-readable code for the client (ApiError.error.code). */
  readonly code: string;
  /** Safe to show a user: no internals, no upstream text, no secrets. */
  readonly publicMessage: string;

  constructor(statusCode: number, code: string, publicMessage: string, options?: { cause?: unknown }) {
    // `message` is what gets logged server-side; publicMessage is what ships out.
    super(publicMessage, options);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
