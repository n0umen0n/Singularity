# X Outreach Agent

Fetches replies under manually supplied X posts, enriches likely non-crypto founder leads, extracts a short project mission from the comment/profile/website, then sends enabled outreach channels: DM and quote post.

## Target Audience

Primary: mission-driven founders outside crypto with visible proof of work and fundraising difficulty.

Use source posts from indie hacker threads, fundraising discussions, Product Hunt launches, OSS sustainability threads, and mission-first founder showcases — not Solana ecosystem posts.

See [`docs/marketing/lead-sourcing-and-tracker.md`](../../docs/marketing/lead-sourcing-and-tracker.md) for recommended source post types.

## Configure

Set these variables in your shell or local env loader:

```bash
export X_BEARER_TOKEN="..."
export X_USER_ACCESS_TOKEN="..."
export X_REPLY_SOURCE_POST_IDS="1234567890,9876543210"
```

By default the agent runs as a dry run. It logs the DMs/quote posts it would send and writes interaction state to `.singularity/x-reply-agent-state.json`.

To run live:

```bash
export X_OUTREACH_DRY_RUN=false
```

The X app needs user-context write access. Use scopes:

```text
tweet.read tweet.write users.read dm.read dm.write offline.access
```

## Run

```bash
npm run dev:x-reply-agent
```

## Mission Extraction

The default mission extractor is heuristic and dependency-free. It tries to extract a short, concrete mission phrase from the reply and linked website text. When the signal is weak, it falls back to a more natural generic phrase like `something people actually need` instead of forcing a bad mission.

It uses:

- The reply text.
- The reply author's X profile description.
- Any public project URL in the reply.
- The linked page title, meta description, and visible text.

For better mission phrases, point the agent at an OpenAI-compatible chat completions API:

```bash
export X_REPLY_MISSION_PROVIDER=openai-compatible
export X_REPLY_MISSION_API_KEY="..."
export X_REPLY_MISSION_API_BASE_URL="https://api.openai.com/v1"
export X_REPLY_MISSION_MODEL="gpt-4o-mini"
```

## Lead Scoring

The agent scores replies for non-crypto founder signals:

- Fundraising and bootstrap keywords (building, startup, launch, mission, bootstrapped, etc.)
- Mission-domain keywords (climate, education, health, open source, indie, SaaS, research, etc.)
- Project URLs and proof-of-work signals
- Penalizes crypto-native terms (solana, defi, token launch, etc.) unless used as secondary overflow

## Controls

The script sends live outreach when `X_OUTREACH_DRY_RUN=false`, but still uses controls:

- `X_OUTREACH_ENABLE_DM` sends one-to-one DM outreach when possible.
- `X_OUTREACH_ENABLE_QUOTE` creates a quote post. If both DM and quote are enabled, the agent attempts both for each lead.
- `X_OUTREACH_MAX_PER_RUN` limits completed outreach actions per run.
- `X_OUTREACH_POST_DELAY_MS` spaces out live outreach.
- `X_REPLY_STATE_PATH` stores skipped, dry-run, and posted interactions.
- Completed DM/quote interactions prevent contacting the same lead twice. Dry-run interactions remain visible in the JSON log but do not block a later live run.

Each interaction record includes the lead key, source post ID, comment ID, author info, comment text, author description, detected project, website URL, generated mission, mission confidence, DM text, quote text, score, reasons, action, run mode, status, timestamp, posted DM/quote IDs when available, and per-channel errors. The score is kept for debugging, but low-score comments are still processed.

## Outreach Messaging

DM and quote templates align with the **Stuck fundraising** angle from [`docs/marketing/outbound-message-tests.md`](../../docs/marketing/outbound-message-tests.md). Messages emphasize that Singularity handles the crypto layer and avoid requiring crypto literacy from founders.
