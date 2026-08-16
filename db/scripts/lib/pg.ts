// Postgres client construction, in one place so every script connects the same way.
//
// The reason this exists is TLS. A hosted database (Supabase) requires it; a local Docker
// container does not offer it. Relying on `pg` to infer this from `sslmode` in the
// connection string is fragile — the parsing has changed across pg versions and a string
// pasted from a dashboard may or may not carry the parameter — so the decision is made
// here, explicitly, from the host.
//
// Verification is ON by default. `rejectUnauthorized: false` is the usual copy-paste fix
// for a TLS error, and it silently downgrades the connection to encrypted-but-unverified,
// which any network attacker can sit in the middle of. Supabase presents a publicly
// trusted certificate, so it should never be needed; the escape hatch below exists for a
// provider with a private CA, and says so.

import pg from "pg";
import { isLocalDatabase } from "./guard.js";

/** Connection options for `url`, with TLS decided by whether the host is this machine. */
export function clientOptions(url: string): pg.ClientConfig {
  if (isLocalDatabase(url)) {
    return { connectionString: url };
  }

  const skipVerify = process.env.DATABASE_SSL_NO_VERIFY === "true";
  if (skipVerify) {
    console.warn(
      "⚠️  DATABASE_SSL_NO_VERIFY=true — the database connection is encrypted but the\n" +
        "   server's certificate is NOT verified. Only acceptable for a provider using a\n" +
        "   private CA, and never a fix worth keeping for a certificate error you have not read.",
    );
  }

  return { connectionString: url, ssl: { rejectUnauthorized: !skipVerify } };
}

/** A one-shot client for a script. Callers still own connect()/end(). */
export function createClient(url: string): pg.Client {
  return new pg.Client(clientOptions(url));
}
