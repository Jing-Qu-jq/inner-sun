// Consistent, useful error output for the db CLI scripts.

interface ErrorLike {
  message?: string;
  code?: string;
  errors?: unknown[];
}

/** Pull a Postgres/OS error code out of an error, unwrapping AggregateError. */
function errorCode(err: unknown): string | undefined {
  const e = err as ErrorLike;
  if (e?.code) {
    return e.code;
  }
  // pg throws an AggregateError (empty message) on connection refusal; the code
  // lives on the wrapped sub-errors.
  if (Array.isArray(e?.errors)) {
    for (const sub of e.errors) {
      const code = (sub as ErrorLike)?.code;
      if (code) {
        return code;
      }
    }
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  const e = err as ErrorLike;
  if (e?.message) {
    return e.message;
  }
  const code = errorCode(err);
  return code ? `(${code})` : String(err);
}

/** Print a helpful failure message (with a hint if the DB is unreachable) and exit 1. */
export function fail(context: string, err: unknown): never {
  console.error(`${context}: ${errorMessage(err)}`);
  if (errorCode(err) === "ECONNREFUSED") {
    console.error("Could not reach PostgreSQL. Is it running? Start it with:  npm run db:up");
  }
  process.exit(1);
}
