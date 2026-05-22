# X Founder Outreach Agent

Finds founder-led startup replies under a specific X post, crafts personalized Singularity outreach DMs, and optionally sends them via the X API.

## What it does

1. You provide an X post URL or ID (CLI arg or `X_OUTREACH_POST_URL`).
2. The agent loads replies from that thread via the X API.
3. It filters for replies that look like someone describing their own startup.
4. OpenAI extracts the startup name and a short value proposition.
5. A second GPT pass polishes the appreciation clause so it reads naturally (e.g. avoids awkward "value proposition to a tool for…").
6. It drafts a message like:

   > Hey, saw your reply on X. I like your value proposition to help indie founders track churn. Are you looking to raise funds for ChurnKit? We're building a platform that gives founders like you access to capital. For founders it is free to use, we charge investors. :)

7. By default it runs in **dry-run** mode: messages are logged and saved to state, but not sent.
8. With `X_OUTREACH_DRY_RUN=false`, it sends DMs via the X API.

## Setup

From the repo root:

```bash
cd apps/x-reply-agent
npm install
```

Copy credentials into either:

- repo root `.env` / `.env.local`, or
- `apps/app/.env.local` (also loaded automatically)

Required vars:

| Env var | Where to get it in [developer.x.com](https://developer.x.com) |
| --- | --- |
| `X_BEARER_TOKEN` | **Keys and tokens** → **Bearer Token** (app-only; ~100 chars, often starts with `AAAA`) |
| `X_USER_ACCESS_TOKEN` | **OAuth 2.0 Keys** → **Generate** user access token (long string, usually 80+ chars) |
| `X_OUTREACH_MISSION_API_KEY` | OpenAI API key (same as Reddit outreach) |

**Do not put these in `X_USER_ACCESS_TOKEN`:**

- Bearer Token (causes `OAuth 2.0 Application-Only is forbidden`)
- OAuth 2.0 **Client ID**
- OAuth 2.0 **Client Secret** (~50 chars — common mistake)
- OAuth 1.0 Access Token (different auth scheme; this agent uses OAuth 2.0 Bearer user tokens only)

When you click **Generate** under OAuth 2.0, copy the **access token** shown (not the refresh token field label confusion — use the access token value). Regenerate if unsure.

The X app needs user-context write access. Use scopes:

```text
tweet.read users.read dm.read dm.write offline.access
```

## Run

Dry run (recommended first):

```bash
npm run dev:x-reply-agent -- "https://x.com/someuser/status/1234567890"
```

Or with a post ID:

```bash
npm run dev:x-reply-agent -- 1234567890
```

Live DM send (use carefully):

```bash
export X_OUTREACH_DRY_RUN=false
npm run dev:x-reply-agent -- "https://x.com/someuser/status/1234567890"
```

Start with `X_OUTREACH_MAX_PER_RUN=1`.

## Controls

| Variable | Default | Description |
| --- | --- | --- |
| `X_OUTREACH_POST_URL` | — | Post URL or ID if not passed on CLI |
| `X_REPLY_SOURCE_POST_IDS` | — | Legacy comma-separated post IDs |
| `X_OUTREACH_DRY_RUN` | `true` | Log messages without sending |
| `X_OUTREACH_ENABLE_DM` | `true` | Send one-to-one DM outreach |
| `X_OUTREACH_ENABLE_QUOTE` | `false` | Also post a quote tweet (off by default) |
| `X_OUTREACH_MAX_PER_RUN` | `5` | Max founders contacted per run |
| `X_OUTREACH_SCAN_MULTIPLIER` | `10` | Max replies scanned = `max_per_run × multiplier` (stops early once enough leads found) |
| `X_OUTREACH_MAX_REPLIES` | — | Optional hard cap on replies scanned (overrides multiplier) |
| `X_OUTREACH_MIN_CONFIDENCE` | `0.55` | Minimum GPT confidence |
| `X_OUTREACH_SEND_DELAY_MS` | `15000` | Delay between live DMs |
| `X_OUTREACH_STATE_PATH` | `.singularity/x-outreach-agent-state.json` | Interaction log |
| `X_OUTREACH_MISSION_API_KEY` | — | OpenAI-compatible comment analysis |
| `X_OUTREACH_MISSION_API_BASE_URL` | `https://api.openai.com/v1` | API base URL |
| `X_OUTREACH_MISSION_MODEL` | `gpt-4o-mini` | Analysis model |

State tracks messaged user IDs after a **live DM send**. Dry-run previews are logged but do not block a later live run.

## Notes

- This agent is isolated from `apps/app` dependencies.
- Prefer dry-run first; review generated messages before enabling live send.
- Align outreach copy with [`docs/marketing/outbound-message-tests.md`](../../docs/marketing/outbound-message-tests.md).
