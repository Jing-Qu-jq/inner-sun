# InnerSun — V1 Build Plan

> Goal: build, feature by feature, until the app is a **V1 ready to demo to investors**.
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md). Every feature has **Acceptance Criteria (AC)** — the
> checklist that means "done." Build in order; each feature notes what it depends on.

## How to use this plan
- Work one feature at a time. A feature is **done** only when all its AC pass.
- **Everything runs on `localhost`,** with one deliberate exception (below). Full deployment is the **last** feature.
- The current prototype stays on GitHub Pages untouched until then.
- ✅ = done and verified · 🟡 = in progress · 🟢 = in V1 scope, not started. Anything marked *Future* in the architecture is intentionally out of scope here.
- **Features are not strictly in build order.** Feature 17 was pulled forward from Phase 3, and Feature 22 was added and built straight after Feature 7; the reason is recorded in each one's own section. Check each feature's status marker rather than assuming the numbering is the sequence.

### The one exception to localhost-only (2026-08-15)
A researcher joined to author the Care Pattern knowledge base, so **Feature 17's admin tool
plus the database it writes to are hosted early** — see Feature 17 for the full reasoning.
Scoped as narrowly as possible: the hosted service serves the admin UI and its API and
nothing else. `POST /chat` is switched off there (`ENABLE_CHAT_ROUTES=false`), the student
chat app stays on localhost, and the GitHub Pages prototype is untouched. Everything else
in this plan is still built and verified locally, and Feature 21 still owns real deployment.

## Stack decisions (locked for V1)
- **Frontend:** the existing React SPA (`inner-sun`), cleaned up and wired to our own backend.
- **Backend:** **Node + TypeScript** orchestrator (**Fastify** — chosen in Feature 1). One language across FE/BE → shared types.
- **Database:** **PostgreSQL + `pgvector`** — Docker Compose locally (Feature 3), Supabase hosted (below).
- **AI:** OpenAI — `gpt-4o` (reply), `gpt-4o-mini` (classify/safety/summarize/normalize), `text-embedding-3-small`.
- **Repo:** single **monorepo** (`web` / `api` / `db` / `shared`), per the architecture discussion.
- **Languages:** English + 简体中文 from the start (extensible).
- **Eventual hosting:** frontend beside backend — **deferred to the last feature**, except the Feature 17 admin slice noted above.
- **Managed Postgres: Supabase** (chosen 2026-08-15 for the Feature 17 slice). It was already the direction this plan assumed — the Feature 3 migration comments anticipate reconciling `users` with `auth.users`, and Feature 12 plans to use its Auth — so picking it now means Feature 21 inherits the work rather than redoing it. Migrations are plain SQL and port unchanged. **Render** hosts the admin service; free instances spin down when idle, so the first load after a break is slow.

---

# Phase 0 — Foundations

## Feature 1: Monorepo scaffolding & local dev environment ✅ (done)
Turn the single-folder prototype into a monorepo the backend can live in, runnable locally with one command.
**Depends on:** nothing.
**AC (all met — re-verified 2026-08-13):**
1. ✅ Repo restructured to npm workspaces: `apps/web` (`@innersun/web`, the React app moved via `git mv`), `services/api` (`@innersun/api`, Fastify + TS), `packages/shared` (`@innersun/shared`), and `db/` (filled in by Feature 3).
2. ✅ `packages/shared` exports `CarePattern`, `ChatMessage`, `ChatRequest`, `ChatResponse`, `ApiError`, `HealthResponse`, and `Locale`.
3. ✅ Root [README](../README.md) documents `npm install` and `npm run dev` (plus `dev:web` / `dev:api` individually).
4. ✅ `.env.example` lists all 9 required vars (`NODE_ENV`, `API_HOST`, `API_PORT`, `WEB_ORIGIN`, the four `OPENAI_*`, and `DATABASE_URL`); `.env` is git-ignored.
5. ✅ `npm run dev` boots both: web on `:3000` (HTTP 200) and the API on `:3001` (`/health` → `"db":"up"`), no errors in the combined output.
6. ✅ GitHub Pages build still works: `CI=true npm run build:web` succeeds lint-gated and targets the `/inner-sun/` base path, with `deploy: gh-pages -d build` intact.

## Feature 2: Clean up the current UI & fix known prototype bugs ✅ (done)
Make the existing UI presentable and correct before wiring real logic behind it.
**Depends on:** Feature 1.
**AC (all met):**
1. ✅ Removed placeholder content ("This is some text within a card body.") and the dead "Meet Our Team" nav link (later re-added as a *working* scroll link — see below).
2. ✅ Fixed the chat message-state bug: messages append immutably via functional `setState`, and each send's own placeholder is replaced by a stable id — correct under rapid/overlapping and out-of-order replies (covered by `components/Chat/index.test.js`).
3. ✅ Verified no CarClarity/automotive content remains anywhere in `apps/web` (the old prompt was repurposed into `services/api/src/prompts/system-prompt.md` in Feature 1).
4. ✅ Home renders hero + team carousel cleanly; the carousel is clearly marked *sample content* (section note + per-card "Sample" badge + sample-marked photo alt text).
5. ✅ No console errors on Home or Chat (verified in a real browser via the DevTools Protocol: 0 runtime errors, EN and 中文).
6. ✅ Replaced the default CRA `/learn react/i` test with real smoke tests (`App.test.js`) plus the Chat rapid-send test.
7. ✅ Added `apps/web/public/favicon.ico` (generated from the logo) and referenced it in `index.html`.

**Also delivered in this feature (scope grew during review):**
- **react-bootstrap 1.6.8 → 2.10.10** — aligned the component library with the Bootstrap 5 CSS the app already ships (fixed API drift like `<Badge bg=…>`).
- **Working "Meet Our Team" nav** — smooth-scroll to the team section; works cross-route (from `/chatPage` it navigates home via router state, then scrolls).
- **Home-page build-out** so the section nav has real content: refreshed hero (gradient scrim, sun-accent CTAs, swappable `hero_image.png`), **How it works** (3 steps), **Why InnerSun** (value cards), a **Trust & safety** strip (incl. not-a-medical-device + crisis note), and a closing **CTA band**. *(Overlaps the eventual Feature 18 polish; the final trust/team copy + responsive pass still lands there.)*
- **China ↔ US ConnectionMap section** — a **real** world map (`react-simple-maps` + `world-atlas`) with the **US, China, and Taiwan** "lit up" and a connecting arc + travelling pulse; data-driven (`HIGHLIGHTED` set) so more countries light up with a one-line change. Clean styling — no country labels or flag markers — with the frame cropped tight around the inhabited latitudes.
- **Chat empty-state** — before the first message the chat page shows a warm intro (heading + subtext), a **safety disclaimer** ("supportive conversation, not medical advice or emergency care… in a crisis contact local emergency services"), and four **suggested starter prompts** (homesickness, academic stress, making friends, "talk to a real counselor"). Clicking a starter pre-fills the input and focuses it. *(The disclaimer front-runs Feature 9 AC4; the starters are a precursor to Feature 10's quick-reply chips — for now they pre-fill rather than send/return canned answers, since the backend lands in Feature 5.)*
- **Warm "inner sun" palette** — coordinated the whole page: warm-charcoal header/footer/trust strip, Bootstrap `primary` recolored to the sun accent, cream sections. Styling leans on Bootstrap 5 utilities with only a tiny custom layer (brand tokens, gradients, hero scrim, icon badge, map keyframes).
- **Icon system** — `react-bootstrap-icons` + a reusable `IconBadge` (circular badges) replacing emoji in the value cards and trust strip.
- **Lightweight i18n (EN / 简体中文)** — `src/i18n/` context + dictionaries; the header Language toggle switches the whole UI (nav, hero, all sections, chat empty-state, map labels, footer, login) and persists via `localStorage`; adding a locale = one new dictionary. *(This front-runs the UI-string part of Feature 15; the AI **reply** localization stays server-side and is still owned by Feature 15.)*
- **Responsive polish** — mobile hero text spans full width with compact CTAs; a shorter hero on tablet/portrait-iPad viewports; and tightened inter-section spacing (`py-4 py-lg-5`) so mobile/tablet aren't over-spaced. Verified via headless-Chrome screenshots at phone (390px), iPad (768px), and desktop widths.

## Feature 3: Database setup — PostgreSQL + pgvector ✅ (done)
Stand up the single data store for everything (relational + vectors).
**Depends on:** Feature 1.
**Recommendation (my suggestion):** **PostgreSQL + the `pgvector` extension**, hosted on **Supabase**.
- *Why Postgres + pgvector:* one database holds Care Patterns **and** their embeddings **and** users/memory/bookings — no separate vector DB needed at our scale (per the architecture).
- *Why Supabase specifically:* managed Postgres with `pgvector` built in, **plus built-in Auth and Storage** (which accelerates the login feature, Feature 9), a generous free tier, and a local dev stack via the Supabase CLI (Docker).
- *Alternative:* **Neon** (excellent serverless Postgres with branching) if you'd rather roll your own auth. Either works; pick Supabase to get auth "for free."
- *Local dev:* run Postgres locally (Supabase CLI or a `pgvector/pgvector` Docker image) so no cloud account is needed to build.
**Chosen local runtime:** **Docker Compose + the official `pgvector/pgvector:pg16` image** (not the Supabase CLI). The migrations are plain Postgres SQL, so they port to Supabase unchanged.

✅ **The hosted provider is now settled: Supabase**, provisioned early for the Feature 17 admin tool rather than waiting for Feature 21. The Neon alternative above is kept as a record of the reasoning, not as an open question.

**AC (all met — verified against a live database, 2026-08-13):**
1. ✅ Local Postgres runs with `pgvector` enabled, one-command start (`npm run db:up` → healthy container; documented in [db/README.md](../db/README.md)).
2. ✅ `db/migrations/0001_init.sql` creates all 7 tables — `users`, `care_patterns` (`vector(1536)` embedding + `source_refs` + jsonb `locale_notes`), `conversations`, `messages`, `consents`, `bookings`, `canned_responses` — plus a shared `set_updated_at()` trigger. Applied through a tracked, idempotent runner (`schema_migrations`).
3. ✅ Cosine top-N works against seed rows: the matching pattern returns similarity `1.0000`, unrelated ones `0.0119` / `-0.0697`, using the HNSW `vector_cosine_ops` index (`npm run db:verify`).
4. ✅ The API connects via `DATABASE_URL` and `GET /health` reports `"db":"up"` — and correctly reports `"db":"down"` while the database is stopped, recovering to `"up"` when it returns.
5. ✅ Reproducible from scratch: after `db:down:clean` (volume destroyed), a fresh `db:up` → `migrate` → `seed` → `verify` produced identical results.

**Two defects found during runtime verification (fixed in `5d70596`):**
- **The API died whenever the database went away.** `pg`'s `Pool` forwards idle-client failures as an `'error'` event; with no listener registered Node treats it as unhandled and terminates the process. So instead of `/health` reporting `"db":"down"`, the whole service vanished — the opposite of what a health check is for. Fixed with a `pool.on("error", …)` handler in `services/api/src/db.ts` that logs and stays alive (the pool discards the broken client itself).
- **The API never read the root `.env`.** `config.ts` used bare `import "dotenv/config"`, which resolves `.env` from the *current working directory* — and the API runs with `services/api` as cwd. It silently fell back to hardcoded defaults that happened to be identical, hiding the bug: pointing `DATABASE_URL` at a dead port still reported `"db":"up"`. Fixed by resolving the repo-root `.env` by path (matching `db/scripts/lib/env.ts`), verified from both `src/` and `dist/`. This also unblocks `OPENAI_API_KEY` in Feature 4, where no fallback exists to mask the same failure.

**Notes for later features:**
- Seed embeddings were **deterministic placeholders**, not real vectors — standing up the DB needed no OpenAI key. ✅ **Feature 6 has since replaced them** with real `text-embedding-3-small` embeddings, which is when the similarity scores above became meaningful rather than merely mechanical. The placeholder path survives as `db:seed -- --fake` so a fresh database can still be stood up without a key.
- `users`, `conversations`, `messages`, `consents`, and `bookings` are intentionally **empty** — structure created here, populated by Features 5, 12, 16, and 20.
- `.env` is git-ignored and does **not** travel with the repo. On any new machine, `cp .env.example .env` is a required setup step (see [db/README.md](../db/README.md)).

## Feature 4: Backend orchestrator skeleton (fixes the exposed API key) ✅ (done)
Stand up the API service that will own all OpenAI calls — closing the current security hole where the key is in the browser.
**Depends on:** Features 1, 3.

**AC (all met — verified against a running server and live OpenAI, 2026-08-14):**
1. ✅ `POST /chat` exists and threads conversations against **live OpenAI**. A first message (no `conversationId`) returns a new uuid and a real counseling reply; sending that id back carries the history — turn 2 asked only "which of those would you start with?" and the model correctly resolved "those" against turn 1's advice. The message shape and history growth (`system,user` → `system,user,assistant,user` → …) were additionally verified against a local OpenAI-compatible stub via `OPENAI_BASE_URL`, which is the cheap way to exercise the orchestrator without spending tokens.
2. ✅ The key is read in exactly one place (`services/api/src/config.ts`) and appears nowhere in `apps/web`. A production web build (`CI=true npm run build:web`) contains no `sk-…` string, no `OPENAI_API_KEY`, and not the `.env` key's value. Client responses carry only `{conversationId, reply, locale}` — enforced by a response schema, so an undeclared field cannot leak even if a future handler sets one.
3. ✅ `services/api/src/openai.ts` is the single upstream caller; reply/utility/embedding models, the token cap, the timeout and an optional `OPENAI_BASE_URL` all come from env.
4. ✅ Malformed input returns a clean 4xx in every case tried: missing/empty/oversized/wrong-typed `message`, an unknown `locale`, a non-uuid `conversationId`, an undeclared extra property, and invalid JSON — all `400` with the `ApiError` envelope. An unknown-but-well-formed `conversationId` returns `404`. The locale list and length cap are imported from `@innersun/shared`, not re-typed.
5. ✅ Structured logging (pino) records `conversationId`, model, turn count, token usage and duration — and **no message content**, which matters for a mental-health product. Upstream failures map to `502`/`503`/`504` with a generic message while the full error and its `cause` go to the log only; the dummy key never appeared in any log line.

**Reply-language behavior: natural mirroring, by product decision.** The selected locale (the nav toggle, arriving as `locale`) sets where the conversation starts; the assistant then **mirrors the student's language naturally** if they switch, and honors an explicit request ("reply in Chinese"). The goal is parity with the chat assistants students already use — the conversation should not feel governed by a language rule they can sense.

This was settled by experiment. An earlier draft enforced the selected locale strictly and never mirrored; it was implemented and verified live before being reverted in favor of the natural behavior above. One engineering finding from that detour is worth keeping, should language behavior ever be constrained again: **deleting the "mirror" instruction is not enough to stop mirroring.** Answering in the language of the user's message is a strong `gpt-4o` default, and it reasserted itself until the counter-case was stated explicitly ("this holds even when the student's own message is in a different language"). Also note that **only a live model can verify any of this** — a stub proves the prompt carried the right locale label, which is not the same as the model obeying it. The regression matrix is: selected locale vs. message language in both directions, the explicit-request override, and a mid-conversation toggle switch. **Feature 15** owns full reply localization and its acceptance criteria.

Live testing also surfaced that OpenAI returns `429` both for a momentary rate limit and for an account out of credit — opposite situations, since one clears by itself and the other never does. Only the `insufficient_quota` error code separates them, so they now map to distinct codes (`upstream_quota_exhausted` vs `upstream_rate_limited`); otherwise a billing problem reads as load and "please try again shortly" is wrong advice.

**A defect found during runtime verification:** Fastify's ajv defaults are lenient in two ways that quietly defeated AC 4. `coerceTypes` turned `{"message": 123}` into the string `"123"`, and `removeAdditional` silently stripped undeclared properties — so both cases sailed past validation and were sent to OpenAI as if valid, returning `502` rather than `400`. Static review would not catch this: the schema is correct, and it is the framework's defaults that override it. Both are now off (`ajv.customOptions` in `services/api/src/index.ts`), which is what makes `additionalProperties: false` and the declared types actually reject bad input.

**Design decisions worth carrying forward:**
- **A missing `OPENAI_API_KEY` stops startup** rather than failing on the first request, and the `.env.example` placeholder counts as missing — otherwise a freshly copied `.env` passes a presence check and dies later as an opaque upstream `401`. This is the Feature 3 `.env` lesson applied to a variable with no fallback to hide it.
- **Conversation history is in memory** (`services/api/src/conversations.ts`), capped at 20 turns with a 2-hour idle eviction. It is lost on restart, and an unknown `conversationId` is a `404` rather than a silently adopted id — so an id always denotes a conversation this server really created. **Feature 5** replaces this module with the `conversations`/`messages` tables from Feature 3.
- **The prompt's `{{care_pattern_strategies}}` slot renders empty** here; `{{locale}}` is filled. ✅ Feature 7 now fills the slot each turn from the Care Patterns it retrieved, and leaves it empty when nothing clears the relevance floor. `src/prompts/*.md` is copied into `dist/` by the build script, since `tsc` does not copy non-TS files.

**Note on the "exposed API key" in the title:** the browser-side OpenAI call in `apps/web/src/fetchers/ConversationFetcher.js` still exists (its key is the literal placeholder `your-api-key-here`, so nothing real is exposed today). This feature gives the key a safe server-side home; **Feature 5** is what deletes the browser's direct call to `api.openai.com`.

---

# Phase 1 — Core chat (the heart of the product)

## Feature 5: Wire the chat UI to our backend ✅ (done)
Replace the direct browser→OpenAI call with a call to our `/chat` API.
**Depends on:** Feature 4.

**AC (all met — verified in a real browser against the live API, OpenAI and PostgreSQL, 2026-08-14):**
1. ✅ `ConversationFetcher` posts to `POST {REACT_APP_API_BASE_URL}/chat` (default `http://localhost:3001`). The browser's own network log for a full session shows one CORS preflight and one `POST http://localhost:3001/chat` per turn and **zero requests to `api.openai.com`**. The old key, prompt and chat-history array are gone from the module.
2. ✅ A real message round-trips end to end: typed in the UI at `localhost:3000` → our API → OpenAI → reply rendered. Both **Enter** and the send button work.
3. ✅ History is in PostgreSQL, not client or process memory. Proven the way only durable storage can be: a conversation was continued **across a full API restart** and the model correctly resolved "which of those two…" against the pre-restart turn. `conversations`/`messages` rows show turns in order, `user_id` null (anonymous until Feature 12), and a mid-conversation language switch updating `conversations.locale`.
4. ✅ Loading state renders as a faded, pulsing "…" bubble; a failed turn replaces that placeholder with a distinct muted-red bubble instead of a fake assistant reply. Verified by stopping the API mid-session — "We couldn't reach InnerSun…" — and by four component tests covering the specific, generic and recoverable cases.
5. ✅ Nothing sensitive reaches the browser. A production build (`CI=true npm run build:web`) contains no `sk-…` string, not the real key's value, no `OPENAI_API_KEY`, and none of the system prompt (checked against seven distinctive phrases). The only `api.openai.com` occurrence anywhere in `build/` is inside a source comment describing what the code no longer does.

**What changed on the server.** Feature 4's in-memory `Map` is gone; `services/api/src/conversations.ts` now reads and writes the Feature 3 tables. Nothing is deleted — the last 20 turns are *replayed* to the model while the full transcript stays on record, which is what makes Feature 8's summarization, Feature 14's analytics and Feature 16's export/delete obligations possible at all. The system prompt is deliberately **not** stored: it is rebuilt every turn from the current locale and (from Feature 7) that turn's retrieved Care Patterns, so a stored copy would be a stale one.

**Design decisions worth carrying forward:**
- **Turns are sent one at a time**, queued in the Chat component. Two requests in flight against one conversation interleave server-side as user-1, user-2, reply-2, reply-1, and a first pair sent together creates *two* conversations because neither knows the id yet. Queueing costs nothing perceptible: both messages and their placeholders still appear instantly, only the network calls are ordered.
- **A stale conversation id is recovered, not surfaced.** If the API 404s an id (the database was reset, or a tab has been open a long time), the fetcher retries once without it and the student simply gets a fresh conversation. Verified end to end by deleting the row the browser was holding mid-session.
- **Errors carry a code, not a sentence.** The fetcher throws `ChatRequestError` with a machine-readable code and the component picks the wording, so error bubbles are translated at render time — an error already on screen re-renders in Chinese when the language toggle flips, like every other string in the UI.
- **A database failure is a deliberate 503**, not an unplanned 500: verified by stopping the container mid-session. The API survives, `/health` reports `db: "down"`, no OpenAI tokens are spent on a turn that cannot be stored, and the pool recovers on its own when the container returns.
- **The user's message is persisted before the upstream call**, so a turn is never lost to an OpenAI failure — the student's words are on record even when no reply is.
- **The web app calls an absolute API URL rather than using the CRA dev proxy** (the now-dead `proxy` field was removed from `apps/web/package.json`). Local development then exercises the very same cross-origin request a deployed build will, so a CORS mistake surfaces now instead of in Feature 21. Note that Create React App reads `REACT_APP_*` from `apps/web/.env` or the shell — **not** from the repo-root `.env`; the root `.env.example` documents the variable with that caveat.

**Not done here, on purpose:** the conversation id lives in page memory only, so a reload starts a visibly empty chat rather than silently resuming a transcript whose messages are no longer on screen. Rendering stored history belongs with accounts (Feature 12).

## Feature 6: Care Pattern data model + starter seed set ✅ (done)
Get real (or realistic) Care Patterns into the DB so matching has something to match against.
**Depends on:** Feature 3.

**AC (all met — verified against a live database and live OpenAI, 2026-08-15):**
1. ✅ `care_patterns` rows follow the v1 schema from Feature 3, unchanged. `0002_care_pattern_embedding_meta.sql` adds only *provenance* alongside the vector: `embedding_model`, `embedded_at`, `needs_embedding`.
2. ✅ **12 patterns** (up from Feature 3's three) covering homesickness, academic stress in a second language, social belonging, visa/immigration anxiety, financial pressure, family expectations, discrimination and microaggressions, sleep across time zones, imposter feelings, long-distance relationships, help-seeking stigma, and post-graduation uncertainty.
3. ✅ `situation` is embedded on insert/update with `text-embedding-3-small`, **once**: the seed compares stored text, model and flag before spending a call, so a second `db:seed` reports `0 embedded, 12 reused existing embedding`. All 12 embed in a single batched request.
4. ✅ `npm run db:reembed` re-embeds everything; `-- --stale` limits it to rows that are unembedded, flagged, or carrying another model's vector. Verified by nulling one vector and flagging another — the sweep found exactly those two.
5. ✅ Every pattern is synthetic and de-identified, and every `sourceRefs` entry is a visible `SAMPLE-REF:` placeholder. The seed file header states plainly that these are scaffolding for the researcher to replace, not clinical content.

**The verification that mattered.** Feature 3's `db:verify` embedded a seed pattern's own `situation` with the same deterministic function that had produced the stored vector, then celebrated a similarity of 1.0. That check would have passed just as happily if the vectors meant nothing — because they did. It now embeds **student-style paraphrases** and asserts the right pattern ranks first:

| Query (as a student might type it) | Top match | Score | Margin over #2 |
| --- | --- | --- | --- |
| "I can't stop thinking about my family back home and I really miss the food I grew up with" | Homesickness & cultural adjustment | 0.4509 | 0.1187 |
| "my visa paperwork is due next month and I'm terrified I'll get something wrong and have to leave" | Visa & immigration status anxiety | 0.6569 | 0.2828 |
| "everyone in my cohort seems so much smarter than me, I never say anything in seminars" | Imposter feelings in a competitive program | 0.6079 | 0.2161 |
| "I stay up until 3am to call my parents and then I can't concentrate in my 9am lecture" | Sleep disruption & living across time zones | 0.6014 | 0.2808 |

Homesickness has the narrowest margin, which is worth watching when Feature 7 calibrates its relevance floor — it is the most diffusely worded pattern in the set. ✅ It held up: through Feature 7's English-normalized query the same paraphrase scores **0.6716**, comfortably clear of the 0.54 floor, and the Chinese homesickness message scores 0.6524. The narrow margin was an artifact of matching raw student text, which is exactly what the normalization step removes.

**Design decisions worth carrying forward:**
- **A vector that cannot be trusted is flagged, not left looking healthy.** `needs_embedding` covers three cases — never embedded, a `--fake` placeholder, and a save whose OpenAI call failed (Feature 17). An unembedded pattern is invisible to retrieval with no error anywhere, which is precisely the silent failure this feature exists to prevent, so `db:verify` refuses to run while any exist rather than ranking noise.
- **`embedding_model` is recorded because vectors from different models are not comparable.** Mixing them yields meaningless similarity scores rather than an error. The embedder also rejects a dimension mismatch up front, since Postgres would otherwise report it as "expected 1536 dimensions" far from the setting that caused it.
- **The no-key path survives.** `db:seed -- --fake` still stands the database up with deterministic placeholders (a Feature 3 property), now recorded as `embedding_model='placeholder'` and flagged, so `db:reembed -- --stale` upgrades them later. Verified end to end: a fresh `db:reset -- --fake` → `db:verify` correctly *refuses* with the exact command to fix it → `db:reembed -- --stale` → `db:verify` passes.
- **Only `situation` is embedded**, never the strategies. Matching compares a student's message to a description of a *situation*; embedding the counselor guidance too would pull the match toward advice language and quietly degrade it.
- **Destructive scripts are now guarded to localhost.** `db:reset` runs `drop schema public cascade` against whatever `DATABASE_URL` points at, and `db:seed` upserts over the starter patterns by fixed UUID. Harmless while the only database was a local container; catastrophic once a hosted one holds the researcher's work. Both refuse a non-local host unless `-- --allow-remote` is passed, and fail closed on a connection string they cannot parse. Verified in both directions.
- **Backups are text, not vectors.** `db:export:patterns` writes the authored fields to a JSON file and deliberately omits embeddings — 1536 floats per row would make the file unreadable and every diff meaningless, to store something one command regenerates.

**Note on where the data lives from here.** Once Feature 17's admin tool is in use the **database is the source of truth** and `db/seeds/sample-care-patterns.ts` is only for bootstrapping a fresh environment. `db:export:patterns` writes the live set back to the repo as a version-controlled backup (Supabase's free tier keeps limited history), and `db:pull:patterns` copies hosted patterns *down* into local development — deliberately, rather than repointing `DATABASE_URL` upward, so a local dev session's test conversations never land in the researcher's live data.

## Feature 7: Retrieval & matching pipeline (RAG) ✅ (done)
The core differentiator: match the conversation to Care Patterns and steer the reply.
**Depends on:** Features 5, 6.

**AC (all met — verified against a live database and live OpenAI, 2026-08-23):**
1. ✅ The match query is built in `services/api/src/retrieval.ts` from the conversation — the `conversations.summary` column (null until Feature 8 writes it, read already) plus the student's recent messages — and normalized to English by `gpt-4o-mini` using `src/prompts/match-query.md`.
2. ✅ The query is embedded with the same `text-embedding-3-small` that embedded every pattern's `situation`, then ranked by pgvector cosine similarity. Top-N and their scores are logged on every turn.
3. ✅ The floor gates in both directions, verified live. *"I stay up until 3am to call my parents back home and then I'm useless in my 9am lecture"* → **Sleep disruption & living across time zones, 0.7352**, strategies injected. *"someone cut the lock and stole my bike outside the library"* → best candidate 0.2764, logged `outcome: "below_floor", gap: true`, no guidance injected, and the student still got a warm reply.
4. ✅ Matching re-runs every turn, and switching topics switches the match: mid-conversation the student moved from sleep to money and *Financial pressure & the cost of studying abroad* took first place at **0.7276**.
5. ✅ `CARE_PATTERN_RELEVANCE_FLOOR` (default **0.54**), plus `CARE_PATTERN_TOP_N`, `CARE_PATTERN_MATCH_WINDOW` and `CARE_PATTERN_MIN_SIGNAL_CHARS`. All four are range-checked at startup — a floor above 1 would match nothing, silently, forever.
6. ✅ Demonstrable — the A/B below.

**How the floor was chosen.** `npm run retrieval:calibrate` (new) runs 18 labelled cases through the real pipeline — the module the chat route imports, not a copy — and prints the band that separates them:

| | score band | cases |
| --- | --- | --- |
| Messages where one pattern is clearly right | **0.6128 – 0.8123** | 12 (incl. 2 in Chinese) |
| Messages this library genuinely does not cover | **0.0000 – 0.4629** | 6 |

The default is the midpoint, **0.54**: all 12 correct matches applied, none of the 6 uncovered ones. Scores move by a few hundredths between runs — OpenAI is not deterministic even at `temperature: 0`, and the normalizer occasionally answers `NONE` to a borderline message it summarized last time — so the bands above are quoted from the widest run observed across three, and 0.54 sits inside every one of them. Every case also retrieved its *expected* pattern first, so the script doubles as a regression check on the knowledge base. It fails loudly if a pattern stops ranking where it should.

**The A/B that proves AC 6.** The same message, sent to two API instances differing only in the floor (0.54 vs 0.99, which nothing can clear):

> **With the pattern applied:** "…find a **sustainable rhythm** that works better for you. Maybe setting up a **fixed time each week** for a longer call rather than nightly calls… consider **protecting one anchor** in your routine, like a **consistent wake time**, even if your bedtime varies."
>
> **Without it:** "…set up a regular time to talk **that's a bit earlier**, if possible… discussing with your parents about **adjusting the call schedule**."

The pattern's strategies are *"a fixed weekly call rather than nightly improvisation"* and *"a consistent wake time matters more than a consistent bedtime"*, and its `avoid` list opens with *"telling them to stop calling home"*. The guided reply follows all three. The unguided one invents plausible advice that drifts toward the very thing the researcher said not to say — which is the argument for the whole feature in two paragraphs.

**Cross-lingual matching works** (also Feature 15 AC 4, early): 我来这边半年了，最近总是很想家…" matched the English *Homesickness & cultural adjustment* at **0.6524** and the Chinese reply carried all three of its strategies.

**Design decisions worth carrying forward:**
- **The match query is built from the student's messages only.** Replaying our own replies would feed the guidance we already injected back into the query that selects the guidance — a pattern would keep re-selecting itself as the conversation moved on. Their words are evidence; ours are an echo.
- **The newest message is labelled as newest.** Found by measurement, not by reasoning: with an unlabelled blob, a student who talked about sleep for two turns and then switched to money still got *Sleep disruption* ranked first (0.70) over *Financial pressure* (0.59) — the reply led with the problem they had stopped talking about. Labelling the sections flipped it to 0.73 for the right pattern.
- **English normalization is not only for Chinese.** It raised the top score on all 12 match cases, mean **+0.17**, because it also rewrites first-person venting into the third-person situation language the patterns are authored in. It lifts correct matches much more than uncovered ones, which is what pulls the two bands apart and makes any floor workable.
- **The floor was measured, and the number we would have guessed was wrong.** ARCHITECTURE.md advised starting at 0.7–0.8; on this library that would have rejected *every* correct match — silently, with every reply still looking fine. The doc is corrected. Absolute cosine values are specific to the embedding model *and* to how the patterns are worded, so the number does not travel: re-run the calibration when the library changes materially.
- **Retrieval degrades, it never fails the turn.** A student is waiting for an answer, and the guidance is the optional half of it. All three failure paths were exercised live: a bad embedding model name → `outcome: "failed"`, reply delivered; an embedding model that no pattern was embedded with → `outcome: "no_patterns"`, reply delivered; and a stopped database is still the deliberate 503 from Feature 5, before any tokens are spent.
- **`gap` means the *library* had no answer, not that we broke.** It is set for `below_floor` only — never for a greeting (`low_signal`), a failed pipeline, or an empty library. Feature 19 collects these to decide which pattern to author next, and a flag that also fires on our own outages would send the researcher chasing content problems that do not exist.
- **Retrieval only sees patterns it can trust:** `status = 'published'` (migration 0004), not `needs_embedding` (migration 0002), and `embedding_model` equal to the configured one — vectors from two models produce plausible-looking scores rather than an error. Because that filter can silently empty the library, the API now reports at boot how many patterns are retrievable and warns when any published pattern is invisible. Verified by starting an instance with a different embedding model: `retrievable: 0, unretrievable: 12` plus a warning.
- **Similarity scores are never put in the prompt.** The model does not need the number to use the guidance, and a model given "0.61" is a model that can mention it to a student. Order carries the same information: closest first, labelled as such.
- **A greeting costs nothing.** Below `CARE_PATTERN_MIN_SIGNAL_CHARS` the pipeline is skipped entirely (`low_signal`, 0 ms, no upstream calls), and the normalizer independently answers `NONE` to small talk that does clear the bar, before any search runs.

**What it costs.** About **1.15 s** added to each turn (one `gpt-4o-mini` call plus one embedding, both before the reply call, which they gate) and roughly **+140 prompt tokens** when a pattern is injected — 916 vs 778 on the same message. In money that is a fraction of a cent per turn against the reply's ~$0.005. The latency is the real cost, and the knob for it already exists: AC 4 allows re-matching every few turns rather than every turn if it ever needs to be bought back.

**Not done here, on purpose:** gap flags are logged, not yet persisted (Feature 19 owns collecting them); the summary half of the match query stays null until Feature 8 writes summaries; the questionnaire cold start belongs to Feature 13; and re-ranking the vector top-10 with an LLM remains the *Future* hybrid design, not V1.

## Feature 22: Retrieval inspector on the chat page ✅ (done)
See *why the reply is what it is*, from the student's own chat page, without reading server logs.
**Depends on:** Feature 7.

Feature 7 made the reply Care-Pattern-grounded, but everything that decides it — the match, the score, the floor, the guidance injected — is visible only in the API's log. That is fine for debugging and useless for demonstrating, and demonstrating it is the point: the difference between a grounded reply and a generic one is the product. This feature makes that difference visible **in the real chat UI**, to a privileged viewer only.

**Deliberately NOT the Feature 17 admin tool.** That tool is for researchers authoring patterns, and it is a separate app. This is an inspector on the student-facing chat page: same conversation, same replies a visitor gets, with a panel that opens underneath them.

**AC (all met — verified against a live API, live database and live OpenAI in a real browser, 2026-08-23):**
1. ✅ `?inspect=1` reveals the unlock bar; the token then rides on the `X-InnerSun-Inspect` header. An ordinary visitor's response carries the same three keys it always did (`conversationId`, `reply`, `locale`) — verified with no header and with a wrong token — and a visitor's page contains no inspector markup at all (checked in the DOM after a real turn: `.inspector-panel` count 0, no matching text anywhere).
2. ✅ Each inspected reply shows a badge — *"Matched: Sleep disruption & living across time zones · 0.7525"* — over a panel carrying `outcome: applied`, the floor in force (0.54), the English match query, and every candidate with its score and whether it was applied (0.7525 ✓, 0.5010, 0.4875).
3. ✅ The injected block is shown verbatim, strategies, "do not" items and escalation note included — so what the model was told is inspectable, not inferred.
4. ✅ A switch adds a second reply with the guidance withheld, rendered beside the real one. Off by default, and **skipped entirely when nothing was applied** — with nothing to withhold, two replies would differ only by sampling noise, so the second `gpt-4o` call is not made.
5. ✅ Retrieval time (1650 ms) and token usage (894 prompt / 156 completion) are on the panel.
6. ✅ With `INSPECTOR_TOKEN` unset the feature does not exist: an instance started without it answered a request carrying the *correct* token from another instance with an ordinary three-key response. The credential is minted for this purpose alone and touches no admin route.

**Design intent (settled before building):**
- **A visibility-only credential, not the researcher session.** The Feature 17 admin cookie can publish and retire clinical guidance; parking it in the student site's browser to reveal similarity scores would trade a real capability for a convenience. It also could not travel there as things stand — that cookie is `sameSite: "lax"` on the API origin and CORS runs without credentials, so a `:3000 → :3001` request never carries it. Both facts point the same way: mint something narrower.
- **`INSPECTOR_TOKEN`, compared in constant time, sent as a header.** Unset means the feature does not exist — the server never builds the debug payload and the response is byte-identical to a visitor's. That is the right default for a hosted instance, and it fails closed rather than open.
- **The upgrade path is already known.** When Feature 12 brings real accounts, the same payload hangs off a `role` on the user and the token disappears. Nothing built here is thrown away; only the gate changes.
- **`debug` must be declared on the response schema.** `POST /chat` serializes strictly with `additionalProperties: false`, so an undeclared field cannot be returned — which is exactly the property that keeps it from leaking when absent.
- **The comparison runs both prompts, rather than moving the floor.** Setting `CARE_PATTERN_RELEVANCE_FLOOR=0.99` does produce an unguided reply, but it needs a restart, applies to everyone, and cannot be shown next to its guided twin. Two prompts in one request can.
- **Nothing new is computed for ordinary turns.** Every fact the panel shows already exists inside the turn; the inspector only decides whether to send it.

**What the demo actually shows.** The same message — *"I stay up until 3am every night to call my parents back home and then I keep falling asleep in my 9am lecture"* — answered twice in one turn:

> **With guidance:** "…those calls can feel like a **lifeline**… finding a more **sustainable rhythm**… a **regular time each week**… **waking up at the same time each day** could help your body find some consistency."
>
> **Without it:** "…try calling them on **weekends** or arranging a time that **doesn't interfere with your sleep**… Getting enough rest is crucial."

The pattern's strategies are *"the calls are a lifeline, not a bad habit"*, *"a fixed weekly call rather than nightly improvisation"* and *"a consistent wake time matters more than a consistent bedtime"*; its first `avoid` item is *"telling them to stop calling home"*. The guided reply follows all three. The unguided one is perfectly pleasant and steers toward cutting the calls down — the thing the researcher said not to do. Both are on screen, side by side, with the scores that produced them.

**Design decisions worth carrying forward:**
- **A separate, narrower credential rather than the researcher's session.** Reusing the Feature 17 admin cookie would have put publish-and-retire authority in the student site's browser to reveal similarity scores. It also could not have travelled there without loosening that cookie's `sameSite` and enabling CORS credentials for every visitor — two changes that weaken the product to serve one person's debugging.
- **The gate is the schema as much as the check.** `debug` had to be declared on the response schema before it could be returned at all, and Fastify's strict serialization means an absent one is simply not emitted. The failure mode "we forgot to strip the debug field" is therefore not reachable.
- **The comparison is two prompts, not two floors.** Moving `CARE_PATTERN_RELEVANCE_FLOOR` to 0.99 does produce an unguided reply, but it needs a restart, applies to every visitor, and cannot be shown next to its guided twin.
- **The comparison reply is never persisted.** Only the reply the student saw is appended to the transcript, so a demo does not put a second assistant turn into the history that Features 8, 14 and 16 summarize, analyze and export.
- **Panels render from the payload, never from a local recomputation.** A panel that derived its own numbers could disagree with the turn it claims to explain.

**Found only by running it:** an inspected bubble overflowed the message column and clipped the reply, because `react-chat-elements` gives its bubble a 20px left margin that a plain `width: 100%` ignores. Static checks and unit tests were all green while it looked broken on screen.

**The inspector is meant to keep growing.** Every feature that adds a *decision* to a turn should surface that decision here, because the argument for showing why a reply was Care-Pattern-grounded applies equally to everything else the server decides on a student's behalf. Concretely: Feature 8's running summary and token budget, **Feature 9's crisis detection — how the signal was detected**, and **Feature 11's booking nudge — why it fired on this turn**. Each is additive and cheap: extend `ChatDebug` in `packages/shared`, the response schema in `services/api/src/routes/chat.ts`, and the panel in `apps/web/src/components/Chat/Inspector.js`. The gate itself never changes, and when Feature 12 brings real accounts the token gives way to a role check with the payload untouched.

**Not done here, on purpose:** the rows those later features will add, since the decisions they show do not exist yet.

## Feature 8: Prompt assembly + cost controls 🟢
Assemble the final prompt and keep per-conversation cost low.
**Depends on:** Feature 7.
**AC:**
1. Prompt = static system prompt (English) + injected Care-Pattern strategies + conversation context + "respond in {locale}" instruction. *(The static prompt already exists at `services/api/src/prompts/system-prompt.md`, with `{{locale}}` and `{{care_pattern_strategies}}` slots to fill here.)*
2. **Model tiering:** `gpt-4o-mini` for classify/normalize/summarize; `gpt-4o` only for the counseling reply.
3. **History summarization:** older turns are summarized instead of resent; prompts stay bounded.
4. **Prompt caching** enabled (static prefix first) and `max_tokens` capped.
5. Token usage per message is logged (so we can watch the ~$0.05/conversation unit cost).

## Feature 9: Safety / crisis detection 🟢 (must-have)
Non-negotiable for a mental-health product.
**Depends on:** Feature 5.
**AC:**
1. Each user message is screened for crisis/self-harm signals (LLM/rule-based for v1).
2. On a positive signal, the app surfaces **crisis resources / hotline info** and an **immediate human hand-off** message — it does **not** proceed with a normal booking nudge.
3. Crisis handling takes priority over Care-Pattern matching and the booking nudge.
4. A clear, visible **"not a medical device / not emergency services"** disclaimer is present in the chat UI.
5. Crisis triggers are logged (de-identified) for later evaluation.
6. The **Feature 22 inspector shows how the signal was detected** for that turn — what fired, and that it took priority over Care-Pattern matching. Screening runs before retrieval and overrides it, so a turn where crisis handling took over is otherwise indistinguishable from one where nothing matched.

## Feature 10: Pre-defined answers (FAQ) + quick-reply chips 🟢
Answer common questions with zero LLM cost.
**Depends on:** Feature 5.
**AC:**
1. A set of canned bilingual answers exists (e.g. "Is this confidential?", "How do I book a real counselor?", "Are you a real person?").
2. These live in the `canned_responses` table — **not** cached, not LLM-generated. *(The "DB table optional" wording here is now settled: Feature 17 ships the editor for this table, so the content must be in the database rather than a config file.)*
3. The chat UI shows **clickable quick-reply chips** that return the canned answer deterministically with no API call.
4. Adding/editing a canned answer requires no model call and no matching logic.

**Note:** the *authoring* half of this feature is delivered early by Feature 17, whose admin tool has a tab for `canned_responses`. What remains here is the student-facing half — surfacing the chips in the chat UI and returning the answer without an API call. Do not build a second editor.

## Feature 11: Booking nudge + "talk to a human" path 🟢
The whole point of the funnel: convert trust into a booking.
**Depends on:** Features 5, 9.
**AC:**
1. A **rule-based readiness check** decides when to nudge (e.g. enough substantive turns, or the user explicitly asks for a human, or a pattern's `escalation` flag) — and it nudges **at most once** per conversation (no nagging).
2. When triggered, the AI gently suggests booking a real counselor.
3. A working **booking entry point** exists (v1 can be a simple request form or scheduling link — full payments are Future).
4. The nudge never fires during an active crisis flow (that path takes over).
5. The **Feature 22 inspector shows why a nudge fired** on the turn it fired — which part of the readiness check was satisfied (turn count, an explicit request, or a matched pattern's `escalation`), and why it stayed silent on the turns it did not. A rule-based decision that can only be inferred from the reply's wording cannot be tuned.

---

# Phase 2 — Users, memory & languages

## Feature 12: Authentication (anonymous vs registered) 🟢
**Depends on:** Features 3, 4.
**AC:**
1. Anonymous users can chat instantly with **no login and no memory** (ephemeral session).
2. Users can **register + log in** (email/password; via Supabase Auth if chosen).
3. Sessions are secure (server-side; no secrets in the client); logout works.
4. The chat flow branches on auth state (anonymous vs registered) per the architecture's flow diagram.
5. The existing Login modal is wired to real auth (no longer a UI-only stub).

**Note:** this is *student* auth and is deliberately unrelated to the admin login that Feature 17 already shipped. Students are anonymous-first with optional registration; admins are a closed list of two or three people in their own `admin_users` table. Reconciling them is optional, not required — check what Feature 17 built before adding a second session mechanism.

## Feature 13: Registration questionnaire → seeded initial match 🟢
**Depends on:** Features 7, 12.
**AC:**
1. New registrants get a **5–8 question**, warm, mostly multiple-choice questionnaire (skippable).
2. Answers are stored on the user profile (treated as sensitive data; consent applies — see Feature 15).
3. Answers **seed an initial top-N Care-Pattern match** before the user's first message.
4. The running conversation still refines the match from that seed.

## Feature 14: Memory for registered users 🟢
**Depends on:** Features 7, 12.
**AC:**
1. Logged-in users' conversations persist across sessions; anonymous users' do not.
2. A per-user memory summary (+ key facts) is stored and loaded at the start of a new session.
3. Memory is used to personalize/continue matching and replies.
4. Users can view and delete their stored data (basic data-rights support).

## Feature 15: Internationalization (English / 简体中文) 🟢
**Depends on:** Feature 2.
**AC:**
1. All UI strings are externalized into i18n resources for **en** and **zh-CN** (no hard-coded copy).
2. The header language toggle actually switches the UI language (no longer a stub).
3. The AI **replies in the user's selected language** (the "respond in {locale}" instruction), while the Care-Pattern KB stays English.
4. A Chinese-language conversation still matches the English KB correctly (English-normalized match query works).
5. Adding a third language later requires only a new resource file (structure is extensible).

---

# Phase 3 — Compliance, content tooling, polish

## Feature 16: Consent & de-identified logging 🟢 (foundation for the flywheel + DS)
**Depends on:** Features 4, 12.
**AC:**
1. A clear consent notice/flow covers anonymous logging and (separately) using conversations to improve the service.
2. Consent choices are stored and honored; logging respects them.
3. Conversation logs are **de-identified** before storage/analysis (PII stripped).
4. No real PHI is ever written to the repo; sensitive stores are access-controlled.
5. Logs are structured to be **labelable later** (enables the DS evaluation work).

## Feature 17: Researcher admin tool for Care Patterns 🟡 (built & verified locally — hosting outstanding)
Let researchers author the knowledge base without engineering.
**Depends on:** Features 3, 6.

**AC (all met — verified in a real browser against a live database and live OpenAI, 2026-08-15):**
1. ✅ A password-protected admin UI at `/admin` lists, creates, edits, publishes, retires and restores Care Patterns. Patterns move through a **`draft` → `published` → `retired`** lifecycle (migration 0004), and **a new pattern is a draft**: writing one does not put it in front of students until Publish is pressed. Retiring is a soft withdrawal — the row stays readable, auditable and restorable, because clinical guidance that turned out to be wrong is something you want the history of.
2. ✅ Saving re-embeds `situation` automatically — **and only when it changed.** Verified by comparing `embedded_at` across saves: editing the strategies left it byte-identical (`embeddingStatus: "unchanged"`) while rewriting the situation produced a new timestamp. Editing everything except the situation is therefore free, which is what a researcher does most.
3. ✅ Every schema field is editable, with the `text[]` columns rendered as repeatable line items rather than array literals, and `locale_notes` as a Chinese cultural-note field. `source_refs` is a first-class field.
4. ✅ Unauthenticated requests to `/admin/api/*` return `401`. Accounts exist only via `npm run admin:create`; there is no signup route.
5. ✅ Every mutation writes a `care_pattern_revisions` row **in the same transaction as the change**, so an edit cannot happen without a record. The UI shows who did what and which fields changed.
6. ✅ A second tab edits `canned_responses` bilingually; a 中文 answer edit was confirmed persisted by re-reading it from the server.

**Built with react-bootstrap, converted 2026-08-16.** The first cut used plain semantic HTML and a hand-written stylesheet, on the reasoning that an internal forms-and-lists tool did not need a component library. The user chose consistency with `apps/web` instead, and the conversion paid for itself immediately by surfacing three defects the hand-rolled version had: the custom tabs declared `role="tablist"` and `aria-selected` but had **no arrow-key navigation**; destructive actions had **no confirmation dialog**, because hand-rolling a modal properly is fiddly enough to skip; and one click on Retire withdrew a pattern from students with nothing in between.

Retiring — a Care Pattern or an FAQ answer — now opens a confirmation naming the item, stating that it stops reaching students immediately, and noting that nothing is deleted and it can be brought back. Restoring deliberately does *not* confirm: it is the safe direction, and confirming every state change trains people to dismiss the dialog without reading it, which is worse than not having one. Two Bootstrap gotchas worth remembering: **Bootstrap 5.3 compiles each component's "active" colour to a literal hex at build time**, so overriding `--bs-primary` leaves nav pills and selected list rows Bootstrap blue — the component-level variables have to be set directly, which is the same reason `apps/web` overrides `.btn-primary` explicitly. And **a `Nav` nested inside a `Navbar` picks up the Navbar's select context rather than `Tab.Container`'s**, so `onSelect` never fires and tab switching silently stops working; the tabs sit below the navbar instead. Both were caught only by looking at the running page.

**Draft-by-default, decided 2026-08-16.** The first cut published a pattern the instant it was saved, and the plan was to add a draft state at deployment time, when there would actually be students to protect. The user overruled that: a safety default that depends on someone remembering to change it later is one that does not get changed. It was implemented immediately instead.

The change is a three-state `status` column replacing the boolean `is_active`, not merely a flipped default — with a boolean, `false` would have meant two unrelated things ("not written yet" and "withdrawn because it was wrong"), the UI would have had to label a brand-new draft "retired", and nothing could tell them apart when reviewing the library. Two consequences worth carrying: **the seed sets `status` explicitly** rather than relying on the column default, so the starter set is live by deliberate choice and nothing becomes retrievable by omission; and **publishing an unindexed pattern is refused with a 409**, since a `published` row with no usable vector would look live while being unreachable — the same silent failure `needs_embedding` exists to prevent. Verified end to end: a new pattern came back `draft` and left `db:verify` at 12 published, publishing moved it to 13, the audit recorded `create` then `publish`, and a pattern flagged `needs_embedding` was refused publication.

**✅ Deployed 2026-08-16 — <https://innersun-admin.onrender.com/admin>.** Supabase holds the schema and the twelve starter patterns; Render serves the API and admin UI. Smoke test passed: `db: "up"`, `/admin/` 200, `/admin/api/*` 401, **`POST /chat` 404**, `http://` redirecting to `https://`, and the login rate limiter reporting a per-client budget rather than a shared one. Semantic retrieval against Supabase returned scores identical to local to four decimal places — embeddings are deterministic per model, so that is proof the vectors survived the move intact.

**Three deploys failed first, each for a different reason, and each is a lesson about verifying against the real environment rather than a local approximation:**
- **TypeScript 4.9.5.** `react-scripts` in `apps/web` depends on it and npm hoisted *that* to the root, while the four TypeScript workspaces each got 5.9.3 nested. Locally the nested copy wins on `PATH`, so it built here every time; under `npm ci` the root copy won. Fixed by declaring `typescript` at the root, which leaves react-scripts' 4.9.5 nested under `apps/web` where it belongs.
- **devDependencies omitted.** npm reads `NODE_ENV` at *install* time, not just at runtime. `NODE_ENV=production` is wanted for the running service — it drives the cookie's `Secure` flag and the logger — but it also makes `npm ci` skip the entire build toolchain. Fixed with `npm ci --include=dev`, leaving the runtime variable alone.
- **Supabase's private CA.** Its Postgres presents a certificate chained to its own CA, not a publicly trusted one, so verification needs that CA supplied (`DATABASE_SSL_CA`). Underneath that sat a worse trap: **`pg` silently ignores an explicit `ssl` options object when the connection string carries `sslmode`**, which Supabase's copyable URI often does — our configuration would have been discarded with no warning and the failure would have looked identical to having configured nothing.

The first two were only reproducible by wiping every `node_modules` and running `npm ci` **with `NODE_ENV=production` set**. Reproducing the install without the environment caught one of them and missed the other, which cost an extra deploy cycle.

**Four things would have broken on a hosted platform, all found by auditing rather than by deploying:**
- **`PORT` was never read.** Hosting platforms assign a port; the config only knew `API_PORT`, so the service would have bound 3001, answered no health check, and been marked unhealthy with nothing in the application log.
- **`API_HOST` defaulted to loopback**, which in a container means the platform's proxy cannot reach the process at all. It now binds `0.0.0.0` when `PORT` is present, and warns loudly if it ever finds itself bound to loopback with `PORT` set.
- **`trustProxy` was off.** Behind a load balancer every request carries the proxy's address, and `@fastify/rate-limit` keys on IP — so the login limiter would have been one global budget shared by everyone, and a few failed attempts by anyone at all would have locked the researcher out of her own tool.
- **TLS was left to chance.** Supabase requires it; whether `pg` infers that from `sslmode` in a pasted connection string is version-dependent. It is now decided explicitly from the host, with certificate verification on and a loud, documented opt-out for a private CA.

**`.env` is no longer loaded when `PORT` is set.** On a hosting platform, configuration should be whatever the platform injected and nothing else. This was not hypothetical: a `.env` reaching the server carrying the local `API_HOST=127.0.0.1` would silently override the correct default and produce exactly the invisible health-check failure described above. Verified both ways — with only platform-style variables the service binds `*:PORT`; locally it still reads `.env` and binds loopback.

**Also hardened:** the session cookie's `Secure` flag no longer depends on `NODE_ENV` alone. A host that does not set that variable would have served the admin session cookie without the flag over real HTTPS, and nothing would have looked wrong; it now also derives from the request protocol, which `trustProxy` makes trustworthy.

**Two deviations from the approved plan, both to avoid native dependencies on a free-tier host:**
- **Passwords use scrypt from Node core, not Argon2id.** Argon2id is the stronger default, but every Node binding is a native module, and a missing prebuilt binary on Render is an opaque startup crash for whoever is on call. scrypt is memory-hard, in the standard library, and ample against three accounts behind rate limiting. The stored hash format is self-describing (`scrypt$N$r$p$salt$key`) so raising the parameters — or moving to Argon2id — does not invalidate existing accounts.
- **Sessions are server-side rows, not a signed stateless cookie** (and so no `SESSION_SECRET` is needed). The cookie carries a random opaque token; the database stores only its SHA-256 hash. The reason is revocation: a stateless token stays valid until it expires no matter what the server thinks, so "sign out" would be a suggestion. Verified by replaying the exact cookie after logout — `401`. Deactivating an account also takes effect immediately, because `is_active` is checked per request rather than captured at login.

**Design decisions worth carrying forward:**
- **A failed embedding does not fail the save.** Losing a researcher's writing to an OpenAI blip would be the worse outcome, so the pattern is stored and flagged `needs_embedding`, and the UI says plainly that it is *not searchable* until indexed — a red badge in the list and a banner in the editor. Verified end to end by pointing `OPENAI_BASE_URL` at a dead port: the title and strategies were saved intact, the flag appeared, and pressing Save once OpenAI was reachable cleared it.
- **The temporary password is enforced away at the API, not just the UI.** `admin:create` generates the password (never accepts one as an argument, where it would land in shell history and the process list) and flags the account. Every route that does real work returns `403 password_change_required` until it is replaced — otherwise a client that skipped the change-password screen could keep using the weakest credential the account will ever have indefinitely.
- **Login failures are indistinguishable.** Wrong email, wrong password and deactivated account return the same message, and a decoy hash is verified when the email does not exist so response time cannot be used to discover which addresses have accounts.
- **The admin UI is served by the API itself at the same origin**, so the session cookie needs no CORS or cross-site handling — and Feature 21's "frontend beside backend" gets a rehearsal.

**A defect found during runtime verification, in the same family as Features 3–5.** With the database stopped, admin routes returned a bare `500` — Feature 5 had established that a database outage is a deliberate `503`, but that mapping lived privately inside `conversations.ts` and the new code had no access to it. It is now a shared `dbQuery`/`dbConnect` pair in `db.ts` that every admin query goes through. Worth noting that this only surfaced because the Postgres container happened to stop mid-session; no static check would have found it.

**A UI defect found the same way:** the revision panel fetched history keyed only on the pattern id, so after saving it kept showing the pre-save list. The new revision *was* recorded — but for an audit trail, "my change isn't listed" reads as "my change wasn't logged". It now also keys on the pattern's `updatedAt`.

**Why this moved from Phase 3 to now (2026-08-15).** A researcher joined to author the knowledge base, and there is no point building retrieval against placeholder content when the person who can write the real thing is available. The alternatives were both worse: direct database access would have her hand-editing `text[]` and `jsonb` columns and, far more seriously, leave `embedding` NULL on every row she created — a pattern that looks perfect in a table viewer and is **invisible to retrieval**, with no error anywhere.

**Dify was evaluated and declined.** It was suggested as a free, ready-made authoring UI. Two findings settled it: its external-knowledge integration is **retrieval-only** ("Dify only has retrieval access to external knowledge bases. It cannot modify or manage your external content"), so it cannot author into our Postgres — the content would have to relocate into Dify — and the Q&A segmentation mode that maps closest to our situation→strategies structure is **self-hosted only**, which means running a nine-service stack rather than the one Fastify service this plan deploys. The document-chunk model would also flatten away `source_refs`, `escalation` and `locale_notes`. The embedding cost it would have saved is around a thousandth of a cent for the full starter set. Dify remains a reasonable prototyping surface for Feature 7's retrieval tuning; it is not the home for the knowledge base.

**Deliberate deviations from the standing rules,** both scoped as narrowly as possible:
- **Something deploys before Feature 21** — the hosted database, the API and the admin UI only. The student chat app stays on localhost and the GitHub Pages prototype is untouched.
- **`POST /chat` is not served on the hosted admin instance** (`ENABLE_CHAT_ROUTES=false`). An open, unauthenticated, token-spending chat endpoint on the public internet is the one thing this slice must not create. It also means the hosted service cannot run up an OpenAI bill: its only upstream call is one embedding when someone clicks Save.

Admin auth is deliberately **separate from Feature 12**: students are anonymous-first, admins are a closed list of two or three people, and coupling them would block this behind an unbuilt feature for no benefit.

## Feature 18: Home page & trust polish 🟢
Make it credible for investors and users.
**Depends on:** Features 2, 15.
**AC:**
1. Hero, value proposition, and **real team content** (researchers/psychologists/counselors) presented cleanly.
2. Clear trust/safety messaging: privacy stance, "not a medical device," crisis resources link.
3. Footer legal links (Privacy Policy, Terms) point to real (even if draft) pages.
4. Responsive on mobile and desktop; no placeholder/sample text remains in user-facing copy.
5. Bilingual: the whole page works in EN and 中文.

## Feature 19: Analytics & lightweight evaluation 🟢 (DS v1 setup)
**Depends on:** Features 7, 16.
**AC:**
1. Key events are tracked (conversation started, matched pattern, relevance-floor miss, nudge shown, booking requested, language used).
2. A small **evaluation set** (labeled: situation → expected Care Pattern) exists, and a script reports basic match quality (e.g. top-N hit rate).
3. Results are viewable (a simple dashboard or report) — enough to calibrate the relevance floor.
4. "Care-Pattern gap" flags are collected to guide which patterns to author next.

## Feature 20: Hardening 🟢
**Depends on:** all core features.
**AC:**
1. Rate limiting + abuse protection on the chat/API (free anonymous usage can't be farmed).
2. Input validation and safe error handling across the API.
3. Secrets managed via env/secret store; no secrets in code or client.
4. Automated tests for the critical paths (matching, safety screening, auth).
5. A basic CI check (**format** + lint + build + tests) passes.
6. `apps/web` consumes the shared API types — see below.
7. A shared **Prettier config** at the repo root, with `npm run format` and a `--check` gate in CI — see below.

**Code formatting is convention-only today.** There is no `.prettierrc`, no Prettier in any `package.json`, and no format script anywhere in the monorepo. Every file matches its neighbours because whoever wrote it matched them by hand, which holds right up until it doesn't: running `npx prettier --write` on a single file during Feature 17 reformatted it to Prettier's default 80 columns while its siblings sat at roughly 110, turning a fifteen-line change into a seventy-line diff. That edit was reverted, but the trap stays armed for anyone who reaches for a formatter out of habit.

Low urgency at two contributors and rising sharply with a third, because the cost is not ugly code — it is **review noise that hides real changes**, and merge conflicts in files nobody meaningfully edited.

**Scope it small:** one `.prettierrc` at the root (the existing style is roughly `printWidth: 110`, double quotes, trailing commas — match what is already there rather than accepting defaults and reflowing the whole repo), a `.prettierignore` covering `dist`, `build` and `package-lock.json`, a root `format` script, and `prettier --check` in the CI job. Reformat everything in **one dedicated commit** so it can be skipped wholesale with `git blame --ignore-rev`; mixing a repo-wide reflow into a feature commit destroys that file's history for everyone afterwards.

**Carried debt: `apps/web` is the only JavaScript workspace.** It is the original prototype, and Feature 1 deliberately scaffolded the monorepo *around* it rather than rewriting it — the priority then was fixing bugs and moving the OpenAI key server-side. Everything built since (`packages/shared`, `services/api`, `db`, `apps/admin`) is TypeScript, per the stack decision at the top of this plan.

The concrete cost is narrow but real: **`apps/web` cannot reference `@innersun/shared`**, because a `.js` file cannot consume the types it ships. That makes `apps/web/src/fetchers/ConversationFetcher.js` the one place in the system where the API contract is not enforced — change `ChatResponse` in `shared` and the API and admin app both fail to compile, while the browser breaks silently at runtime. Feature 5 verified that boundary by hand in a real browser; nothing prevents it regressing.

Not urgent while the contract is three fields, and riskier from Feature 13 (questionnaire payloads) and Feature 14 (memory) onward, where the shapes grow.

**Scope it small.** Create React App supports TypeScript incrementally — add `typescript` and a `tsconfig.json` and `.js` and `.tsx` coexist, so files convert one at a time. Convert **`ConversationFetcher` alone** first: it is the only file where typing prevents a real bug, and it is roughly twenty minutes. The presentational components can stay `.js` indefinitely at no cost. A wholesale 23-file rewrite is not the goal and should not be treated as a prerequisite for this feature.

---

# Phase 4 — Ship (last step)

## Feature 21: Deployment to production hosting 🟢 (do this last)
**Depends on:** everything above.
**AC:**
1. Frontend + backend deployed **on the same platform/domain** → same-origin API, simpler auth cookies.
2. Managed Postgres (**Supabase**, provisioned early — see below) with migrations run and env/secrets configured.
3. Custom domain + HTTPS (e.g. `app.innersun.com`); optional: keep GitHub Pages for a static marketing page.
4. A smoke test passes in production: register → chat → match → safety → nudge → (bilingual) all work.
5. Rollback/redeploy process documented.

**Substantially pre-built by the Feature 17 hosting slice.** That slice provisions Supabase, runs the migrations against it, stands the API up on Render, and documents redeploy and rollback in [`DEPLOYMENT.md`](DEPLOYMENT.md) — so **AC 2 and AC 5 arrive early**, and AC 1 gets a rehearsal, since the admin UI is already served by the API at the same origin. The platform-readiness work is done too: `PORT`/`0.0.0.0` binding, `trustProxy`, database TLS, and a session cookie whose `Secure` flag does not depend on `NODE_ENV`.

What genuinely remains: deploying the **student-facing app**, turning `POST /chat` back on (`ENABLE_CHAT_ROUTES=true`) behind the rate limiting and abuse protection Feature 20 adds, the custom domain, and the full smoke test. **Do not re-provision what already exists** — check Supabase and Render first, and read `render.yaml` before writing new deployment config.

**One decision to revisit here:** the student app will need `WEB_ORIGIN` set for CORS, or — better, and what Feature 21 AC 1 actually asks for — it should be served from the same origin as the API, exactly as the admin UI already is, at which point CORS stops being a consideration at all.

---

# ✅ Definition of Done — V1 investor-ready
The app is ready to show investors when **all of the above pass** and a live demo can show, end to end:
- [ ] Anonymous user chats instantly (free, no login) and gets empathetic, **Care-Pattern-grounded** replies.
- [ ] A **registered** user: questionnaire seeds a match, memory persists across sessions.
- [ ] The AI clearly **retrieves researcher-authored guidance** (the moat) — demonstrable, not a generic chatbot.
- [ ] **Safety**: a crisis message triggers resources + human hand-off, not a normal reply.
- [ ] **Bilingual**: full experience in English and 简体中文.
- [ ] The AI **nudges toward booking a real counselor**, and a booking request works.
- [ ] The **OpenAI key is server-side** (no security hole); per-conversation cost is visible.
- [ ] Consent + de-identified logging in place; a small **evaluation** shows match quality.
- [ ] Deployed to a real domain with the frontend beside the backend.
