# Reddit Outreach Agent

Finds founder-led startup comments on a specific Reddit post, crafts personalized Singularity outreach messages, and optionally sends them via Reddit chat.

## What it does

1. You provide a Reddit post URL (CLI arg or `REDDIT_OUTREACH_POST_URL`).
2. The agent loads comments from that thread via the Reddit API.
3. It filters for comments that look like someone describing their own startup.
4. OpenAI extracts the startup name and a short value proposition.
5. A second GPT pass polishes the appreciation clause so it reads naturally in the outreach sentence.
6. It drafts a message like:

   > Hey, saw you comment in r/SaaS. I like your value proposition to help indie founders track churn. Are you looking to raise funds for ChurnKit? We're building a platform singularity.diy that gives founders like you access to capital. For founders it is free to use, we charge investors. :)

7. By default it runs in **dry-run** mode: messages are logged and saved to state, but not sent.
8. With `REDDIT_OUTREACH_ENABLE_SEND=true`, it can send via browser automation (Selenium), similar to the legacy script.
9. Live sends are **verified in the chat UI** after pressing Enter. Unverified or rate-limited attempts are not counted as sent and can be retried on a later run.

## Setup

From the repo root:

```bash
cd apps/reddit-outreach-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy credentials into either:

- repo root `.env` / `.env.local`, or
- `apps/app/.env.local` (also loaded automatically)

Required vars:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`
- `REDDIT_USER_AGENT` (e.g. `SingularityOutreach/0.1 by u/your_username`)

Create a Reddit script app at https://www.reddit.com/prefs/apps for the API credentials.

Also set `REDDIT_OUTREACH_MISSION_API_KEY` for OpenAI-compatible comment analysis.

## Run

Dry run (recommended first):

```bash
cd apps/reddit-outreach-agent
source .venv/bin/activate
python reddit_outreach.py "https://www.reddit.com/r/SaaS/comments/POST_ID/title/"
```

Or from repo root:

```bash
npm run dev:reddit-outreach-agent -- "https://www.reddit.com/r/SaaS/comments/POST_ID/title/"
```

Live send (use carefully):

```bash
export REDDIT_OUTREACH_DRY_RUN=false
export REDDIT_OUTREACH_ENABLE_SEND=true
python reddit_outreach.py "https://www.reddit.com/r/SaaS/comments/POST_ID/title/"
```

Requires Chrome and Selenium. Start with `REDDIT_OUTREACH_MAX_PER_RUN=1`.

## Controls

| Variable | Default | Description |
| --- | --- | --- |
| `REDDIT_OUTREACH_POST_URL` | — | Post URL if not passed on CLI |
| `REDDIT_OUTREACH_DRY_RUN` | `true` | Log messages without sending |
| `REDDIT_OUTREACH_ENABLE_SEND` | `false` | Enable Selenium chat send |
| `REDDIT_OUTREACH_MAX_PER_RUN` | `5` | Max founders contacted per run |
| `REDDIT_OUTREACH_MAX_COMMENTS` | `200` | Max comments scanned |
| `REDDIT_OUTREACH_MIN_CONFIDENCE` | `0.55` | Minimum GPT confidence |
| `REDDIT_OUTREACH_SEND_DELAY_MS` | `15000` | Delay between live sends |
| `REDDIT_OUTREACH_STATE_PATH` | `.singularity/reddit-outreach-agent-state.json` | Interaction log |

State tracks messaged usernames after a **verified live send**, an **existing chat/outreach match**, or any **live unverified attempt** (to prevent duplicate retries). Dry-run previews are logged but do not block a later live run.

## Notes

- This agent is isolated from `apps/app` and `apps/landing` dependencies (Python venv + own `requirements.txt`).
- Prefer dry-run first; review generated messages before enabling live send.
- Align outreach copy with [`docs/marketing/outbound-message-tests.md`](../../docs/marketing/outbound-message-tests.md).
