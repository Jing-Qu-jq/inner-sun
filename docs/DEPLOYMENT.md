# Deployment

**Live:** <https://innersun-admin.onrender.com/admin> — first deployed 2026-08-16.

This stands up **one service** — the Fastify API, which also serves the admin UI at
`/admin` from its own origin — against a **Supabase** Postgres database.

> **Scope.** Today this deployment exists for the researcher admin tool, and the
> student-facing chat app is not part of it. Feature 21 **extends this same deployment**
> rather than adding a second one: same Render service, same database, with
> `ENABLE_CHAT_ROUTES` turned back on and the web app served from the same origin the admin
> UI already uses. That is why this file is `DEPLOYMENT.md` and not something admin-specific.

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

**Take the connection string** from the **Connect** button at the top of the project
dashboard. (It used to live under *Project Settings → Database*; Supabase moved it.)

Use the **session pooler** URI — the one on **port 5432**, not 6543. Port 6543 is the
transaction pooler, which does not support the prepared statements `pg` uses, and it fails
as assorted query errors rather than anything that mentions pooling.

The dashboard shows the URI with a literal `[YOUR-PASSWORD]` placeholder; substitute the
password you saved when creating the project. If you did not save it, reset it under
*Settings → Database* — nothing is connected yet, so there is no cost to doing so.

Keep the finished string somewhere safe. It contains your database password.

**Download the CA certificate while you are here.** *Database Settings → SSL Configuration
→ Download certificate* gives you `prod-ca-2021.crt`. You need it for the next step, and
for Render — see below.

---

## 2. Run the migrations against Supabase

No commit or build is needed for any of this — the scripts run TypeScript directly from
your working tree. Git only matters for Render, which clones from GitHub.

TLS is required by Supabase and is enabled automatically for any non-local host. It also
needs the **CA certificate** you downloaded above, because Supabase's Postgres presents a
certificate chained to its own CA rather than a publicly trusted one; without it Node
rejects the connection as *"self-signed certificate in certificate chain"*.

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  DATABASE_URL="<your-supabase-uri>" \
  npm run db:migrate
```

This applies `0001` through `0004` and records them in `schema_migrations`, so re-running
is a no-op.

Then load the twelve starter Care Patterns. This one needs an explicit flag, because
seeding overwrites the starter patterns by fixed UUID and the scripts refuse to touch a
non-local database by accident:

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  DATABASE_URL="<your-supabase-uri>" OPENAI_API_KEY="<your-key>" \
  npm run db:seed -- --allow-remote
```

Confirm it worked:

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  DATABASE_URL="<your-supabase-uri>" OPENAI_API_KEY="<your-key>" \
  npm run db:verify
```

Four student-style queries should each retrieve the right pattern first.

> **If you see a certificate error anyway,** `DATABASE_SSL_NO_VERIFY=true` will connect —
> but it leaves the connection encrypted-but-unverified, which anyone on the network path
> can sit in the middle of. Acceptable to unblock a migration you are watching; not
> something to carry into Render, where it would apply to every request your researcher
> makes. Two things silently defeat a correct CA: pointing `DATABASE_SSL_CA` at a path that
> does not exist, and — historically — an `sslmode` parameter in the connection string,
> which makes `pg` ignore SSL options entirely. The code strips `sslmode` for that reason.

---

## 3. Deploy the service 👤

Create a Render account and a **Blueprint** pointing at this repository. Render reads
[`render.yaml`](../render.yaml), which declares the build and start commands, the health
check path, and the environment.

Render will prompt for the values marked `sync: false`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Supabase session-pooler URI from step 1 |
| `OPENAI_API_KEY` | Your OpenAI key |
| `DATABASE_SSL_CA` | The **contents** of `prod-ca-2021.crt` — open it in a text editor and paste the whole `-----BEGIN CERTIFICATE-----` block |

`DATABASE_SSL_CA` accepts either a file path or the certificate text itself. On Render,
paste the text: a hosting platform takes environment variables easily and files awkwardly.

**Do not set `API_HOST`.** The service binds `0.0.0.0` automatically when the platform
provides `PORT`; a stray `API_HOST` would bind loopback, and the failure mode is a service
that starts cleanly, logs nothing wrong, and times out its health check with no
explanation. The startup log warns if it detects this combination.

The free plan spins down when idle, so the first request after a quiet spell takes roughly
50 seconds. Worth telling your researcher, so a slow first load does not read as broken.

---

## 4. Create her account

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  DATABASE_URL="<your-supabase-uri>" \
  npm run admin:create -- --email her@example.com --name "Her Name"
```

This prints a temporary password **once**. Send it over something better than email — a
password manager's secure-send, or a signal message. She will be required to choose her own
password on first sign-in, and the temporary one stops working at that point.

Give yourself an account too, with `--role admin`.

---

## 5. Smoke test

```bash
BASE=https://innersun-admin.onrender.com

curl -s $BASE/health                                   # {"status":"ok", … "db":"up"}
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin/   # 200
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin/api/care-patterns   # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/chat \
  -H 'Content-Type: application/json' -d '{"message":"hi"}'              # 404
```

**The 404 is the one that matters.** It confirms the chat endpoint is not exposed on this
instance, which is what stops it being farmed for OpenAI credit.

Then sign in, create a Care Pattern, press Save, then Publish.

Results from the first deploy (2026-08-16): `db: "up"`, `/admin/` 200, `/admin/api/*` 401,
`POST /chat` 404, `http://` redirects to `https://`, and the login rate limiter reports a
per-client budget — confirming `trustProxy` is working, without which every visitor would
share one global allowance.

---

## Backups

Supabase's free tier keeps limited backup history, and the Care Patterns are the product's
core asset. Export them periodically and commit the result:

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  REMOTE_DATABASE_URL="<your-supabase-uri>" \
  npm run db:export:patterns -- --remote
```

The diff doubles as a readable changelog of your researcher's work.

To develop retrieval against her real content without touching production:

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  REMOTE_DATABASE_URL="<your-supabase-uri>" \
  npm run db:pull:patterns
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
