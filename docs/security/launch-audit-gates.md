# Singularity Launch Audit Gates

These gates must pass before any public mainnet launch or treasury movement.

## Backend Gates

- `npm ci`
- `npm run typecheck`
- `npm run build:app`
- `npm audit --audit-level=high`
- `CI_PRODUCTION_GATE=true npm run security:gate`
- Postgres migrations applied with `npm run db:migrate`
- Production uses `SINGULARITY_STORAGE=postgres`
- Production uses Vercel Blob or equivalent object storage, not local files
- `/api/auth/privy` verifies Privy access tokens and linked Solana wallets
- `/api/auth/verify` (legacy) verifies a real Solana wallet signature when used
- Jupiter quote/swap routing is configured and tested with production RPC and API limits

## Solana Program Gates

- Anchor build passes
- Anchor tests pass on local validator
- Mission registry program has tests for mission initialization and lifecycle transitions
- Council program has tests for candidate registration, epoch finalization, request creation, voting, duplicate-vote rejection, non-council rejection, early execution rejection, and single execution
- Program IDs in production are not placeholders
- Upgrade authorities are documented and controlled by multisig
- External audit completed for registry and council programs
- Audit findings are remediated or explicitly accepted before enabling treasury movement

## Indexer Gates

- Indexer can replay from raw chain events
- Indexer writes idempotently by signature and instruction index
- Reconciliation can rebuild mission, council, funding request, vote, and treasury state
- Meteora DBC migration reconciliation can link `dbc_pool` to `damm_pool` and drive registry graduation bookkeeping
- RPC provider rate limits and retry behavior are tested
- Backfill procedure is documented

## Treasury Gates

- Funding requests cannot execute before 4 approvals
- Funding requests cannot execute before 3 days
- Council members cannot vote twice
- Non-council wallets cannot vote
- Requests execute at most once
- Treasury funds can only move to the approved recipient and approved amount
- Emergency pause cannot seize user funds or block external market trading
