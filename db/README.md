# db

Database migrations and seeds for InnerSun (PostgreSQL + `pgvector`).

Populated in **Feature 3** of [docs/PLAN.md](../docs/PLAN.md):

- `migrations/` — schema (users, care_patterns incl. a `vector` column, conversations,
  messages, consents, bookings, ...).
- `seeds/` — starter Care Patterns and other seed data (de-identified, synthetic).

The API connects via `DATABASE_URL` (see `.env.example`).
