// Postgres client construction, in one place so every script connects the same way.
//
// The reason this exists is TLS. A hosted database (Supabase) requires it; a local Docker
// container does not offer it. The decision is made here, explicitly, from the host —
// rather than left to `pg` to infer from `sslmode` in the connection string, which is
// fragile in a way described below.
//
// Two things about Supabase specifically, both learned the hard way:
//
//   1. Its Postgres presents a certificate chained to Supabase's OWN CA, not a publicly
//      trusted one. Node rejects that with "self-signed certificate in certificate chain".
//      The fix is to trust that specific CA — download `prod-ca-2021.crt` from the
//      dashboard (Database Settings → SSL Configuration) and point DATABASE_SSL_CA at it.
//
//   2. `pg` SILENTLY IGNORES the `ssl` options object when the connection string carries
//      an `sslmode` parameter. Supabase's copyable URI often includes one, so passing our
//      carefully-chosen options alongside it would do nothing at all, with no warning.
//      We therefore strip `sslmode` from the string before handing it over.

import { readFileSync } from "node:fs";
import pg from "pg";
import { isLocalDatabase } from "./guard.js";

/**
 * `DATABASE_SSL_CA` may be either the PEM text itself (convenient on a hosting platform,
 * where adding a file is awkward but an environment variable is not) or a path to a file.
 */
function readCa(): string | undefined {
  const value = process.env.DATABASE_SSL_CA;
  if (!value) return undefined;
  if (value.includes("-----BEGIN CERTIFICATE-----")) return value;

  try {
    return readFileSync(value, "utf8");
  } catch (err) {
    throw new Error(
      `DATABASE_SSL_CA points at "${value}" but that file could not be read ` +
        `(${err instanceof Error ? err.message : String(err)}).\n` +
        "Give it either a readable path or the certificate's PEM text.",
    );
  }
}

/**
 * `pg` ignores explicit ssl options when the URL declares sslmode, so remove it. We are
 * deciding TLS ourselves; leaving the parameter in place would silently override that.
 */
function stripSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sslmode")) return url;
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Connection options for `url`, with TLS decided by whether the host is this machine. */
export function clientOptions(url: string): pg.ClientConfig {
  if (isLocalDatabase(url)) {
    return { connectionString: url };
  }

  const connectionString = stripSslMode(url);

  if (process.env.DATABASE_SSL_NO_VERIFY === "true") {
    console.warn(
      "⚠️  DATABASE_SSL_NO_VERIFY=true — the database connection is encrypted but the\n" +
        "   server's certificate is NOT verified, so anyone on the network path can sit in\n" +
        "   the middle of it. Prefer DATABASE_SSL_CA with the provider's CA certificate.",
    );
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }

  const ca = readCa();
  if (ca) {
    return { connectionString, ssl: { ca, rejectUnauthorized: true } };
  }

  // No CA supplied: fall back to the system trust store. Fine for a provider with a
  // publicly trusted certificate; Supabase is not one, hence the hint in the error.
  return { connectionString, ssl: { rejectUnauthorized: true } };
}

/**
 * Turn the opaque TLS failure into the two things that actually fix it. Without this the
 * message is "self-signed certificate in certificate chain", which says nothing about
 * where to get the certificate or which variable to put it in.
 */
export function explainTlsError(err: unknown): string | undefined {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  const isTls =
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    /self.signed certificate|unable to verify/i.test(message);

  if (!isTls) return undefined;

  return (
    `${message}\n\n` +
    "The database's certificate is not signed by a CA your system trusts. On Supabase this\n" +
    "is expected — it uses its own CA — and the fix is to trust that certificate:\n\n" +
    "  1. Supabase dashboard → Database Settings → SSL Configuration → download\n" +
    "     prod-ca-2021.crt\n" +
    "  2. Re-run with DATABASE_SSL_CA pointing at it, e.g.\n" +
    '       DATABASE_SSL_CA="./prod-ca-2021.crt" DATABASE_URL="…" npm run db:migrate\n\n' +
    "DATABASE_SSL_NO_VERIFY=true will also get you connected, but it leaves the connection\n" +
    "encrypted-but-unverified — acceptable to unblock yourself, not to leave in place."
  );
}

/** A one-shot client for a script. Callers still own connect()/end(). */
export function createClient(url: string): pg.Client {
  return new pg.Client(clientOptions(url));
}
