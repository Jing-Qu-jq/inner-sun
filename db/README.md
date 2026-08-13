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
npm run db:seed      # load sample Care Patterns + canned responses
npm run db:verify    # prove pgvector cosine top-N search works on the seed rows
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
| `npm run db:seed` | Upsert the sample seed data (idempotent) |
| `npm run db:reset` | Drop + recreate the schema, then migrate + seed (destructive) |
| `npm run db:verify` | Run a cosine top-N query against seed rows and assert it works |

## Layout

```
docker-compose.yml   Local Postgres 16 + pgvector
migrations/          Ordered *.sql schema migrations (0001_init.sql = initial schema)
seeds/               Sample seed data (synthetic, de-identified)
scripts/             Migration runner, seeder, reset, and verify (TypeScript, run via tsx)
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
- **Seed embeddings are placeholders.** Feature 3's seeds use a deterministic pseudo-embedding
  (no OpenAI key needed just to stand up the DB). **Feature 6** loads the real starter set and
  embeds each pattern's `situation` with OpenAI.
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
