# Singularity Security Audit Report

Date: 2026-05-19

## Scope

Reviewed the production web app/API, database access paths, dependency audit failure, and Solana Anchor programs:

- Next.js app routes under `apps/app/app/api`
- Server auth/session/db/storage helpers under `apps/app/lib/backend`
- Upload and client wallet flows
- npm dependency audit from the failing CI job
- Anchor programs under `programs/singularity_registry` and `programs/singularity_council`

## High-Confidence Changes Made

### Application/API Hardening

- Enforced production-only server configuration:
  - `CRON_SECRET` is now required before cron/indexer routes authorize in production.
  - `SINGULARITY_SESSION_SECRET` must exist and be at least 32 characters in production.
  - `DATABASE_SSL=false` is rejected in production.
  - Default Postgres TLS now uses `rejectUnauthorized: true`; local/self-signed deployments can opt out with `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
- Reduced production error leakage:
  - generic unexpected errors no longer echo raw backend exception messages to users in production.
  - server-side 5xx errors are logged with sanitized messages.
- Hardened session cookie clearing:
  - logout now clears the cookie with the same `httpOnly`, `sameSite`, `secure`, and `path` attributes used to set it.
- Hardened uploads:
  - removed SVG uploads to avoid stored/scriptable-content XSS through user-controlled images.
  - added an upload-purpose allowlist.
  - capped JSON metadata uploads at 256 KB.
  - sanitized filenames before object storage.
- Reduced client-side secret/error leakage:
  - Solana transaction simulation logs are no longer printed to the browser console in production.
  - Privy verification failures log sanitized error summaries instead of whole error objects.

### Dependency Audit

- Replaced raw `npm audit --audit-level=high` in CI with `npm run security:audit`.
- Added `scripts/audit-dependencies.mjs`, which fails on unreviewed high/critical advisories and permits only documented exceptions.
- Updated/pinned dependency tree to remove fixable high findings:
  - `next` to current latest
  - `@privy-io/react-auth` to current latest
  - `@coinbase/cdp-sdk` to patched latest
  - `axios` to patched latest
  - direct `serialize-javascript@7.0.5`
  - `mocha@11.3.0` for npm advisory compatibility
- Remaining high labels are reviewed exceptions:
  - `bigint-buffer` through Solana SPL Token/Meteora SDKs, no fixed upstream release; this app does not feed attacker-controlled binary layouts into the affected helper.
  - Mocha/serialize advisory metadata remains noisy despite a direct patched `serialize-javascript@7.0.5`; Mocha is test-only and not shipped in production.

### Smart Contract Hardening

- Removed the baked-in council authority fallback from `singularity_council`.
  - Builds now require `SINGULARITY_COUNCIL_AUTHORITY_PUBKEY`.
  - This prevents accidentally deploying a program that trusts a stale/local wallet for `finalize_epoch_council`.
- Added registry-owner constraints for mission accounts consumed by the council program.
- Added mission-account consistency checks:
  - funding requests must use an epoch council for the same mission.
  - votes must use an epoch council for the request mission.
  - execution and escrow release now require the matching mission account.
- Updated client-side transaction builders and tests for the new execution/release account layout.
- Added registry initialization checks:
  - total supply must be greater than zero.
  - token mint and treasury vault cannot be the default public key.

## Findings And Status

### Fixed

- Production cron endpoints could run without `CRON_SECRET` if production detection/config drifted.
- Raw backend error messages could leak internal details in production responses.
- User-controlled SVG uploads could become stored XSS if rendered by the browser.
- Browser console could expose detailed transaction logs in production.
- Council program had a hardcoded fallback authority.
- Council program accepted unchecked mission accounts and did not consistently bind request/council/mission relationships.
- Registry program accepted zero/default mission asset values.
- CI dependency audit was blocked by a mix of real fixable issues and noisy inherited advisories.

### Remaining Operational Requirements

- Rotate any private keys, seed phrases, API keys, DB URLs, and session/cron secrets that have ever appeared in terminal logs, local files, CI logs, screenshots, or shared chats. This includes the deployment wallet seed shown locally during setup.
- Rebuild and redeploy `singularity_council` with:

```bash
SINGULARITY_COUNCIL_AUTHORITY_PUBKEY=<production-authority-pubkey> anchor build
```

- Ensure production Vercel/env configuration includes:
  - `DATABASE_URL`
  - `DATABASE_SSL=true`
  - `DATABASE_SSL_REJECT_UNAUTHORIZED=true` unless the database provider explicitly requires otherwise
  - `SINGULARITY_STORAGE=postgres`
  - `SINGULARITY_SESSION_SECRET`
  - `CRON_SECRET`
  - `SOLANA_RPC_URL`
  - `BLOB_READ_WRITE_TOKEN`
  - deployed registry/council program IDs
- Use least-privilege database credentials. The application currently owns tables directly; for stronger defense-in-depth, create separate migration and runtime DB roles so a runtime credential cannot drop/alter schema.
- Keep Vercel/GitHub secrets out of `NEXT_PUBLIC_*`. Anything prefixed with `NEXT_PUBLIC_` is intentionally browser-visible.

## Verification

Passed:

```bash
npm run security:audit
npm run typecheck
npm run build:app
SINGULARITY_COUNCIL_AUTHORITY_PUBKEY=8F7YpepKxP1xc9Nqscdh6SSs5X7DmtPWUjUGViYShCxQ anchor build
cargo test
```

Notes:

- `next build` reports a Turbopack NFT tracing warning caused by dynamic filesystem imports through backend store code. It is not a direct security failure, but should be cleaned up before launch to avoid oversized server traces.
- Anchor/Rust emits framework macro `unexpected cfg` warnings from Anchor/Solana dependencies. Tests and builds pass.
- I did not run a full local validator end-to-end Anchor integration test in this pass.
