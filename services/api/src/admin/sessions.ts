// Admin sessions (Feature 17): server-side, revocable, no native dependencies.
//
// The cookie carries a random opaque token; the database stores only its SHA-256 hash.
// Two consequences worth the extra table over a signed stateless cookie:
//
//   • Signing out actually revokes. A stateless token stays valid until it expires no
//     matter what the server thinks, so "log out" would be a suggestion. This tool guards
//     the clinical knowledge base, so ending a session has to end it.
//   • A leaked database backup yields no usable sessions, because hashes are stored
//     rather than tokens — the same reasoning as passwords.
//
// The token is high-entropy random, so a plain SHA-256 is right here: unlike a password
// there is nothing to brute-force, and a slow KDF would only tax every request.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { isProduction } from "../config.js";
import { dbQuery } from "../db.js";
import { AppError } from "../errors.js";

export const SESSION_COOKIE = "innersun_admin";

/** How long a session lasts without activity. Long enough for a writing session. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Only refresh `last_seen_at` past this age, so reads don't write on every request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
  role: "researcher" | "admin";
  mustChangePassword: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue a session and set the cookie. Returns nothing the caller needs to keep. */
export async function createSession(reply: FastifyReply, adminUserId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await dbQuery(
    "insert into admin_sessions (token_hash, admin_user_id, expires_at) values ($1, $2, $3)",
    [hashToken(token), adminUserId, expiresAt],
  );

  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, // unreachable from JavaScript, so an XSS bug cannot read it
    secure: isProduction, // HTTPS-only in production; plain http:// locally would drop it
    sameSite: "lax", // the admin app is same-origin, so nothing needs cross-site sends
    path: "/",
    expires: expiresAt,
  });
}

/** Revoke the presented session (if any) and clear the cookie. Idempotent. */
export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token) {
    await dbQuery("delete from admin_sessions where token_hash = $1", [hashToken(token)]);
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Revoke every session for one account — used when a password changes. */
export async function destroyAllSessionsFor(adminUserId: string): Promise<void> {
  await dbQuery("delete from admin_sessions where admin_user_id = $1", [adminUserId]);
}

interface SessionRow {
  token_hash: string;
  expires_at: Date;
  last_seen_at: Date;
  id: string;
  email: string;
  display_name: string;
  role: "researcher" | "admin";
  must_change_password: boolean;
  is_active: boolean;
}

/**
 * Resolve the caller from their cookie, or null when there is no valid session.
 *
 * Deactivating an account takes effect immediately: `is_active` is checked on every
 * request rather than captured at login, so revoking access does not wait for expiry.
 */
export async function resolveSession(request: FastifyRequest): Promise<AdminIdentity | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const presented = hashToken(token);
  const { rows } = await dbQuery<SessionRow>(
    `select s.token_hash, s.expires_at, s.last_seen_at,
            u.id, u.email, u.display_name, u.role, u.must_change_password, u.is_active
       from admin_sessions s
       join admin_users u on u.id = s.admin_user_id
      where s.token_hash = $1`,
    [presented],
  );

  const row = rows[0];
  if (!row) return null;

  // The lookup was by hash so this comparison is belt and braces, but it costs nothing
  // and keeps the "never compare secrets with ===" habit intact.
  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(presented);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    await dbQuery("delete from admin_sessions where token_hash = $1", [presented]);
    return null;
  }

  if (!row.is_active) return null;

  if (Date.now() - row.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await dbQuery("update admin_sessions set last_seen_at = now() where token_hash = $1", [presented]);
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireAdmin; present on every route behind it. */
    admin?: AdminIdentity;
  }
}

/**
 * preHandler establishing that the caller is signed in. A 401 here is deliberately terse —
 * an unauthenticated caller learns only that they are unauthenticated.
 *
 * Use this only on the two routes that must work *before* a temporary password has been
 * replaced (`/me` and `/password`). Everything else uses requireActiveAdmin.
 */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const admin = await resolveSession(request);
  if (!admin) {
    throw new AppError(401, "unauthorized", "Please sign in.");
  }
  request.admin = admin;
}

/**
 * preHandler for every route that does real work.
 *
 * Enforcing `must_change_password` at the API and not only in the UI matters: the
 * temporary password from `admin:create` was seen by whoever ran the script and sent over
 * some messaging channel, so it is the weakest credential the account will ever have.
 * Without this, a client that simply skipped the change-password screen could keep using
 * it indefinitely — the UI would be a suggestion rather than a control.
 */
export async function requireActiveAdmin(request: FastifyRequest): Promise<void> {
  await requireAdmin(request);
  if (request.admin!.mustChangePassword) {
    throw new AppError(
      403,
      "password_change_required",
      "Please choose your own password before continuing.",
    );
  }
}

/** Best-effort cleanup of expired rows. Called opportunistically on login. */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await dbQuery("delete from admin_sessions where expires_at <= now()");
  } catch {
    // Housekeeping must never fail a login.
  }
}
