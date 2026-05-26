#!/usr/bin/env python3
"""Reddit founder outreach agent for Singularity."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import praw
from dotenv import load_dotenv
from openai import OpenAI

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATE_PATH = REPO_ROOT / ".singularity" / "reddit-outreach-agent-state.json"
DEFAULT_USED_THREADS_PATH = REPO_ROOT / ".singularity" / "reddit-outreach-used-threads.json"

STARTUP_SIGNAL_TERMS = (
    "building",
    "built",
    "launch",
    "launched",
    "startup",
    "founder",
    "bootstrapped",
    "side project",
    "my app",
    "our app",
    "our platform",
    "we're building",
    "we are building",
    "i'm building",
    "i am building",
    "saas",
    "product hunt",
    "pre-seed",
    "fundraising",
    "raise funds",
    "seed round",
)

CRYPTO_TERMS = (
    "solana",
    "token launch",
    "defi",
    "web3",
    "nft",
    "airdrop",
    "pump.fun",
)


@dataclass
class AgentConfig:
    reddit_client_id: str
    reddit_client_secret: str
    reddit_username: str
    reddit_password: str
    reddit_user_agent: str
    post_url: str
    dry_run: bool
    enable_send: bool
    max_per_run: int
    max_comments: int
    min_confidence: float
    send_delay_ms: int
    state_path: Path
    mission_api_key: str
    mission_api_base_url: str
    mission_model: str


@dataclass
class StartupLead:
    comment_id: str
    username: str
    comment_body: str
    startup_name: str
    value_proposition: str
    confidence: float
    subreddit: str
    post_title: str
    post_url: str


def load_repo_env() -> None:
    preserved = {
        key: value
        for key, value in os.environ.items()
        if key.startswith("REDDIT")
    }
    load_dotenv(REPO_ROOT / ".env")
    load_dotenv(REPO_ROOT / ".env.local", override=True)
    load_dotenv(REPO_ROOT / "apps" / "app" / ".env.local", override=True)
    for key, value in preserved.items():
        os.environ[key] = value


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    return max(0, int(raw))


def read_config(post_url: str | None) -> AgentConfig:
    resolved_post_url = (post_url or os.getenv("REDDIT_OUTREACH_POST_URL", "")).strip()
    if not resolved_post_url:
        raise ValueError(
            "Provide a Reddit post URL via CLI argument or REDDIT_OUTREACH_POST_URL."
        )

    state_path_raw = os.getenv("REDDIT_OUTREACH_STATE_PATH", str(DEFAULT_STATE_PATH))
    state_path = Path(state_path_raw)
    if not state_path.is_absolute():
        state_path = REPO_ROOT / state_path

    return AgentConfig(
        reddit_client_id=required_env("REDDIT_CLIENT_ID"),
        reddit_client_secret=required_env("REDDIT_CLIENT_SECRET"),
        reddit_username=required_env("REDDIT_USERNAME"),
        reddit_password=required_env("REDDIT_PASSWORD"),
        reddit_user_agent=os.getenv(
            "REDDIT_USER_AGENT",
            f"SingularityOutreach/0.1 by u/{required_env('REDDIT_USERNAME')}",
        ),
        post_url=resolved_post_url,
        dry_run=env_bool("REDDIT_OUTREACH_DRY_RUN", True),
        enable_send=env_bool("REDDIT_OUTREACH_ENABLE_SEND", False),
        max_per_run=env_int("REDDIT_OUTREACH_MAX_PER_RUN", 5),
        max_comments=env_int("REDDIT_OUTREACH_MAX_COMMENTS", 200),
        min_confidence=float(os.getenv("REDDIT_OUTREACH_MIN_CONFIDENCE", "0.55")),
        send_delay_ms=env_int("REDDIT_OUTREACH_SEND_DELAY_MS", 15_000),
        state_path=state_path,
        mission_api_key=required_env("REDDIT_OUTREACH_MISSION_API_KEY"),
        mission_api_base_url=os.getenv(
            "REDDIT_OUTREACH_MISSION_API_BASE_URL", "https://api.openai.com/v1"
        ),
        mission_model=os.getenv("REDDIT_OUTREACH_MISSION_MODEL", "gpt-4o-mini"),
    )


def parse_reddit_post_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.netloc not in {"reddit.com", "www.reddit.com", "old.reddit.com"}:
        raise ValueError(f"Not a Reddit URL: {url}")

    match = re.search(r"/r/([^/]+)/comments/([a-z0-9]+)", parsed.path, re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not parse subreddit/post id from URL: {url}")

    subreddit, submission_id = match.group(1), match.group(2)
    return subreddit, submission_id


def normalize_username(username: str) -> str:
    return username.strip().lower()


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"messaged_usernames": [], "interactions": []}

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    data.setdefault("interactions", [])

    messaged: set[str] = set()
    for interaction in data.get("interactions", []):
        status = interaction.get("status")
        mode = interaction.get("mode")
        if status not in {"sent", "existing_chat"} and not (
            status == "unverified" and mode == "live"
        ):
            continue
        username = interaction.get("username")
        if username:
            messaged.add(normalize_username(username))

    data["messaged_usernames"] = sorted(messaged)
    return data


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def sync_used_threads(state: dict[str, Any], threads_path: Path | None = None) -> Path:
    path = threads_path or DEFAULT_USED_THREADS_PATH
    threads: dict[str, dict[str, Any]] = {}

    for interaction in state.get("interactions", []):
        url = (interaction.get("post_url") or "").strip()
        if not url:
            continue
        if url not in threads:
            threads[url] = {
                "post_url": url,
                "post_title": interaction.get("post_title", ""),
                "subreddit": interaction.get("subreddit", ""),
                "first_contacted_at": interaction.get("created_at"),
                "last_contacted_at": interaction.get("created_at"),
                "interaction_count": 0,
                "sent_count": 0,
                "unverified_count": 0,
            }
        record = threads[url]
        record["interaction_count"] += 1
        status = interaction.get("status")
        if status == "sent":
            record["sent_count"] += 1
        elif status == "unverified":
            record["unverified_count"] += 1
        ts = interaction.get("created_at", "")
        if ts and (not record["first_contacted_at"] or ts < record["first_contacted_at"]):
            record["first_contacted_at"] = ts
        if ts and (not record["last_contacted_at"] or ts > record["last_contacted_at"]):
            record["last_contacted_at"] = ts

    thread_list = sorted(
        threads.values(), key=lambda item: item.get("last_contacted_at") or "", reverse=True
    )
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "thread_count": len(thread_list),
        "threads": thread_list,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def looks_like_startup_comment(text: str) -> bool:
    normalized = normalize_text(text)
    if len(normalized) < 20:
        return False

    if any(term in normalized for term in CRYPTO_TERMS):
        return False

    if re.search(r"https?://|www\.", text, re.IGNORECASE):
        return True

    return any(term in normalized for term in STARTUP_SIGNAL_TERMS)


def heuristic_appreciation_clause(raw_value_proposition: str) -> str:
    phrase = raw_value_proposition.strip().rstrip(".")
    if phrase.lower().startswith("to "):
        phrase = phrase[3:].strip()

    verb_starts = (
        "help",
        "automate",
        "build",
        "enable",
        "create",
        "connect",
        "make",
        "fund",
        "launch",
        "power",
        "provide",
        "verify",
        "track",
        "simplify",
        "reduce",
        "give",
        "offer",
        "deliver",
    )
    if phrase.lower().startswith(verb_starts):
        return f"I like your value proposition to {phrase}"

    lowered = phrase.lower()
    if lowered.startswith(("a ", "an ", "the ")):
        trimmed = phrase.split(" ", 1)[1] if " " in phrase else phrase
        return f"I like your focus on {trimmed}"

    if re.match(r"^\w+ing\b", phrase, re.IGNORECASE):
        return f"I like that you're {phrase}"

    if not phrase:
        return "I like what you're building"

    return f"I like what you're building around {phrase}"


def format_outreach_message(
    subreddit: str, appreciation_clause: str, startup_name: str
) -> str:
    clause = appreciation_clause.strip().rstrip(".")
    startup = startup_name.strip()

    return (
        f"Hey, saw you comment in r/{subreddit}. {clause}. "
        f"Are you looking to raise funds for {startup}? "
        "We're building a platform singularity.diy that gives founders like you access to capital. "
        "For founders it is free to use, we charge investors. :)"
    )


class RedditOutreachAgent:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.reddit = praw.Reddit(
            client_id=config.reddit_client_id,
            client_secret=config.reddit_client_secret,
            username=config.reddit_username,
            password=config.reddit_password,
            user_agent=config.reddit_user_agent,
        )
        self.openai = OpenAI(
            api_key=config.mission_api_key,
            base_url=config.mission_api_base_url,
        )
        self.state = load_state(config.state_path)
        self.messaged = set(self.state.get("messaged_usernames", []))

    def fetch_comments(self, submission_id: str) -> list[Any]:
        submission = self.reddit.submission(id=submission_id)
        print("Expanding Reddit comment threads (loading all)...", flush=True)
        submission.comments.replace_more(limit=None)
        comments = submission.comments.list()
        if self.config.max_comments:
            comments = comments[: self.config.max_comments]
        print(f"Loaded {len(comments)} comments.", flush=True)
        return comments

    def analyze_comment(
        self,
        comment_body: str,
        username: str,
        subreddit: str,
        post_title: str,
    ) -> dict[str, Any] | None:
        prompt = f"""
Analyze this Reddit comment from r/{subreddit}.

Post title: "{post_title}"
Author: u/{username}
Comment: "{comment_body}"

Determine whether the author is talking about their own startup, product, or founder project.

Return JSON:
{{
  "is_startup_founder": true/false,
  "confidence": 0.0-1.0,
  "startup_name": "best guess at startup/product name, or null",
  "value_proposition": "very short phrase (max 12 words) describing what they do and for whom, e.g. 'help indie founders track churn' or 'automate compliance for fintech teams'",
  "reason": "one short sentence"
}}

Rules:
- Only mark true when they appear to be promoting or describing their own venture.
- Ignore people recommending third-party tools they did not build.
- Ignore crypto-native token launches unless clearly a mission-driven product startup.
- value_proposition must be concrete and specific, not generic marketing fluff.
- startup_name should be short; use the product name if obvious, otherwise infer from context.
"""

        try:
            response = self.openai.chat.completions.create(
                model=self.config.mission_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You identify founder-led startups in Reddit comments and return strict JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            if not content:
                return None
            return json.loads(content)
        except Exception as exc:
            print(f"OpenAI analysis failed for u/{username}: {exc}")
            return None

    def polish_appreciation_clause(
        self,
        raw_value_proposition: str,
        startup_name: str,
        username: str,
        comment_body: str,
        subreddit: str,
    ) -> str:
        prompt = f"""
Write one natural English appreciation clause for a founder outreach DM.

The full message will be:
"Hey, saw you comment in r/{subreddit}. {{APPRECIATION_CLAUSE}}. Are you looking to raise funds for {startup_name}? ..."

Raw value proposition: "{raw_value_proposition}"
Startup: "{startup_name}"
Founder: u/{username}
Their comment: "{comment_body[:500]}"

Return JSON:
{{
  "appreciation_clause": "I like your value proposition to help indie founders track churn",
  "grammatically_sound": true
}}

Rules:
- appreciation_clause MUST be grammatically correct casual English, specific to their venture.
- Prefer "I like your value proposition to [verb phrase]" ONLY when it reads naturally after "to"
  (e.g. "to help teams track churn", "to automate compliance for fintech teams").
- If "value proposition to X" would sound awkward, use instead:
  "I like that you're ...", "I like your focus on ...", or "I like what you're building for ...".
- Do NOT include a trailing period in appreciation_clause.
- Do NOT mention Singularity, fundraising, or investors.
- Keep appreciation_clause under 20 words.
- Set grammatically_sound to false only if you cannot produce a natural clause; still provide your best attempt.
"""

        try:
            response = self.openai.chat.completions.create(
                model=self.config.mission_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You polish founder outreach copy and return strict JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            if not content:
                return heuristic_appreciation_clause(raw_value_proposition)

            parsed = json.loads(content)
            clause = (parsed.get("appreciation_clause") or "").strip().rstrip(".")
            if clause and len(clause) >= 12:
                return clause
        except Exception as exc:
            print(f"Grammar polish failed for u/{username}: {exc}")

        return heuristic_appreciation_clause(raw_value_proposition)

    def build_lead(
        self,
        comment: Any,
        subreddit: str,
        post_title: str,
        post_url: str,
    ) -> StartupLead | None:
        if not getattr(comment, "author", None):
            return None

        username = comment.author.name
        if normalize_username(username) == normalize_username(self.config.reddit_username):
            return None
        if normalize_username(username) in self.messaged:
            return None

        body = getattr(comment, "body", "")
        if not body or body in {"[deleted]", "[removed]"}:
            return None
        if not looks_like_startup_comment(body):
            return None

        analysis = self.analyze_comment(body, username, subreddit, post_title)
        if not analysis:
            return None

        if not analysis.get("is_startup_founder"):
            return None

        confidence = float(analysis.get("confidence") or 0)
        if confidence < self.config.min_confidence:
            return None

        startup_name = (analysis.get("startup_name") or "").strip()
        value_proposition = (analysis.get("value_proposition") or "").strip()
        if not startup_name or not value_proposition:
            return None

        return StartupLead(
            comment_id=comment.id,
            username=username,
            comment_body=body,
            startup_name=startup_name,
            value_proposition=value_proposition,
            confidence=confidence,
            subreddit=subreddit,
            post_title=post_title,
            post_url=post_url,
        )

    def record_interaction(
        self,
        lead: StartupLead,
        message: str,
        mode: str,
        status: str,
        error: str | None = None,
        detail: str | None = None,
    ) -> None:
        record = {
            "id": f"{lead.comment_id}:{lead.username}",
            "username": lead.username,
            "comment_id": lead.comment_id,
            "subreddit": lead.subreddit,
            "post_title": lead.post_title,
            "post_url": lead.post_url,
            "startup_name": lead.startup_name,
            "value_proposition": lead.value_proposition,
            "confidence": lead.confidence,
            "message": message,
            "mode": mode,
            "status": status,
            "error": error,
            "detail": detail,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        interactions = self.state.setdefault("interactions", [])
        interactions.append(record)
        if status in {"sent", "existing_chat"} or (
            status == "unverified" and mode == "live"
        ):
            self.messaged.add(normalize_username(lead.username))
            self.state["messaged_usernames"] = sorted(self.messaged)
        save_state(self.config.state_path, self.state)

    def maybe_send(
        self, lead: StartupLead, message: str, driver: Any | None = None
    ) -> tuple[str, str | None, str | None]:
        if self.config.dry_run or not self.config.enable_send:
            return "would_send", None, None

        if driver is None:
            return "failed", "Browser session not initialized", None

        try:
            from chat_sender import send_reddit_chat_message

            outcome = send_reddit_chat_message(driver, lead.username, message)
            return outcome.status, outcome.error, outcome.detail
        except Exception as exc:
            return "failed", str(exc), None

    def setup_send_driver(self) -> Any | None:
        if self.config.dry_run or not self.config.enable_send:
            return None

        try:
            from chat_sender import create_chrome_driver, login_to_reddit
        except ImportError:
            print("Selenium is not installed. Run: pip install -r requirements.txt")
            return None

        driver = create_chrome_driver()
        if not login_to_reddit(driver, self.config.reddit_username, self.config.reddit_password):
            print("Reddit browser login failed.")
            driver.quit()
            return None

        return driver

    def run(self) -> int:
        subreddit, submission_id = parse_reddit_post_url(self.config.post_url)
        submission = self.reddit.submission(id=submission_id)
        post_title = submission.title
        post_url = self.config.post_url

        print(f"Reddit outreach agent")
        print(f"  Post: r/{subreddit} — {post_title}")
        print(f"  dry_run={self.config.dry_run} enable_send={self.config.enable_send}")
        print(f"  max_per_run={self.config.max_per_run}")
        print(f"  previously messaged accounts: {len(self.messaged)}")

        comments = self.fetch_comments(submission_id)
        verified_sent = 0
        stats = {
            "would_send": 0,
            "sent": 0,
            "failed": 0,
            "existing_chat": 0,
            "unverified": 0,
            "rate_limited": 0,
        }
        driver = self.setup_send_driver()
        if not self.config.dry_run and self.config.enable_send and driver is None:
            return 1

        try:
            for comment in comments:
                if verified_sent >= self.config.max_per_run:
                    break

                lead = self.build_lead(comment, subreddit, post_title, post_url)
                if not lead:
                    continue

                appreciation = self.polish_appreciation_clause(
                    lead.value_proposition,
                    lead.startup_name,
                    lead.username,
                    lead.comment_body,
                    lead.subreddit,
                )
                message = format_outreach_message(
                    lead.subreddit, appreciation, lead.startup_name
                )

                print("")
                print(f"Lead: u/{lead.username} — {lead.startup_name} ({lead.confidence:.2f})")
                print(f"Value prop: {lead.value_proposition}")
                print(f"Appreciation: {appreciation}")
                print(f"Message:\n{message}")

                status, error, detail = self.maybe_send(lead, message, driver)
                mode = "dry-run" if self.config.dry_run or not self.config.enable_send else "live"
                self.record_interaction(lead, message, mode, status, error, detail)
                stats[status] = stats.get(status, 0) + 1

                if status == "would_send":
                    verified_sent += 1
                elif status == "sent":
                    verified_sent += 1
                    if self.config.send_delay_ms:
                        time.sleep(self.config.send_delay_ms / 1000)
                elif status == "existing_chat":
                    print(f"Skipped u/{lead.username}: existing chat.")
                elif status == "unverified":
                    print(f"Unverified u/{lead.username}: {error or detail}")
                    print(f"Marked u/{lead.username} as contacted to avoid duplicate retries.")
                elif status == "rate_limited":
                    print(f"Rate limited while messaging u/{lead.username}: {error or detail}")
                    print("Stopping run early because Reddit appears to be blocking sends.")
                    break
                elif status == "failed":
                    print(f"Failed u/{lead.username}: {error}")
        finally:
            if driver is not None:
                try:
                    driver.quit()
                except Exception:
                    pass

        print("")
        if self.config.dry_run or not self.config.enable_send:
            print(
                f"Done. Would contact {stats.get('would_send', 0)} founder(s). "
                f"State: {self.config.state_path}"
            )
        else:
            print("Done. Send results:")
            print(f"  Verified sent: {stats.get('sent', 0)}")
            print(f"  Unverified (not counted): {stats.get('unverified', 0)}")
            print(f"  Failed: {stats.get('failed', 0)}")
            print(f"  Existing chat skipped: {stats.get('existing_chat', 0)}")
            print(f"  Rate limited stops: {stats.get('rate_limited', 0)}")
            print(f"  Target this run: {self.config.max_per_run}")
            print(f"  State: {self.config.state_path}")
        threads_path = sync_used_threads(self.state)
        print(f"  Used threads: {threads_path}")
        return 0


def audit_state(state_path: Path, limit: int = 60) -> int:
    if not state_path.exists():
        print(f"No state file at {state_path}")
        return 1

    with state_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    interactions = data.get("interactions", [])
    recent = interactions[-limit:]
    counts: dict[str, int] = {}
    legacy_unverified = 0
    verified_sent = 0
    for interaction in recent:
        status = interaction.get("status") or "unknown"
        counts[status] = counts.get(status, 0) + 1
        if status == "sent":
            if interaction.get("detail"):
                verified_sent += 1
            else:
                legacy_unverified += 1

    print(f"Audit: last {len(recent)} interactions in {state_path}")
    for status, count in sorted(counts.items(), key=lambda item: item[0]):
        print(f"  {status}: {count}")
    if legacy_unverified:
        print(f"  legacy_unverified_sent: {legacy_unverified}")
    if verified_sent:
        print(f"  verified_sent: {verified_sent}")

    print("")
    print("Recent live send attempts:")
    live_recent = [
        interaction
        for interaction in recent
        if interaction.get("mode") == "live"
        and interaction.get("status")
        in {"sent", "unverified", "failed", "rate_limited", "existing_chat"}
    ]
    for interaction in live_recent[-20:]:
        username = interaction.get("username")
        status = interaction.get("status")
        startup = interaction.get("startup_name")
        created_at = interaction.get("created_at", "")[:19]
        detail = interaction.get("detail") or interaction.get("error") or ""
        if interaction.get("status") == "sent" and not interaction.get("detail"):
            detail = "legacy entry; delivery not verified in UI"
        suffix = f" — {detail}" if detail else ""
        print(f"  {created_at} u/{username} [{status}] {startup}{suffix}")

    unverified = counts.get("unverified", 0)
    print("")
    print(
        "Note: legacy sent entries without a detail field were recorded before "
        "delivery verification existed and may overstate actual Reddit deliveries."
    )
    print(
        f"In this window: {verified_sent} verified sent, {legacy_unverified} legacy unverified sent, "
        f"{unverified} newly unverified, {counts.get('failed', 0)} failed, "
        f"{counts.get('rate_limited', 0)} rate limited."
    )
    return 0


def main() -> int:
    load_repo_env()

    parser = argparse.ArgumentParser(
        description="Find startup founders in a Reddit post thread and draft outreach messages."
    )
    parser.add_argument(
        "post_url",
        nargs="?",
        help="Reddit post URL, e.g. https://www.reddit.com/r/SaaS/comments/abc123/...",
    )
    parser.add_argument(
        "--audit",
        action="store_true",
        help="Summarize recent send results from state instead of running outreach.",
    )
    parser.add_argument(
        "--audit-limit",
        type=int,
        default=60,
        help="Number of recent interactions to include in --audit output.",
    )
    args = parser.parse_args()

    try:
        if args.audit:
            load_repo_env()
            state_path_raw = os.getenv("REDDIT_OUTREACH_STATE_PATH", str(DEFAULT_STATE_PATH))
            state_path = Path(state_path_raw)
            if not state_path.is_absolute():
                state_path = REPO_ROOT / state_path
            return audit_state(state_path, limit=max(1, args.audit_limit))

        config = read_config(args.post_url)
        agent = RedditOutreachAgent(config)
        return agent.run()
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Unexpected error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
