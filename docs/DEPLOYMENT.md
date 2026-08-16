# Deploying the researcher admin tool

This stands up **one service** — the Fastify API, which also serves the admin UI at
`/admin` from its own origin — against a **Supabase** Postgres database. The student chat
app is not deployed here; that is Feature 21.

Everything the researcher needs lives behind a login at `https://<your-service>/admin`.

> **Steps marked 👤 only you can do.** They involve creating accounts and entering secrets,
> which is deliberately not something to hand to an assistant or paste into a chat log.

---

## What you are building

```
Researcher's browser ──▶ Render (API + admin UI) ──▶ Supabase Postgres
                              │                        care_patterns
                              │                        canned_responses
                              └──▶ OpenAI (embeddings only)
```

`POST /chat` is **switched off** on this service (`ENABLE_CHAT_ROUTES=false`). An open,
unauthenticated, token-spending chat endpoint on the public internet is the one thing this
deployment must not create. With it off, the only upstream call this service can make is a
single embedding when someone presses Save, so it cannot run up an OpenAI bill.

---

## 1. Provision the database 👤

Create a Supabase project at [supabase.com](https://supabase.com). Choose a region near
your researcher, not near you — she is the one waiting on page loads.

Then, from the project's SQL editor, enable the vector extension:

```sql
create extension if not exists vector;
```

The migrations create it too, but doing it here first surfaces a permissions problem while
you are still looking at a SQL console rather than at a failed deploy.

**Take the connection string** from *Project Settings → Database → Connection string →
URI*. Use the **session pooler** URI (port 5432 style, labelled "Session mode"), not the
transaction pooler: the API holds a connection pool and uses prepared statements, which the
transaction pooler does not support.

Keep that string somewhere safe for the next steps. It contains your database password.

---

## 2. Run the migrations against Supabase

From your machine, with the connection string in hand:

```bash
DATABASE_URL="<your-supabase-uri>" npm run db:migrate
```

This applies `0001` through `0004` and records them in `schema_migrations`, so re-running
is a no-op. TLS is required by Supabase and is enabled automatically for any non-local
host — see `db/scripts/lib/pg.ts`.

Then load the twelve starter Care Patterns. This one needs an explicit flag, because
seeding overwrites the starter patterns by fixed UUID and the scripts refuse to touch a
non-local database by accident:

```bash
DATABASE_URL="<your-supabase-uri>" OPENAI_API_KEY="<your-key>" \
  npm run db:seed -- --allow-remote
```

Confirm it worked:

```bash
DATABASE_URL="<your-supabase-uri>" OPENAI_API_KEY="<your-key>" npm run db:verify
```

Four student-style queries should each retrieve the right pattern first.

---

## 3. Deploy the service 👤

Create a Render account and a **Blueprint** pointing at this repository. Render reads
[`render.yaml`](../render.yaml), which declares the build and start commands, the health
check path, and the environment.

Render will prompt for the two secrets marked `sync: false`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Supabase session-pooler URI from step 1 |
| `OPENAI_API_KEY` | Your OpenAI key |

**Do not set `API_HOST`.** The service binds `0.0.0.0` automatically when the platform
provides `PORT`; a stray `API_HOST` would bind loopback, and the failure mode is a service
that starts cleanly, logs nothing wrong, and times out its health check with no
explanation. The startup log warns if it detects this combination.

The free plan spins down when idle, so the first request after a quiet spell takes roughly
50 seconds. Worth telling your researcher, so a slow first load does not read as broken.

---

## 4. Create her account

```bash
DATABASE_URL="<your-supabase-uri>" \
  npm run admin:create -- --email her@example.com --name "Her Name"
```

This prints a temporary password **once**. Send it over something better than email — a
password manager's secure-send, or a signal message. She will be required to choose her own
password on first sign-in, and the temporary one stops working at that point.

Give yourself an account too, with `--role admin`.

---

## 5. Smoke test

- `https://<your-service>/health` returns `{"status":"ok", … "db":"up"}`
- `https://<your-service>/admin` shows the sign-in page
- `POST https://<your-service>/chat` returns **404** — confirming the chat endpoint is not
  exposed on this instance
- Sign in, create a Care Pattern, press Save, then Publish
- Confirm the browser sent the session cookie with `Secure` and `HttpOnly` set

---

## Backups

Supabase's free tier keeps limited backup history, and the Care Patterns are the product's
core asset. Export them periodically and commit the result:

```bash
REMOTE_DATABASE_URL="<your-supabase-uri>" npm run db:export:patterns -- --remote
```

The diff doubles as a readable changelog of your researcher's work.

To develop retrieval against her real content without touching production:

```bash
REMOTE_DATABASE_URL="<your-supabase-uri>" npm run db:pull:patterns
npm run db:reembed -- --stale
```

That copies patterns **down** into your local database. Never point `DATABASE_URL` at
Supabase to browse content — `db:reset` reads that variable and would drop the schema. The
scripts refuse a non-local host for exactly this reason, but the habit matters more than
the guard.

---

## Redeploying and rolling back

**Redeploy:** push to the branch Render tracks. It rebuilds and restarts automatically.

**Roll back:** Render's dashboard keeps previous deploys — *Deploys → the one you want →
Rollback*. This reverts the code only.

**Database changes do not roll back with the code.** Migrations are forward-only and there
are no down-migrations, which is deliberate: an automated reversal of a schema change is
usually more dangerous than a considered fix. If a migration causes a problem, write a new
migration correcting it. Before applying anything structural to production, take a Supabase
backup first and run the migration against your local database.

---

## Moving to a company OpenAI account

Change `OPENAI_API_KEY` in Render's dashboard and redeploy. Nothing else changes —
**switching accounts does not invalidate stored embeddings**, because a vector is
determined by the model, not the account. `db:reembed` exists for a *model* change, not an
account change.

Rotate the old key afterwards rather than leaving it valid, and set a monthly budget cap in
the OpenAI dashboard while a personal key is in use.
