# db — PostgreSQL + pgvector

The single data store for InnerSun: relational data **and** Care-Pattern embeddings live
in one PostgreSQL database with the [`pgvector`](https://github.com/pgvector/pgvector)
extension (no separate vector DB at V1 scale — see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)).

Everything runs on **localhost** for V1. Built in **Feature 3** of [docs/PLAN.md](../docs/PLAN.md).

## Prerequisites

- **Docker Desktop** (or a Docker Engine with `docker compose`) — used to run Postgres locally.
- Repo dependencies installed from the root: `npm install`.
- A root **`.env`**: `cp .env.example .env`. It is git-ignored, so it does **not** travel with the
  repo — expect to recreate it on every new machine. The default `DATABASE_URL` already matches
  the Docker credentials, so no edits are needed to get started.

## One-command start

From the **repo root**:

```bash
npm run db:up        # start Postgres 16 + pgvector in Docker (detached)
npm run db:migrate   # create the schema
npm run db:seed      # load the starter Care Patterns + canned responses (embeds via OpenAI)
npm run db:verify    # prove semantic retrieval returns the right pattern for a student's words
```

`db:seed` calls OpenAI to embed each pattern's `situation`, so it needs a real
`OPENAI_API_KEY`. To stand the database up without one, seed placeholder vectors instead
and upgrade them later:

```bash
npm run db:seed -- --fake      # deterministic placeholder vectors, no OpenAI key needed
npm run db:reembed -- --stale  # replace them with real embeddings once a key is set
```

`npm run db:up` uses [`docker-compose.yml`](docker-compose.yml) with the official
`pgvector/pgvector:pg16` image. Credentials/db name match the default `DATABASE_URL`
in [`.env.example`](../.env.example):
`postgresql://postgres:postgres@localhost:5432/innersun`.

To confirm the API can reach the DB, start the API (`npm run dev:api`) and hit the
health check — it reports `"db": "up"`:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"@innersun/api","version":"0.1.0","db":"up"}
```

## Browsing the data

Any PostgreSQL client works — [TablePlus](https://tableplus.com) (native macOS app) and the
official **PostgreSQL** extension for VS Code (`ms-ossdata.vscode-pgsql`) are both fine. Connect with:

| Field | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| User / Password | `postgres` / `postgres` |
| Database | `innersun` |

These are local-dev-only credentials from [`docker-compose.yml`](docker-compose.yml) — not secrets.
The container must be running (`npm run db:up`) or the client will just time out.

Or use `psql` inside the container, no local install needed (`\dt` lists tables, `\q` quits):

```bash
docker exec -it innersun-db psql -U postgres -d innersun
```

**Expect most tables to be empty.** Only `care_patterns` (3 rows) and `canned_responses` (2) are
seeded; `users`, `conversations`, `messages`, `consents`, and `bookings` are structure created
ahead of the features that fill them. `care_patterns.embedding` renders as 1536 numbers in a GUI —
that is the vector, and it is placeholder data until Feature 6.

## Scripts

| Root command | What it does |
| --- | --- |
| `npm run db:up` | Start the local Postgres + pgvector container (detached) |
| `npm run db:down` | Stop the container (**keeps** data) |
| `npm run db:down:clean` | Stop the container and **delete** its data volume |
| `npm run db:migrate` | Apply pending `migrations/*.sql` (idempotent; tracked in `schema_migrations`) |
| `npm run db:seed` | Upsert the starter seed data. Idempotent, and only embeds patterns whose `situation` actually changed — a second run costs nothing. `-- --fake` uses placeholder vectors |
| `npm run db:reset` | Drop + recreate the schema, then migrate + seed (**destructive**; local databases only) |
| `npm run db:verify` | Embed student-style queries and assert the right Care Pattern ranks first |
| `npm run db:reembed` | Re-embed every pattern (use after changing the embedding model). `-- --stale` limits it to rows that need it |
| `npm run db:export:patterns` | Write the live patterns to `seeds/exported-care-patterns.json` as a version-controlled backup. `-- --remote` reads the hosted database |
| `npm run db:pull:patterns` | Copy Care Patterns from the hosted database into the local one |

### Guard on the destructive scripts

`db:reset` and `db:seed` refuse to run unless `DATABASE_URL` points at localhost. Once a
hosted database holds the researcher-authored knowledge base, a mistakenly-pointed `.env`
would destroy or overwrite it in one command with no undo. To reach the hosted database on
purpose, pass `-- --allow-remote`; to work with its content locally, use `db:pull:patterns`
rather than repointing `DATABASE_URL`.

## Layout

```
docker-compose.yml   Local Postgres 16 + pgvector
migrations/          Ordered *.sql schema migrations (0001 = initial schema, 0002 = embedding provenance)
seeds/               Starter seed data (synthetic, de-identified) + exported backups
scripts/             Migration runner, seeder, reset, verify, reembed, export, pull (TypeScript, via tsx)
scripts/lib/         Shared helpers: env, embedding, vector, guard, CLI args
```

## Schema (0001_init.sql)

| Table | Purpose |
| --- | --- |
| `users` | Registered users (anonymous chat needs no row) |
| `care_patterns` | Researcher-authored knowledge base + `vector(1536)` embedding + `source_refs` |
| `conversations` | Chat sessions (nullable `user_id` = anonymous) + running `summary` |
| `messages` | Individual turns in a conversation |
| `consents` | Consent choices (logging / service-improvement) |
| `bookings` | "Talk to a human" counselor requests |
| `canned_responses` | Bilingual FAQ answers (DB-backed, editable without deploy) |

`care_patterns.embedding` is a `vector(1536)` (OpenAI `text-embedding-3-small`) with an
**HNSW** cosine index (`vector_cosine_ops`) for top-N retrieval.

## Notes

- **Migrations are reproducible from scratch:** on a fresh DB, `db:migrate` builds the
  full schema in order; each file runs in its own transaction and is recorded so re-runs
  are no-ops.
- **Only `situation` is embedded.** A student's message is matched against a description of
  a *situation*, never against the counselor guidance that situation calls for — embedding
  the strategies too would pull the match toward advice language and degrade it.
- **`status` gates retrieval, and new patterns are drafts.** A pattern is `draft` until
  someone publishes it, so writing one never puts it in front of a student by itself; only
  `published` rows are retrieved, and `retired` ones stay readable and restorable. The seed
  sets `status` explicitly rather than relying on the default, so nothing becomes
  retrievable by omission.
- **`needs_embedding` marks a row whose vector cannot be trusted** — never embedded, left
  over from a failed save, or a `--fake` placeholder. Such a row is invisible to retrieval,
  which is a silent failure, so it is flagged rather than left looking healthy.
  `db:reembed -- --stale` sweeps them up and `db:verify` refuses to run while any exist.
- **Vectors from different models are not comparable.** `embedding_model` records which
  model produced each vector so a model change is detectable; mixing them would produce
  meaningless similarity scores rather than an error.
- **`db:down` keeps your data; `db:down:clean` destroys it.** The rows live in a Docker *volume*
  (`db_innersun-db-data`) that outlives the container, which is why `db:down` → `db:up` comes back
  with the schema intact and `db:migrate` reports "Schema up to date".
- **Never edit an already-applied migration.** Add `0002_*.sql` alongside it. The runner records
  what it has applied, so an edit to `0001_init.sql` is silently skipped on machines that already
  ran it while a fresh clone gets the new version — the usual way schemas drift apart.
- **`.env` is read once at process start**, and `tsx watch` does not watch it. After changing a
  value there, restart the API — the running process keeps the old connection string.
- The SQL migrations are plain Postgres, so they port directly to the Supabase CLI / hosted
  Supabase when deployment (Feature 21) lands.
