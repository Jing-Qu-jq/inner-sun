# InnerSun — V1 Build Plan

> Goal: build, feature by feature, until the app is a **V1 ready to demo to investors**.
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md). Every feature has **Acceptance Criteria (AC)** — the
> checklist that means "done." Build in order; each feature notes what it depends on.

## How to use this plan
- Work one feature at a time. A feature is **done** only when all its AC pass.
- **Everything runs on `localhost` for now.** Publishing/deployment is the **last** feature.
- The current prototype stays on GitHub Pages untouched until then.
- 🟢 = in V1 scope. Anything marked *Future* in the architecture is intentionally out of scope here.

## Stack decisions (locked for V1)
- **Frontend:** the existing React SPA (`inner-sun`), cleaned up and wired to our own backend.
- **Backend:** **Node + TypeScript** orchestrator (**Fastify** — chosen in Feature 1). One language across FE/BE → shared types.
- **Database:** **PostgreSQL + `pgvector`** (see Feature 3 for the provider recommendation).
- **AI:** OpenAI — `gpt-4o` (reply), `gpt-4o-mini` (classify/safety/summarize/normalize), `text-embedding-3-small`.
- **Repo:** single **monorepo** (`web` / `api` / `db` / `shared`), per the architecture discussion.
- **Languages:** English + 简体中文 from the start (extensible).
- **Eventual hosting:** Vercel / Netlify / Cloudflare (frontend beside backend) — **deferred to the last feature.**

---

# Phase 0 — Foundations

## Feature 1: Monorepo scaffolding & local dev environment 🟢
Turn the single-folder prototype into a monorepo the backend can live in, runnable locally with one command.
**Depends on:** nothing.
**AC:**
1. Repo restructured to `apps/web` (current React app), `services/api` (new), `packages/shared` (types), `db/` (migrations/seeds).
2. `packages/shared` exports the initial TypeScript types (e.g. `CarePattern`, `ChatMessage`, API request/response shapes).
3. Root `README` documents how to install and run **web + api together on localhost** (e.g. `npm run dev`).
4. `.env.example` lists every required env var (OpenAI key, DB URL, etc.); real secrets live only in a git-ignored `.env`.
5. `npm run dev` starts the web app and the API locally; both boot with no errors.
6. Existing GitHub Pages build for `apps/web` still works (prototype stays publishable).

## Feature 2: Clean up the current UI & fix known prototype bugs 🟢
Make the existing UI presentable and correct before wiring real logic behind it.
**Depends on:** Feature 1.
**AC:**
1. Remove placeholder content ("This is some text within a card body.") and dead nav links (e.g. "Meet Our Team" with no target).
2. Fix the chat message state bug (messages are appended immutably; rapid sends don't drop/overwrite messages).
3. The leftover CarClarity/automotive `chatPrompt.md` has been **repurposed** into `services/api/src/prompts/system-prompt.md` as InnerSun's system prompt (done in Feature 1) — verify no automotive/CarClarity content remains anywhere in `apps/web`.
4. Home page renders hero + team carousel cleanly; the placeholder profile photo and example team data are clearly marked as sample content.
5. No console errors on Home or Chat pages.
6. Replace the placeholder `apps/web/src/App.test.js` (default CRA `/learn react/i` test — currently fails against this app) with a real smoke test.
7. Add the missing `apps/web/public/favicon.ico` (referenced by `index.html` but absent).

## Feature 3: Database setup — PostgreSQL + pgvector 🟢
Stand up the single data store for everything (relational + vectors).
**Depends on:** Feature 1.
**Recommendation (my suggestion):** **PostgreSQL + the `pgvector` extension**, hosted on **Supabase**.
- *Why Postgres + pgvector:* one database holds Care Patterns **and** their embeddings **and** users/memory/bookings — no separate vector DB needed at our scale (per the architecture).
- *Why Supabase specifically:* managed Postgres with `pgvector` built in, **plus built-in Auth and Storage** (which accelerates the login feature, Feature 9), a generous free tier, and a local dev stack via the Supabase CLI (Docker).
- *Alternative:* **Neon** (excellent serverless Postgres with branching) if you'd rather roll your own auth. Either works; pick Supabase to get auth "for free."
- *Local dev:* run Postgres locally (Supabase CLI or a `pgvector/pgvector` Docker image) so no cloud account is needed to build.
**AC:**
1. Local Postgres runs with `pgvector` enabled (documented one-command start).
2. Migration tooling in `db/` creates the initial schema: `users`, `care_patterns` (incl. a `vector` embedding column + `source_refs`), `conversations`, `messages`, `consents`, `bookings` (+ `canned_responses` if DB-backed).
3. `care_patterns` supports vector similarity search (an index/query returning top-N by cosine distance works against seed rows).
4. The API connects to the DB via `DATABASE_URL`; a health check confirms connectivity.
5. Schema + migrations are reproducible from scratch on a fresh machine.

## Feature 4: Backend orchestrator skeleton (fixes the exposed API key) 🟢
Stand up the API service that will own all OpenAI calls — closing the current security hole where the key is in the browser.
**Depends on:** Features 1, 3.
**AC:**
1. API exposes a `POST /chat` endpoint (accepts a message + conversation/session id, returns a reply).
2. The **OpenAI key lives only server-side**; it never appears in any frontend bundle or network response.
3. A server-side OpenAI client wrapper is in place, model names configurable via env.
4. Requests/responses validated against the `shared` types; malformed input returns a clean 4xx.
5. Basic structured logging + error handling (no stack traces leaked to the client).

---

# Phase 1 — Core chat (the heart of the product)

## Feature 5: Wire the chat UI to our backend 🟢
Replace the direct browser→OpenAI call with a call to our `/chat` API.
**Depends on:** Feature 4.
**AC:**
1. `ConversationFetcher` calls `POST /chat` on our API instead of `api.openai.com`.
2. A real end-to-end message round-trips on localhost: user types → API → OpenAI → reply shown.
3. Conversation history is maintained per session on the server (not just client memory).
4. Loading state (the "…" placeholder) and error state render correctly.
5. No OpenAI key or prompt content is present in the browser.

## Feature 6: Care Pattern data model + starter seed set 🟢
Get real (or realistic) Care Patterns into the DB so matching has something to match against.
**Depends on:** Feature 3.
**AC:**
1. `care_patterns` rows follow the v1 schema: `id/title`, `situation`, `signals`, `strategies`, `avoid`, `escalation`, `source_refs`, `locale_notes` (authored in **English**).
2. A seed script loads a starter set (≥ 8–10 patterns) covering common international-student situations.
3. On insert/update, each pattern's `situation` is **embedded once** and stored in its vector column.
4. A documented script/command can re-embed all patterns (e.g. if the embedding model changes).
5. Seed data is de-identified and clearly synthetic/sample (no real PHI in the repo).

## Feature 7: Retrieval & matching pipeline (RAG) 🟢
The core differentiator: match the conversation to Care Patterns and steer the reply.
**Depends on:** Features 5, 6.
**AC:**
1. A **match query** is built from the running conversation (summary + recent messages) and **normalized to English** via `gpt-4o-mini`.
2. The query is embedded and run against `care_patterns` via `pgvector` cosine similarity, returning **top-N with scores**.
3. A **relevance floor** gates the result: above → the matched patterns' `strategies` are injected into the prompt (blend top-N); below → general empathetic mode, and the turn is flagged as a "Care-Pattern gap."
4. Matching **re-runs as the conversation grows** (each turn or every few turns), not only once.
5. The relevance-floor threshold is a config value (so it can be calibrated later), with a sensible default.
6. Demonstrable: a message about a covered situation visibly pulls the right pattern's guidance into the reply.

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

## Feature 10: Pre-defined answers (FAQ) + quick-reply chips 🟢
Answer common questions with zero LLM cost.
**Depends on:** Feature 5.
**AC:**
1. A set of canned bilingual answers exists (e.g. "Is this confidential?", "How do I book a real counselor?", "Are you a real person?").
2. These are stored as content (i18n/config file for v1; DB table optional) — **not** cached, not LLM-generated.
3. The chat UI shows **clickable quick-reply chips** that return the canned answer deterministically with no API call.
4. Adding/editing a canned answer requires no model call and no matching logic.

## Feature 11: Booking nudge + "talk to a human" path 🟢
The whole point of the funnel: convert trust into a booking.
**Depends on:** Features 5, 9.
**AC:**
1. A **rule-based readiness check** decides when to nudge (e.g. enough substantive turns, or the user explicitly asks for a human, or a pattern's `escalation` flag) — and it nudges **at most once** per conversation (no nagging).
2. When triggered, the AI gently suggests booking a real counselor.
3. A working **booking entry point** exists (v1 can be a simple request form or scheduling link — full payments are Future).
4. The nudge never fires during an active crisis flow (that path takes over).

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

## Feature 17: Researcher admin tool for Care Patterns 🟢
Let researchers author the knowledge base without engineering.
**Depends on:** Features 3, 6.
**AC:**
1. An authenticated **admin UI** (or protected route) lists, creates, edits, and retires Care Patterns.
2. Saving a pattern **re-embeds** its `situation` automatically.
3. Fields match the schema, including `source_refs` (paper citations).
4. Access is restricted to researcher/admin roles.
5. Changes are versioned/audited (who changed what, when).

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
5. A basic CI check (lint + build + tests) passes.

---

# Phase 4 — Ship (last step)

## Feature 21: Deployment to production hosting 🟢 (do this last)
**Depends on:** everything above.
**AC:**
1. Frontend + backend deployed **on the same platform/domain** (Vercel / Netlify / Cloudflare) → same-origin API, simpler auth cookies.
2. Managed Postgres (Supabase/Neon) provisioned; migrations run; env/secrets configured.
3. Custom domain + HTTPS (e.g. `app.innersun.com`); optional: keep GitHub Pages for a static marketing page.
4. A smoke test passes in production: register → chat → match → safety → nudge → (bilingual) all work.
5. Rollback/redeploy process documented.

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
