# InnerSun

AI counseling chat for international students — an empathetic, Care-Pattern-grounded AI
that acts as a hook toward booking a real human counselor. English + 简体中文.

This is a **monorepo**. For V1 everything runs on **localhost**; deployment is the last step.
See the build plan in [docs/PLAN.md](docs/PLAN.md) and the system design in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Layout

```
apps/web         React SPA (the existing prototype) — the student-facing chat app
apps/admin       Researcher admin tool (Vite + React), served by the API at /admin
services/api     Node + TypeScript backend orchestrator (Fastify) — owns all OpenAI calls
packages/shared  Shared TypeScript types (CarePattern, ChatMessage, API shapes)
db/              Database migrations & seeds (PostgreSQL + pgvector) — added in Feature 3
docs/            Product/architecture docs and the V1 plan
```

Managed with **npm workspaces** (npm 8+, Node 18+).

## Prerequisites

- Node.js 18+ and npm 8+
- **Docker Desktop** (for the local PostgreSQL + pgvector database — see [Database](#database-postgresql--pgvector))

## Install

From the repo root:

```bash
npm install
```

This installs dependencies for every workspace and links them together.

## Configure

```bash
cp .env.example .env
```

Fill in real values in `.env`. Secrets (like `OPENAI_API_KEY`) live **only** in the
git-ignored `.env` and are read **server-side** by `services/api` — never in the browser.

`OPENAI_API_KEY` is required: the API refuses to start without a real one (the
`.env.example` placeholder counts as missing) and tells you what to fix.

## Run web + api together (localhost)

```bash
npm run dev
```

This builds the shared types, then starts both:

- **Web** (React) → http://localhost:3000
- **API** (Fastify) → http://localhost:3001 (health check: http://localhost:3001/health)

The web app calls the API at an **absolute URL** (`REACT_APP_API_BASE_URL`, default
`http://localhost:3001`) rather than through a dev proxy, so local development exercises
the same cross-origin request a deployed build will — a CORS mistake surfaces now instead
of at deploy time. Note that Create React App reads `REACT_APP_*` from `apps/web/.env` or
the shell, **not** from the repo-root `.env`.

## Run the admin tool (localhost)

The researcher admin tool is a separate app served by the API at `/admin`. Two ways to run
it, good at different things:

```bash
npm run build:admin && npm run dev:api   # → http://localhost:3001/admin
```

Closest to production — same origin, same cookie behaviour. Every UI change needs a rebuild.

```bash
npm run dev:api      # terminal 1
npm run dev:admin    # terminal 2   → http://localhost:3002/admin/
```

Hot reload, with Vite proxying `/admin/api/*` to the API.

You will need an account — there is no sign-up:

```bash
npm run admin:create -- --email you@example.com --name "Your Name" --role admin
```

See [`apps/admin/README.md`](apps/admin/README.md) for the details, including why to
confirm session behaviour in the first mode.

## Database (PostgreSQL + pgvector)

The API reads/writes a local PostgreSQL database (with the `pgvector` extension for
Care-Pattern embeddings). It runs in Docker — start it once, then migrate + seed:

```bash
npm run db:up        # start Postgres 16 + pgvector (Docker, detached)
npm run db:migrate   # create the schema
npm run db:seed      # load sample data
npm run db:verify    # prove cosine top-N vector search works
```

The API connects via `DATABASE_URL` (see `.env.example`); `GET /health` reports
`"db": "up"` once it can reach the database. Full details and the schema overview live in
[db/README.md](db/README.md).

## The chat API

`POST /chat` is the one endpoint the web app talks to for conversation. The OpenAI key
stays in the API process; the browser never sees it.

```bash
# First message — omit conversationId, and the response tells you the new one.
curl -s localhost:3001/chat -H 'Content-Type: application/json' \
  -d '{"message":"I have been feeling homesick lately"}'
```

```jsonc
// Response
{ "conversationId": "…uuid…", "reply": "…", "locale": "en" }
```

Send that `conversationId` back on every later message so the server can thread the
history. `locale` is optional (`en` or `zh-CN`, default `en`) and may change mid-conversation.

Notes for now: history is held **in memory**, so it is lost when the API restarts and an
old `conversationId` then returns `404` — Feature 5 moves it into the `conversations` and
`messages` tables. Care Pattern retrieval (Feature 7) is not wired in yet, so the prompt's
guidance section is still empty.

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run web + api locally (this is the main dev command) |
| `npm run dev:web` | Run only the web app |
| `npm run dev:api` | Run only the API |
| `npm run dev:admin` | Vite dev server for the admin tool on :3002 (needs `dev:api` too) |
| `npm run build:shared` | Compile `packages/shared` types |
| `npm run build:web` | Production build of the web app |
| `npm run build:admin` | Build the admin tool; `build:api` copies it into the API's `dist/public` |
| `npm run build:api` | Compile the API to `services/api/dist` |
| `npm run admin:create` | Create an admin account (`-- --email … --name … [--role admin]`) |
| `npm run retrieval:calibrate` | Score labelled cases through the live RAG pipeline and recommend the relevance floor |
| `npm run deploy:web` | Publish `apps/web` to GitHub Pages (prototype hosting) |
| `npm run db:up` / `db:down` | Start / stop the local Postgres + pgvector container |
| `npm run db:down:clean` | Stop the container **and delete its data volume** |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load the starter Care Patterns (`-- --fake` to skip OpenAI) |
| `npm run db:reset` | Drop + recreate the schema, then migrate + seed (**local only**) |
| `npm run db:verify` | Assert student-style queries retrieve the right Care Pattern |
| `npm run db:reembed` | Re-embed patterns (`-- --stale` for only those that need it) |
| `npm run db:export:patterns` | Write live patterns to a version-controlled backup file |
| `npm run db:pull:patterns` | Copy Care Patterns from the hosted database into the local one |

## GitHub Pages (prototype)

The existing prototype stays publishable from `apps/web` via `npm run deploy:web`
(uses hash routing, so no base path config is needed). See
[apps/web/README.md](apps/web/README.md) for details.
