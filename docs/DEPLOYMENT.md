# Deployment

**Live:** <https://innersun.onrender.com> — first deployed 2026-08-16 (admin tool),
extended 2026-09-02 to the student app (Feature 24).

> Renamed from `innersun-admin` on 2026-09-02, once the service served both apps.
> **The old subdomain does not redirect** — it stops answering when that service is deleted,
> so anyone holding an `innersun-admin.onrender.com/admin` bookmark needs the new link.

This stands up **one service** — the Fastify API, which also serves the admin UI at `/admin`
and the student chat app at `/`, both from its own origin — against a **Supabase** Postgres
database.

> **Scope.** This deployment began as the researcher admin tool with `POST /chat` switched
> off. **Feature 24 turned chat on for a private preview**: one known reviewer, on an
> unadvertised and `noindex` URL, behind a rate limit and a daily spend ceiling. It is the
> same Render service and the same database — extended, not replaced, which is why this file
> is `DEPLOYMENT.md` and not something admin-specific.
>
> **It is still not a public launch.** No privacy or terms pages, no consent notice, no
> custom domain, and the Login modal is still a prop that discards what it collects. Those
> belong to Feature 21, which is about opening the door to *strangers* rather than about
> deploying. Section [Going from private preview to public](#going-from-private-preview-to-public)
> lists what has to change.

Everything the researcher needs lives behind a login at `https://<your-service>/admin`; the
student app is the root of the same URL.

> **Steps marked 👤 only you can do.** They involve creating accounts and entering secrets,
> which is deliberately not something to hand to an assistant or paste into a chat log.

---

## What you are building

```
Student's browser    ──▶ ┐
                         ├─▶ Render (API + admin UI + student app) ──▶ Supabase Postgres
Researcher's browser ──▶ ┘                    │                          care_patterns
                                              │                          conversations
                                              └──▶ OpenAI                messages
                                                   embeddings + replies   canned_responses
```

One origin serves everything: `/` is the student app, `/admin` the researcher's tool,
`/health`, `/chat`, `/public-config` and `/inspect` the API. Nothing is cross-origin, so CORS
is not a consideration for either client.

**`POST /chat` is on, and what makes that safe is not the URL being unadvertised.** Until
Feature 24 this service ran with `ENABLE_CHAT_ROUTES=false`, because an open,
unauthenticated, token-spending chat endpoint on the public internet is the one thing a
deployment must not create. Two bounds replaced that switch, both declared in
[`render.yaml`](../render.yaml) so they are reviewable in the repository:

| Bound | Default | What it stops |
| --- | --- | --- |
| `CHAT_RATE_LIMIT_MAX` per `CHAT_RATE_LIMIT_WINDOW_MS`, per client IP | 40 per 10 min | One client looping the endpoint. Sized for the heaviest legitimate use — a live demo with the inspector's comparison switch on — because it is the only limit a real person could meet. |
| `CHAT_DAILY_BUDGET_USD` for the whole instance, per UTC day | $5 | Everything else. A per-IP limit says nothing about a hundred IPs; this is the bound that makes the worst case a number. ~120 conversations at the measured $0.034–0.042 each. |

The ceiling is counted **in memory**, so a restart resets it and a busy day could in
principle cost twice the figure. That is the accepted trade at one free instance — see
`services/api/src/chat-limits.ts`. When it is reached, `POST /chat` answers 503 and the chat
page says InnerSun is busy; nothing else on the service is affected.

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

This applies every migration in `db/migrations` — `0001` through `0007` today — and records
each in `schema_migrations`, so re-running is a no-op.

> ### ⚠️ Run this on EVERY deploy, not only when you think a migration is new
>
> **Render deploys code. It never touches the database.** Nothing in the build, the start
> command or the health check will tell you the two have drifted apart, and the symptom is
> not a failed deploy — it is a service that starts cleanly, passes its health check, and
> then fails at runtime on the one feature that needed the new column.
>
> This is not hypothetical. **It happened on the Feature 24 deploy** (2026-09-02). The
> hosted database was still on `0004` from the Feature 17 hosting slice, while Features 8,
> 9 and 11 had added `0005`–`0007` locally in the months since — `conversations.summarized_message_count`,
> `messages.usage`, the `safety_events` table, `conversations.booking_nudged_at`. The deploy
> succeeded, `/health` reported `"db":"up"` because it runs a trivial query, `/` served the
> app, `/admin` worked — and **every single chat turn returned `503 storage_unavailable`**.
> Three migrations and one command fixed it.
>
> The trap is that the person deploying knows what *this* feature added, and the gap is
> everything that accumulated since the *last* time anyone ran this. So run it as a step,
> unconditionally. It is a no-op when there is nothing to apply, and it prints what it did.

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
| `INSPECTOR_TOKEN` | A long random string — `openssl rand -base64 24` |
| `BOOKING_URL` | The practice's scheduling link — **leave blank for now, there isn't one yet** |

**Both were added by Feature 24**, so an instance created before then will not have them; add
them under *Environment* and redeploy.

- **`BOOKING_URL` is deliberately unset on the preview** (decided 2026-09-02 — the practice has
  no scheduling link yet). Unset switches the booking nudge off entirely, which is a supported
  state rather than a degradation: inviting a student to book a counselor and then handing
  them nowhere to go is worse than not asking. The consequence is that **no conversation
  invites anyone to book**, and the home page's "Talk to a human" button scrolls to the team
  section instead of opening a scheduler — no dead link, but no funnel either. Say so to the
  reviewer rather than letting her wonder where it went. The startup log reports `booking
  nudge ready configured: false`. When a link exists, paste it here and redeploy; nothing else
  changes, and a malformed value is refused at startup rather than shipped.
- **`INSPECTOR_TOKEN` unset means the retrieval inspector does not exist**: no debug payload
  is built and a response is byte-identical to an ordinary visitor's. That is the right
  default for a public service and the wrong one here, because the inspector is what makes
  the differentiator visible in a screenshot — a live chat hides the fact that a reply is
  grounded in researcher-authored guidance.

  **Treat it as rotatable.** It grants read access to the Care Pattern library's titles,
  similarity scores and guidance text — the product's core asset — and nothing else: it
  cannot create, edit, publish or retire a pattern, and it is *not* the admin session, which
  can. Changing the value here and redeploying is the entire revocation procedure. Hand it
  over the same way you hand over a password, and expect to change it after a demo.

`DATABASE_SSL_CA` accepts either a file path or the certificate text itself. On Render,
paste the text: a hosting platform takes environment variables easily and files awkwardly.

> **Renaming the service is not a dashboard edit.** Render will not let you change a name the
> blueprint owns, and changing `name:` in `render.yaml` makes Render create a *new* service:
> new URL, every `sync: false` secret re-entered by hand, and the old service left running
> until you delete it. The database is Supabase, so Care Patterns, admin accounts and
> conversations are untouched by any of it. Done once, on 2026-09-02, while the preview link
> had gone to nobody — the same change after the link circulates breaks live bookmarks.

**Do not set `API_HOST`.** The service binds `0.0.0.0` automatically when the platform
provides `PORT`; a stray `API_HOST` would bind loopback, and the failure mode is a service
that starts cleanly, logs nothing wrong, and times out its health check with no
explanation. The startup log warns if it detects this combination.

The free plan spins down when idle, so the first request after a quiet spell takes roughly
50 seconds. Worth telling your researcher, so a slow first load does not read as broken.

---

## 4. Create the researcher's account

```bash
DATABASE_SSL_CA="$HOME/Downloads/prod-ca-2021.crt" \
  DATABASE_URL="<your-supabase-uri>" \
  npm run admin:create -- --email her@example.com --name "Her Name"
```

This prints a temporary password **once**. Send it over something better than email — a
password manager's secure-send, or a signal message. She will be required to choose her own
password on first sign-in, and the temporary one stops working at that point.

Give yourself an account too, with `--role admin`.

**Students need no account at all** — the chat app is anonymous, which is the product's
promise and the reason the private preview needs no login to be private. Accounts here are
only for the researcher admin tool.

---

## 5. Smoke test

One script walks the whole preview the way the reviewer will — the page loads, a message
gets a reply, the reply is grounded in a Care Pattern, a crisis message is screened, a
student who asks for a human is handed a link, and both languages work:

```bash
npm run preview:smoke -- --base https://innersun.onrender.com --inspector-token "$INSPECTOR_TOKEN"
```

It talks to the deployed instance over HTTP and nothing else — no database connection, no
OpenAI key, no access to the server's environment. That is the point: it is the only check
in this repository that can catch the things the code cannot see, like a bundle built with
the wrong `PUBLIC_URL` or a secret nobody pasted.

**It spends real money on that instance** — about five chat turns, roughly $0.20, counted
against the daily ceiling. Pass `--skip-chat` for the free half (health, the served bundle,
`noindex`, the admin tool) when all you want to know is whether a deploy came up. Without
`--inspector-token` it runs everything except the two inspector checks and says so, and it
skips the two booking checks on an instance with no `BOOKING_URL` rather than failing them.

A free instance takes ~50 seconds to wake, so the first request is slow rather than broken;
the script waits 90 seconds before giving up.

**If the chat checks fail with `503` while everything else passes, run the migrations** (step
2 above) before looking anywhere else. `503 storage_unavailable` on every turn, with
`/health` still reporting `"db":"up"`, is the signature of a hosted database that has fallen
behind `db/migrations` — the health check runs a trivial query and does not touch the columns
a chat turn needs.

The individual pieces, if you want them by hand:

```bash
BASE=https://innersun.onrender.com

curl -s $BASE/health                                     # {"status":"ok", … "db":"up"}
curl -s -o /dev/null -w "%{http_code}\n" $BASE/            # 200 — the student app
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin/      # 200 — the researcher's tool
curl -s -o /dev/null -w "%{http_code}\n" $BASE/admin/api/care-patterns   # 401
curl -sI $BASE/ | grep -i x-robots-tag                   # noindex, nofollow
curl -s $BASE/public-config                              # {} until BOOKING_URL is set
```

Then sign in to `/admin`, create a Care Pattern, press Save, then Publish.

Results from the first deploy (2026-08-16, admin only): `db: "up"`, `/admin/` 200,
`/admin/api/*` 401, `POST /chat` 404 — confirming chat was not exposed — `http://` redirects
to `https://`, and the login rate limiter reports a per-client budget, which is `trustProxy`
working; without it every visitor would share one global allowance.

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

## Switching chat off in a hurry

If the link leaks, the bill moves, or anything about the preview needs to stop:

1. Set `ENABLE_CHAT_ROUTES=false` in Render's dashboard and redeploy. `POST /chat` then
   answers 404 exactly as an unknown route does, the student app still loads but can no
   longer send anything, and the admin tool is untouched. This is the state the service ran
   in from August until Feature 24, so it is a known-good configuration rather than an
   improvisation.
2. Lower `CHAT_DAILY_BUDGET_USD` instead if the problem is cost rather than exposure — the
   endpoint keeps working until the day's ceiling is hit, then answers 503.
3. Change `INSPECTOR_TOKEN` if what leaked was the demo credential. Nothing else needs to
   change; it grants read access to Care Pattern content and no ability to alter it.

A monthly budget cap in the OpenAI dashboard is worth having regardless — it is the only
limit that survives a mistake in this repository.

---

## Going from private preview to public

Feature 24 deliberately shipped a preview, not a launch. What is knowingly missing, and
belongs to **Feature 21**:

- **No privacy policy, terms, or consent notice**, while conversations — crisis disclosures
  included — are stored in Postgres. Acceptable for one reviewer who is a co-owner and knows
  it; binding the moment a stranger can reach the site. See ARCHITECTURE.md §10.
- **The crisis resource list has not been reviewed by a researcher**
  (`services/api/src/crisis-resources.ts`). Scheduled immediately, and it must not still be
  unreviewed when strangers arrive.
- **`noindex` is on** — the meta tag in `apps/web/public/index.html`, `robots.txt`, and the
  `X-Robots-Tag` header the API sends on every response. All three come off together.
- **Cosmetic defects ship on purpose**: the Login modal collects a password and discards it,
  the team page is placeholder profiles, `/privacy` and `/terms` are dead links.
- **No custom domain.** The URL is still an `onrender.com` subdomain. The service itself was
  renamed from `innersun-admin` to `innersun` on 2026-09-02, once it served both apps — but
  that is as far as a free Render subdomain goes.

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
