# Singularity Backend Report

## What I Built

I added the first working backend for the Singularity platform app and continued it toward production readiness.

It is implemented inside the Next.js app under `apps/app/app/api`, so it runs with the existing app server at `http://127.0.0.1:8094`.

The backend can run in two modes:

- Local development mode writes runtime data to `.singularity/backend-db.json`.
- Production mode uses Postgres when `DATABASE_URL` is configured.

## Backend Features

- Mission feed API with search and sorting.
- Mission detail API.
- Buy/sell quote API for the current UI trading panel.
- Mission launch preparation endpoint that validates mission metadata, prepares a Meteora DBC launch transaction, and stores only a pending launch until the wallet transaction is submitted.
- Funding request preparation endpoint that validates and stores a request locally.
- Funding request vote and execution endpoints.
- Profile read/update endpoints.
- Wallet auth nonce, verify, and logout endpoints with Solana signature verification.
- Council candidate registration and checkpoint preparation endpoints.
- Health endpoint for checking backend status.
- Postgres schema baseline and migration script in `packages/db`.
- Production-ready Vercel cron indexer route plus reusable indexer core package.
- Shared Solana transaction builder package in `packages/solana`.
- Object storage package in `packages/storage`.
- Upload API at `POST /api/uploads/prepare`.
- Anchor custom program skeletons in `programs/singularity_registry` and `programs/singularity_council`.
- Meteora Dynamic Bonding Curve launch transaction preparation for mission launches.
- CI workflow and production security gate.

## How To Run It

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev:app
```

Open:

```text
http://127.0.0.1:8094
```

Check the backend:

```text
http://127.0.0.1:8094/api/health
```

## Configuration

For local development, you do not need to configure anything.

Optional local setting:

```bash
SINGULARITY_DATA_PATH=/absolute/path/to/backend-db.json
```

If you do not set it, the backend stores data at:

```text
.singularity/backend-db.json
```

That folder is ignored by git because it is runtime data.

For production, configure these environment variables:

```bash
DATABASE_URL=postgres://user:password@host:5432/singularity
DATABASE_SSL=true
SINGULARITY_STORAGE=postgres
SINGULARITY_SESSION_SECRET=replace-with-a-long-random-secret
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
SINGULARITY_REGISTRY_PROGRAM_ID=...
SINGULARITY_COUNCIL_PROGRAM_ID=...
SINGULARITY_METEORA_DBC_PROGRAM_ID=...
CRON_SECRET=replace-with-a-long-random-secret
BLOB_READ_WRITE_TOKEN=...
```

Run the database migration:

```bash
npm run db:migrate
```

In production, file storage is blocked. The app must have Postgres configured.

## API Routes

- `GET /api/health`
- `GET /api/missions?q=mars&sort=highest-liquidity`
- `GET /api/missions/:missionId`
- `GET /api/missions/:missionId/quote?side=buy&amount=100`
- `POST /api/missions/:missionId/quote`
- `POST /api/missions/prepare-launch`
- `POST /api/missions/confirm-launch`
- `POST /api/funding-requests/prepare`
- `POST /api/funding-requests/:requestId/vote`
- `POST /api/funding-requests/:requestId/execute`
- `GET /api/profile/:address`
- `PATCH /api/profile`
- `POST /api/auth/nonce`
- `POST /api/auth/verify`
- `POST /api/auth/logout`
- `POST /api/council-candidates/register`
- `POST /api/council/checkpoints/prepare`
- `POST /api/uploads/prepare`
- `GET /api/indexer/run`

## Progress Update: Frontend, Privy Wallet, And Session Wiring

The product is now wired through the backend API instead of using frontend-only mock data at runtime.

What was added:

- Added Privy as the wallet/auth provider for the app.
- Configured Privy for Solana wallets, including external self-custody wallet connectors.
- Added a wallet provider in `apps/app/components/providers.tsx`.
- Added wallet/session helpers in `apps/app/lib/wallet.tsx`.
- Added a typed frontend API client in `apps/app/lib/api.ts`.
- Updated the app shell so logged-out users see `Sign in`, and logged-in users see their wallet/profile entry.
- Updated mission discovery to load from `GET /api/missions`.
- Updated mission detail pages to load from `GET /api/missions/:missionId`.
- Updated profile pages to load from `GET /api/profile/:address`.
- Wired mission launch to `POST /api/missions/prepare-launch`.
- Wired buy/sell quotes to `POST /api/missions/:missionId/quote`.
- Wired funding request creation to `POST /api/funding-requests/prepare`.
- Wired funding request voting to `POST /api/funding-requests/:requestId/vote`.
- Wired council candidate registration to `POST /api/council-candidates/register`.
- Wired uploads to `POST /api/uploads/prepare`.
- Added client-side prepared transaction signing and sending for `status: "ready"` Solana transactions.
- Added a clear `not_configured` path when Solana RPC or program IDs are missing.

The backend auth flow now works like this:

```text
User connects wallet with Privy
-> app asks backend for a nonce
-> wallet signs the nonce message
-> backend verifies the Solana signature
-> backend sets a signed HTTP-only session cookie
-> write APIs use that session wallet as the actor
```

This means mutating API routes no longer trust wallet addresses sent from the browser. They read the verified wallet from the session.

Protected routes now include:

- `PATCH /api/profile`
- `POST /api/uploads/prepare`
- `POST /api/missions/prepare-launch`
- `POST /api/missions/:missionId/prepare-graduation`
- `POST /api/funding-requests/prepare`
- `POST /api/funding-requests/:requestId/vote`
- `POST /api/funding-requests/:requestId/execute`
- `POST /api/council-candidates/register`
- `POST /api/council/checkpoints/prepare`

Public read routes remain public:

- `GET /api/health`
- `GET /api/missions`
- `GET /api/missions/:missionId`
- `GET /api/profile/:address`

Important behavior:

- If `NEXT_PUBLIC_PRIVY_APP_ID` is missing, the app still builds and runs, but wallet login is disabled with a clear message.
- If Solana config is missing, backend write flows can still create local/Postgres records where allowed, but transaction responses return `status: "not_configured"`.
- If Solana config is present, the frontend can sign and send prepared transactions through the connected Privy Solana wallet.

Verification completed for this pass:

- `npm run typecheck` passed.
- `npm run build:app` passed.
- Edited app files showed no linter diagnostics.

## Solana Transaction Builders

The backend now calls shared Solana transaction helpers from `packages/solana`.

These builders prepare unsigned transaction payloads when all Solana config is available:

- `SOLANA_RPC_URL`
- `SINGULARITY_REGISTRY_PROGRAM_ID`
- `SINGULARITY_COUNCIL_PROGRAM_ID`

If config is missing, the endpoint returns `status: "not_configured"` instead of pretending the transaction is ready.

## Object Storage

Uploads use `packages/storage`.

In production, configure:

```bash
BLOB_READ_WRITE_TOKEN=...
```

Without that token, local development stores objects under `.singularity/objects`.

## Indexer

The production indexer is Vercel-native and runs through:

```text
GET /api/indexer/run
```

The route uses shared logic from `packages/indexer` (`@singularity/indexer-core`) and is scheduled by `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/indexer/run",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Each invocation does a bounded batch:

- Connects to Solana RPC.
- Reads signatures for the registry, council, and optional Meteora DBC program.
- Fetches parsed transactions for signatures newer than the last indexed slot.
- Stores raw chain event payloads in Postgres.
- Tracks replay progress in `indexer_state`.
- Uses idempotent `(signature, instruction_index)` storage so replays are safe.
- Scans Meteora DBC transactions for known mission `dbc_pool` addresses and inserts `migration_reconciliation_jobs` when a matching transaction appears.

The route is secured by `CRON_SECRET` in production. Vercel cron calls it with:

```text
Authorization: Bearer <CRON_SECRET>
```

Local development is still available through the CLI app:

Run it after configuring `DATABASE_URL`, `SOLANA_RPC_URL`, and program IDs:

```bash
npm run dev --workspace @singularity/indexer
```

Manual local route testing:

```bash
curl "http://127.0.0.1:8094/api/indexer/run?batchSize=1&maxPages=1"
```

## Custom Programs

Added Anchor program skeletons:

- `programs/singularity_registry`: mission initialization and graduation lifecycle state.
- `programs/singularity_council`: council candidate registration, epoch council finalization, funding request creation, voting, and execution state.

These are not audited yet and should not be deployed to mainnet until the tests and audit gates in `docs/security/launch-audit-gates.md` are complete.

Latest implementation status:

- `singularity_council` now executes funding requests by transferring Token-2022 mission tokens from a PDA-owned treasury vault to the approved recipient token account.
- The treasury authority PDA uses `["treasury_authority", mission]` seeds.
- Execution checks that the request is accepted, the 3 day voting period has passed, and the request was not already executed.
- Epoch council finalization now stores a required escrow amount for each of the 6 council members.
- Council voting now escrows the voter's required mission-token amount into a request-specific escrow vault before counting the vote.
- Mission launch transaction preparation now uses the Meteora Dynamic Bonding Curve SDK to create a Token-2022 DBC pool configured for DAMM v2 migration. The user signs only the Meteora launch transaction; Singularity records the launch in Postgres after submission.
- Mission graduation transaction preparation can mark a registry mission as graduated with a DAMM pool address after Meteora migration.
- The backend execution transaction builder now refuses to return a ready transaction unless the caller provides the real request account, treasury vault, recipient token account, and mint.
- `tests/singularity-council.ts` now runs against the local validator and verifies mission creation, council finalization with escrow amounts, request creation, vote escrow movement, 4 of 6 approval, and blocked early treasury execution with no token movement.

## Progress Update: Vote Escrow And Meteora

Completed in the latest backend/program pass:

- Added vote escrow to `programs/singularity_council`: epoch finalization now stores one required mission-token escrow amount per council member, and each vote transfers the voter's required amount into a request-specific escrow vault before the vote is counted.
- Updated the council integration test path to mint voter tokens, pass the new vote escrow accounts, and assert that escrow balances move as expected.
- Added backend checkpoint plumbing so council checkpoint preparation includes the six escrow amounts and can build the updated `finalize_epoch_council` transaction shape.
- Added `epoch_councils.escrow_amounts` to the Postgres schema.
- Added the Meteora Dynamic Bonding Curve SDK to `packages/solana`.
- Added mission launch transaction preparation that creates a Token-2022 Meteora DBC pool configured for DAMM v2 migration. The registry initialization was removed from the user launch path because it made the transaction exceed Solana's transaction size limit.
- Added mission graduation transaction preparation for recording a migrated DAMM pool in the registry through `mark_graduated`.
- Added a shared production indexer core and Vercel cron route so registry, council, and Meteora DBC events can be indexed continuously in bounded batches.
- Updated `PROGRAM_DOCUMENTATION.md` to explain the new council escrow behavior.
- Fixed the TypeScript deprecation setting so the full workspace typecheck can run with the installed TypeScript version.
- Added `test:anchor:local` to run a robust local Anchor test flow. It builds programs, copies SBF artifacts from the active Cargo target deploy directory into workspace `target/deploy`, then runs `anchor test --skip-build`.
- Added Jupiter quote/swap preparation for mission token buy/sell routing when a mission has a real token mint.
- Surfaced mission chain state in backend mission models: mission PDA, token mint, DBC pool, DAMM pool, treasury vault, and lifecycle.
- Added `POST /api/missions/:missionId/prepare-graduation` for registry graduation bookkeeping.
- Added `migration_reconciliation_jobs` for tracking Meteora DBC migration reconciliation work.

## Progress Update: Holder-Based Council Checkpoints

Completed in the latest council readiness pass:

- `POST /api/council/checkpoints/prepare` now refreshes the mission council from live token holder data before preparing the on-chain `finalize_epoch_council` transaction.
- The backend fetches the token mint's largest token accounts, resolves token-account owners, filters out the mission treasury token account and configured exclusions, keeps system-owned wallet accounts, and persists the top six holders into `missions.council_json`.
- The same top six holders are upserted into `council_candidates` with their latest checkpoint balance in token base units.
- The checkpoint transaction uses those base-unit balances as the council vote escrow amounts, so the on-chain council matches the displayed holder ranking.
- Funding request preparation now refreshes the live top-six holders and, when `SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR` is configured, automatically submits the `finalize_epoch_council` transaction before preparing the funding request transaction.
- Funding request preparation now fails early when a mission has fewer than six eligible token holders or when automatic council finalization is not configured.

Automatic finalization configuration:

```bash
SINGULARITY_COUNCIL_AUTHORITY_PUBKEY=your-authority-wallet-pubkey
SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR='[12,34,...]' # Solana secret key JSON array
```

The keypair value may also be a base58-encoded 64-byte Solana secret key. This must be a backend-only secret, never a `NEXT_PUBLIC_` value. The wallet needs enough SOL to pay rent and transaction fees for epoch council account creation.

The same authority public key must also be baked into the council program when it is built:

```bash
SINGULARITY_COUNCIL_AUTHORITY_PUBKEY=your-authority-wallet-pubkey anchor build
```

`finalize_epoch_council` rejects every signer except this configured authority, and the backend refuses to auto-submit if `SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR` does not match `SINGULARITY_COUNCIL_AUTHORITY_PUBKEY`.

Optional exclusion configuration:

```bash
SINGULARITY_COUNCIL_EXCLUDED_OWNERS=wallet-or-pda-1,wallet-or-pda-2
SINGULARITY_COUNCIL_EXCLUDED_TOKEN_ACCOUNTS=token-account-1,token-account-2
```

The mission treasury vault is excluded automatically. Use the optional exclusions for known program-owned reserve accounts or operational wallets that should not become councillors.

## Progress Update: Chain-First Launch And Vercel Indexer

Completed in the latest production-readiness pass:

- Fixed production API crashes caused by ESM/CommonJS packaging by removing `"type": "module"` from the Next app package.
- Hardened client API helpers so non-JSON error responses no longer crash the UI with `Unexpected token '<'`.
- Fixed wallet auth state so a Privy-connected wallet is not treated as backend-authenticated until the app's own signed nonce flow creates `singularity_session`.
- Changed mission launch from DB-first to chain-first:
  - `POST /api/missions/prepare-launch` prepares the launch and stores `pending_mission_launches`.
  - The visible `missions` row is not inserted during preparation.
  - The client submits the wallet transaction.
  - `POST /api/missions/confirm-launch` records the mission only after transaction submission.
- Removed Singularity registry initialization from the user launch transaction. The user now approves only the Meteora DBC launch transaction.
- Measured the current Meteora-only launch transaction at about `1117` raw bytes, under Solana's `1232` byte limit.
- Added fresh blockhash rewriting before client-side signing to avoid `Blockhash not found` errors from stale backend-prepared transactions.
- Added `pending_mission_launches` to the Postgres schema for prepared-but-not-yet-submitted launches.
- Added `packages/indexer` as `@singularity/indexer-core`.
- Added `GET /api/indexer/run` for Vercel cron indexing.
- Added `vercel.json` cron schedule for `/api/indexer/run` every 5 minutes.
- Updated `apps/indexer` so local/manual runs use the same indexer core as production.

Verification completed:

- `npm run db:migrate`
- `npm run typecheck --workspace @singularity/indexer-core`
- `npm run typecheck --workspace @singularity/indexer`
- `npm run build:app`
- Local cron route smoke test with `batchSize=1&maxPages=1`

Known remaining blockers:

- The indexer stores raw events and queues Meteora migration reconciliation jobs, but full DBC event decoding and automatic DAMM pool resolution still need implementation.
- The app currently records mission launch after transaction submission, not after final on-chain semantic verification of the created pool.
- If the Singularity registry program is still needed for long-term on-chain bookkeeping, it should be initialized by a backend keeper/indexer follow-up rather than by the user's launch transaction.

Verification completed:

- `cargo test -p singularity_council` passed.
- `anchor build` passed, with existing Anchor macro warnings.
- `npm run test:anchor:local` passed and verified the local validator integration path.
- `npm run typecheck` passed.
- `npm run typecheck --workspace @singularity/solana` passed.
- `npm run typecheck --workspace @singularity/indexer` passed.
- `npm run typecheck --workspace @singularity/app` passed.

Known remaining blockers:

- Direct `anchor test` can still be affected by Cursor's `CARGO_TARGET_DIR` environment because Anchor expects deployable artifacts under workspace `target/deploy`. Use `npm run test:anchor:local` for local verification; it copies the generated `.so` files into the path Anchor's validator expects.
- Jupiter quote/swap routing is implemented at the backend transaction layer, but still needs live mainnet validation with production RPC/API limits and real mission mints.
- Meteora migration reconciliation now has raw transaction preservation and job scaffolding, but full DBC event decoding and automatic `dbc_pool -> damm_pool` resolution still need production-grade implementation and mainnet validation.
- External audit remains required before real treasury movement or public mainnet use.

## CI And Security Gates

Added:

- `.github/workflows/ci.yml`
- `scripts/security-gate.mjs`
- `docs/security/launch-audit-gates.md`

The CI checks install dependencies, typecheck, build the app, run the security gate, and run npm audit. The production gate rejects missing production secrets, local storage, and placeholder program IDs.

## Important Production Notes

The backend now has production-grade storage boundaries and real Solana signature verification for wallet login messages.

Before real users or real funds:

- Use a managed Postgres database and run `npm run db:migrate`.
- Seed or index real mission/profile data into Postgres.
- Replace placeholder Anchor program IDs with deployed, audited program IDs.
- Add complete Anchor tests for registry and council invariants.
- Validate Jupiter trading quote/swap routing against real DBC and DAMM markets.
- Run the indexer against a real RPC provider such as Helius or Triton.
- Complete external audit before enabling treasury actions.

## Simple Mental Model

Local development:

```text
UI -> Next.js API routes -> local JSON store seeded from mock-data.ts
```

Production:

```text
UI -> Next.js API routes -> Postgres + Solana signature auth + Object Storage + Solana RPC/Indexer
```

This gives the app real API contracts now, while keeping the high-risk Solana and treasury pieces behind explicit configuration work.

## Exact Setup Steps For You

This section is the simple checklist to configure everything from your side.

### 1. Create A Postgres Database

Postgres is where the app stores normal backend data:

- Profiles.
- Missions.
- Funding requests.
- Votes.
- Mission metrics.
- Indexed Solana events.
- Auth nonces.

You can use Supabase, Neon, Railway, Render, or any managed Postgres provider.

After creating the database, copy the database connection string. It usually looks like this:

```text
postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Add these environment variables:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
SINGULARITY_STORAGE=postgres
```

Then run the database migration:

```bash
npm run db:migrate
```

This creates all backend tables from `packages/db/schema.sql`.

### 2. Configure Vercel Blob

Vercel Blob is Vercel's hosted file storage service.

You need it because Postgres should not store image files directly. Postgres is good for structured data like mission rows, votes, profiles, and metrics. Blob storage is good for files like:

- Mission images.
- Token images.
- Profile avatars.
- Funding request attachments.
- Metadata JSON files.

The app uploads files to Blob, then stores the file URL in Postgres.

The flow is:

```text
User uploads image -> API sends file to Vercel Blob -> Blob returns public URL -> Postgres stores that URL
```

To configure it:

1. Open your Vercel dashboard.
2. Open the Singularity project.
3. Go to `Storage`.
4. Create or connect a Blob store.
5. Copy the Blob read/write token.
6. Add this environment variable:

```bash
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

Without this token, uploads only work locally and are stored under `.singularity/objects`.

### 3. Configure Solana RPC

The backend and indexer need a Solana RPC provider to read chain state and prepare transactions.

Use a provider like Helius, Triton, QuickNode, Alchemy, or another reliable Solana RPC provider.

Add:

```bash
SOLANA_RPC_URL=https://your-solana-rpc-url
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-solana-rpc-url
```

For production, use mainnet RPC.

`SOLANA_RPC_URL` is used by the backend and indexer.

`NEXT_PUBLIC_SOLANA_RPC_URL` is used by the browser when a connected wallet signs and sends a prepared transaction.

### 4. Configure Privy Wallet Login

Privy is now the wallet login provider.

You need Privy so users can connect Solana wallets, including external self-custody wallets, and sign the login nonce.

To configure it:

1. Create a Privy app.
2. Enable Solana wallets in the Privy app settings.
3. Enable external Solana wallet connectors.
4. Copy the Privy app ID.
5. Add this environment variable:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

The app will still build without this value, but wallet login will be disabled until it is set.

### 5. Configure Session Signing

The backend creates a signed HTTP-only session cookie after wallet signature verification.

Add:

```bash
SINGULARITY_SESSION_SECRET=replace-with-a-long-random-secret
```

Use a long random value. Do not reuse a public API key.

This is required in production.

### 6. Deploy The Custom Solana Programs

The repo now has two Anchor program skeletons:

```text
programs/singularity_registry
programs/singularity_council
```

They are not production-audited yet. Before real funds:

1. Install Rust, Solana CLI, and Anchor locally.
2. Run Anchor build/checks locally.
3. Add and run local-validator tests.
4. Deploy the programs.
5. Put upgrade authority behind a multisig.
6. Complete audit/review.

After deployment, add:

```bash
SINGULARITY_REGISTRY_PROGRAM_ID=your-registry-program-id
SINGULARITY_COUNCIL_PROGRAM_ID=your-council-program-id
```

Do not use placeholder program IDs in production.

### 7. GitHub Production Validation

GitHub production configuration validation is turned off for now.

The normal CI still runs:

- Install.
- Typecheck.
- App build.
- Non-production security gate.
- Dependency audit.

The disabled production gate is left commented in `.github/workflows/ci.yml` so it can be re-enabled later before mainnet launch.

When you re-enable it later, add production secrets in GitHub Actions first. For now, you do not need to configure GitHub secrets.

### 8. Add Variables To Vercel

The deployed app also needs the same variables in Vercel.

To add them:

1. Open Vercel.
2. Open your Singularity project.
3. Go to `Settings`.
4. Go to `Environment Variables`.
5. Add each variable.
6. Select the right environments: usually `Production`, `Preview`, and `Development`.
7. Redeploy the app after adding variables.

Add:

```text
DATABASE_URL
DATABASE_SSL
SINGULARITY_STORAGE
SOLANA_RPC_URL
NEXT_PUBLIC_SOLANA_RPC_URL
NEXT_PUBLIC_PRIVY_APP_ID
SINGULARITY_SESSION_SECRET
SINGULARITY_REGISTRY_PROGRAM_ID
SINGULARITY_COUNCIL_PROGRAM_ID
SINGULARITY_METEORA_DBC_PROGRAM_ID
CRON_SECRET
BLOB_READ_WRITE_TOKEN
```

### 9. Run Local Verification

After configuring your `.env.local`, run:

```bash
npm install
npm run db:migrate
npm run typecheck
npm run security:gate
npm run build:app
```

To simulate the production gate locally:

```bash
CI_PRODUCTION_GATE=true npm run security:gate
```

If this fails, it means one or more production variables are missing or unsafe.

### 10. Configure The Vercel Indexer

The production indexer runs as a Vercel cron job against:

```text
/api/indexer/run
```

To make it work:

1. Add `CRON_SECRET` to Vercel environment variables.
2. Add `SINGULARITY_METEORA_DBC_PROGRAM_ID` if you want Meteora DBC activity indexed.
3. Ensure `SOLANA_RPC_URL`, `DATABASE_URL`, `SINGULARITY_REGISTRY_PROGRAM_ID`, and `SINGULARITY_COUNCIL_PROGRAM_ID` are set in production.
4. Redeploy after changing environment variables or `vercel.json`.
5. Check Vercel cron/function logs for `/api/indexer/run`.

For local/manual indexing, run:

```bash
npm run dev --workspace @singularity/indexer
```

For a tiny local route smoke test, run:

```bash
curl "http://127.0.0.1:8094/api/indexer/run?batchSize=1&maxPages=1"
```

The indexer reads Solana program activity and stores raw chain events in Postgres.
