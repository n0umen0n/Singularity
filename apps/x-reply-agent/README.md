# X Reply Agent

Fetches replies under manually supplied X posts, detects likely Solana project comments, extracts a short project mission from the comment or linked website, and replies from the authenticated X account.

## Configure

Set these variables in your shell or local env loader:

```bash
export X_BEARER_TOKEN="..."
export X_USER_ACCESS_TOKEN="..."
export X_REPLY_SOURCE_POST_IDS="1234567890,9876543210"
```

By default the agent runs as a dry run. It logs the replies it would post and writes interaction state to `.singularity/x-reply-agent-state.json`.

To post for real:

```bash
export X_REPLY_DRY_RUN=false
```

The X app needs user-context write access with scopes such as `tweet.read`, `tweet.write`, and `users.read`.

## Run

```bash
npm run dev:x-reply-agent
```

## Mission Extraction

The default mission extractor is heuristic and dependency-free. It tries to extract a short, concrete mission phrase from the reply and linked website text. When the signal is weak, it falls back to a more natural generic phrase like `something useful for Solana users` instead of forcing a bad mission.

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

## Controls

The script posts automatically when `X_REPLY_DRY_RUN=false`, but still uses basic controls:

- `X_REPLY_MAX_POSTS_PER_RUN` limits total replies per run.
- `X_REPLY_POST_DELAY_MS` spaces out posted replies.
- `X_REPLY_STATE_PATH` stores skipped, dry-run, and posted interactions.
- Posted interactions prevent replying twice to the same comment. Dry-run interactions remain visible in the JSON log but do not block a later real post.

Each interaction record includes the source post ID, comment ID, comment text, author description, detected project, website URL, generated mission, mission confidence, reply text, score, reasons, run mode, status, timestamp, and posted X reply ID when available. The score is kept for debugging, but low-score comments are still processed.
