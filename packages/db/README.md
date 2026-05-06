# Singularity DB

This package contains the first Postgres schema for the Singularity backend described in `BACKEND_SPECIFICATION.md`.

The Next.js API currently runs with a local JSON store so the backend works without external services. When Postgres is ready, use `schema.sql` as the migration baseline and replace `apps/app/lib/backend/store.ts` with queries against this schema.

Recommended providers:

- Supabase, Neon, or another managed Postgres database.
- Object storage/CDN for mission images, token images, profile avatars, and request attachments.
- Helius, Triton, or another Solana indexer/RPC provider for market and governance state.
