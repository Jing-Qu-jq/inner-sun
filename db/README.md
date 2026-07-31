# db — PostgreSQL + pgvector

The single data store for InnerSun: relational data **and** Care-Pattern embeddings live
in one PostgreSQL database with the [`pgvector`](https://github.com/pgvector/pgvector)
extension (no separate vector DB at V1 scale — see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)).

Everything runs on **localhost** for V1. Built in **Feature 3** of [docs/PLAN.md](../docs/PLAN.md).

## Prerequisites

- **Docker Desktop** (or a Docker Engine with `docker compose`) — used to run Postgres locally.
- Repo dependencies installed from the root: `npm install`.

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
- The SQL migrations are plain Postgres, so they port directly to the Supabase CLI / hosted
  Supabase when deployment (Feature 21) lands.
