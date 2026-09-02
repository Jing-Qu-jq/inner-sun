# admin — the researcher tool

The internal tool where researchers author the Care Pattern knowledge base and the
bilingual FAQ answers (Feature 17). Not student-facing: it lives behind a login and is
never linked from the chat app.

It is a Vite + React + TypeScript app, and in production it is **served by the API itself**
at `/admin` from the same origin. That is deliberate — the session cookie then needs no
CORS and no cross-site cookie handling — so the local setup below tries to preserve it.

Deployed at <https://innersun.onrender.com/admin>. See
[`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

---

## Running it locally

You need Postgres up first, from the repo root:

```bash
npm run db:up
```

There are two ways to run the tool, and they are good at different things.

### A. Served by the API — closest to production

Build the bundle once; the API's build copies it into `dist/public` and serves it.

```bash
npm run build:admin
npm run dev:api
```

→ **<http://localhost:3001/admin>**

Same origin, same cookie behaviour, same routing as the deployed service. Use this to
verify anything involving sessions, sign-out, or how the app is served. The cost is that
every UI change needs `npm run build:admin` again.

### B. Vite dev server — hot reload

Two terminals:

```bash
npm run dev:api      # terminal 1 — the API on :3001
npm run dev:admin    # terminal 2 — Vite on :3002
```

→ **<http://localhost:3002/admin/>**

Vite proxies `/admin/api/*` through to the API on 3001, so the same relative paths work
and the cookie is still first-party. Use this while iterating on the UI.

**Confirm behaviour in mode A before believing it.** Mode B is a different origin with a
proxy in front of it, which is exactly the sort of difference that hides a cookie or
routing bug until it reaches the deployed service.

---

## Getting an account

There is no sign-up. Accounts are created from the repo root:

```bash
npm run admin:create -- --email you@example.com --name "Your Name" --role admin
```

That prints a temporary password once. Sign in with it and you will be required to choose
a new one immediately.

Local accounts live in your **local** Postgres. The deployed tool reads Supabase, so an
account created here cannot sign in there and vice versa — they are separate databases.
To create an account on the hosted database, pass its `DATABASE_URL`; see
[`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

---

## Working against the researcher's real content

The starter Care Patterns are synthetic scaffolding. To develop retrieval against what the
researcher has actually written, copy it down rather than pointing local development at
production:

```bash
npm run db:pull:patterns
npm run db:reembed -- --stale
```

Never point `DATABASE_URL` at the hosted database to browse content — `db:reset` reads that
same variable and would drop the schema. The scripts refuse a non-local host for that
reason, but the habit matters more than the guard.

---

## Notes

- **Bootstrap 5.3 via react-bootstrap**, matching `apps/web`. Light and dark come from
  `data-bs-theme`, set from `prefers-color-scheme` by an inline script in `index.html` so
  the page never flashes the wrong theme.
- **Two Bootstrap traps already hit here**, worth knowing before adding UI: component
  "active" colours are compiled to literal hex at build time, so overriding `--bs-primary`
  does not reach nav pills or selected list rows; and a `Nav` nested inside a `Navbar`
  picks up the Navbar's select context rather than `Tab.Container`'s, which silently stops
  tab switching from working.
- **Requests with no body must not declare `Content-Type: application/json`.** Fastify
  rejects that combination, which once broke Publish, Retire and — silently — sign-out.
  `src/api.ts` sets the header only when there is a body.
