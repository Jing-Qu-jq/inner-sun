# InnerSun

AI counseling chat for international students — an empathetic, Care-Pattern-grounded AI
that acts as a hook toward booking a real human counselor. English + 简体中文.

This is a **monorepo**. For V1 everything runs on **localhost**; deployment is the last step.
See the build plan in [docs/PLAN.md](docs/PLAN.md) and the system design in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Layout

```
apps/web         React SPA (the existing prototype)
services/api     Node + TypeScript backend orchestrator (Fastify) — owns all OpenAI calls
packages/shared  Shared TypeScript types (CarePattern, ChatMessage, API shapes)
db/              Database migrations & seeds (PostgreSQL + pgvector) — added in Feature 3
docs/            Product/architecture docs and the V1 plan
```

Managed with **npm workspaces** (npm 8+, Node 18+).

## Prerequisites

- Node.js 18+ and npm 8+

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

## Run web + api together (localhost)

```bash
npm run dev
```

This builds the shared types, then starts both:

- **Web** (React) → http://localhost:3000
- **API** (Fastify) → http://localhost:3001 (health check: http://localhost:3001/health)

The web app proxies to the API in development (see `apps/web` `proxy` setting).

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run web + api locally (this is the main dev command) |
| `npm run dev:web` | Run only the web app |
| `npm run dev:api` | Run only the API |
| `npm run build:shared` | Compile `packages/shared` types |
| `npm run build:web` | Production build of the web app |
| `npm run build:api` | Compile the API to `services/api/dist` |
| `npm run deploy:web` | Publish `apps/web` to GitHub Pages (prototype hosting) |

## GitHub Pages (prototype)

The existing prototype stays publishable from `apps/web` via `npm run deploy:web`
(uses hash routing, so no base path config is needed). See
[apps/web/README.md](apps/web/README.md) for details.
