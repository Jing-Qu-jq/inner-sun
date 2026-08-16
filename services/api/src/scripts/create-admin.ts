// Creates (or resets) an admin account for the researcher tool (Feature 17).
//
//   npm run admin:create -- --email jane@example.com --name "Jane Doe"
//   npm run admin:create -- --email jane@example.com --reset
//   npm run admin:create -- --email lead@example.com --name "Lead" --role admin
//
// This is the ONLY way an account comes into existence: there is deliberately no signup
// route, because the entire population is people the team already knows. Deploying a
// public registration form for a tool that can rewrite the clinical knowledge base would
// be handing out keys.
//
// The script GENERATES the password rather than accepting one as an argument. A password
// typed on a command line lands in shell history and in the process list where any other
// user on the machine can read it, and a human-chosen one for a colleague is usually weak.
// The generated password is printed once, must be delivered over a channel better than
// email if possible, and the account is flagged to force a change on first sign-in.

import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db.js";
import { hashPassword } from "../admin/passwords.js";

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * A readable, high-entropy temporary password: base64url over 18 random bytes gives
 * 144 bits, which no rate-limited login will ever be guessed through, while staying
 * something a person can retype from a message once.
 */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function databaseHost(): string {
  try {
    return new URL(config.databaseUrl).hostname;
  } catch {
    return "unknown host";
  }
}

async function main(): Promise<void> {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "researcher").trim();
  const reset = hasFlag("reset");

  if (!email) {
    throw new Error(
      "Missing --email.\n" +
        '  Create: npm run admin:create -- --email jane@example.com --name "Jane Doe"\n' +
        "  Reset:  npm run admin:create -- --email jane@example.com --reset",
    );
  }
  if (role !== "researcher" && role !== "admin") {
    throw new Error(`--role must be "researcher" or "admin" (got "${role}").`);
  }
  if (!reset && !name) {
    throw new Error('Missing --name. A new account needs a display name, e.g. --name "Jane Doe".');
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  console.log(`Target database: ${databaseHost()}\n`);

  const existing = await pool.query<{ id: string; display_name: string }>(
    "select id, display_name from admin_users where email = $1",
    [email],
  );

  if (existing.rows.length > 0) {
    if (!reset) {
      throw new Error(
        `An account for ${email} already exists (${existing.rows[0].display_name}).\n` +
          "To issue a new temporary password instead, re-run with --reset.",
      );
    }

    await pool.query(
      `update admin_users
          set password_hash = $2, must_change_password = true, is_active = true
        where email = $1`,
      [email, passwordHash],
    );
    // Any existing session was opened with the old password; a reset must end them.
    await pool.query(
      "delete from admin_sessions where admin_user_id = (select id from admin_users where email = $1)",
      [email],
    );
    console.log(`Password reset for ${email} (${existing.rows[0].display_name}).`);
    console.log("All of that account's existing sessions were signed out.\n");
  } else {
    await pool.query(
      `insert into admin_users (email, password_hash, display_name, role, must_change_password)
       values ($1, $2, $3, $4, true)`,
      [email, passwordHash, name, role],
    );
    console.log(`Created ${role} account for ${email} (${name}).\n`);
  }

  console.log("  Temporary password:  " + password);
  console.log("\nShare it over a channel you trust — a password manager's send feature or a");
  console.log("signal/message, not email. They will be asked to change it on first sign-in.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(`\nadmin:create failed: ${err instanceof Error ? err.message : String(err)}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
