"""Optional Reddit chat sender via browser automation."""

from __future__ import annotations

import os
import random
import re
import time
from dataclasses import dataclass
from typing import Literal

SendResult = Literal["sent", "existing_chat", "failed", "rate_limited", "unverified"]

RATE_LIMIT_PHRASES = (
    "message limit",
    "too many messages",
    "too many chats",
    "too many chat requests",
    "you've created a lot of chats",
    "created a lot of chats",
    "let's take a break",
    "temporarily blocked",
    "can't send messages",
    "cannot send messages",
    "can not send messages",
    "you've reached your limit",
    "reached your limit",
    "chat request limit",
    "unable to send message",
    "unable to start a chat",
)

# Exact Reddit chat-cap copy; safe to match in page text without false positives.
REDDIT_CHAT_CAP_BODY_PHRASES = (
    "you've created a lot of chats",
    "let's take a break",
)

SEND_BLOCKER_JS = """
const phrases = arguments[0].map(p => p.toLowerCase());
const alertSelectors = [
  '[role="alert"]',
  '[role="dialog"]',
  '[class*="toast"]',
  '[class*="banner"]',
  '[class*="error"]',
  '[class*="limit"]',
  '[class*="modal"]',
];
for (const selector of alertSelectors) {
  for (const elem of document.querySelectorAll(selector)) {
    if (!elem.offsetParent) continue;
    const text = (elem.innerText || elem.textContent || '').toLowerCase().trim();
    if (!text) continue;
    for (const phrase of phrases) {
      if (text.includes(phrase)) return phrase;
    }
  }
}
return null;
"""

MESSAGE_VISIBLE_JS = """
const snippet = arguments[0].toLowerCase();
const buckets = [];
const selectors = [
  '[data-testid="message"]',
  '[class*="message"]',
  '[class*="chat"]',
  'div[role="log"]',
  'faceplate-tracker[noun="message"]',
];
for (const selector of selectors) {
  for (const elem of document.querySelectorAll(selector)) {
    const text = (elem.innerText || elem.textContent || '').toLowerCase();
    if (text) buckets.push(text);
  }
}
buckets.push((document.body.innerText || document.body.textContent || '').toLowerCase());
return buckets.some(text => text.includes(snippet));
"""

INPUT_STILL_HAS_TEXT_JS = """
const selectors = [
  'textarea',
  '[contenteditable="true"]',
  '[role="textbox"]',
  'input[type="text"]',
];
for (const selector of selectors) {
  for (const elem of document.querySelectorAll(selector)) {
    if (!elem.offsetParent) continue;
    const value = (elem.value || elem.textContent || elem.innerText || '').trim();
    if (value.length > 20) return value.slice(0, 120);
  }
}
return null;
"""


@dataclass
class SendOutcome:
    status: SendResult
    error: str | None = None
    detail: str | None = None


def human_like_typing(actions, message: str) -> None:
    for char in message:
        actions.send_keys(char)
        actions.perform()
        actions.reset_actions()
        time.sleep(random.uniform(0.02, 0.08))


def _verification_snippet(message: str) -> str:
    normalized = re.sub(r"\s+", " ", message.strip())
    if "singularity.diy" in normalized:
        return "singularity.diy"
    if len(normalized) >= 40:
        return normalized[:40]
    return normalized


def detect_send_blocker(driver) -> str | None:
    try:
        matched = driver.execute_script(SEND_BLOCKER_JS, list(RATE_LIMIT_PHRASES))
        if matched:
            return matched

        body_text = driver.execute_script(
            "return (document.body.innerText || document.body.textContent || '').toLowerCase();"
        )
        for phrase in REDDIT_CHAT_CAP_BODY_PHRASES:
            if phrase in body_text:
                return phrase
    except Exception:
        return None
    return None


def verify_message_delivered(
    driver, message: str, attempts: int = 8
) -> tuple[Literal["sent", "rate_limited", "unverified"], str | None]:
    snippet = _verification_snippet(message)
    for attempt in range(attempts):
        time.sleep(2.5)

        blocker = detect_send_blocker(driver)
        if blocker:
            return "rate_limited", f"Reddit blocker detected: {blocker}"

        try:
            visible = driver.execute_script(MESSAGE_VISIBLE_JS, snippet)
            if visible:
                return "sent", f"Confirmed message snippet in chat: {snippet!r}"
        except Exception:
            pass

        try:
            leftover = driver.execute_script(INPUT_STILL_HAS_TEXT_JS)
            if leftover and snippet.lower() in leftover.lower():
                return "unverified", "Message still in input field after send"
        except Exception:
            pass

    blocker = detect_send_blocker(driver)
    if blocker:
        return "rate_limited", f"Reddit blocker detected after send: {blocker}"

    return "unverified", f"Message snippet not found in chat after send: {snippet!r}"


OUTREACH_MARKER_JS = """
const markers = arguments[0].map(m => m.toLowerCase());
const buckets = [];
const selectors = [
  '[data-testid="message"]',
  '[class*="message"]',
  '[class*="chat"]',
  'div[role="log"]',
  'faceplate-tracker[noun="message"]',
];
for (const selector of selectors) {
  for (const elem of document.querySelectorAll(selector)) {
    const text = (elem.innerText || elem.textContent || '').toLowerCase();
    if (text) buckets.push(text);
  }
}
buckets.push((document.body.innerText || document.body.textContent || '').toLowerCase());
for (const text of buckets) {
  for (const marker of markers) {
    if (text.includes(marker)) return marker;
  }
}
return null;
"""

OUTREACH_MARKERS = (
    "singularity.diy",
    "are you looking to raise funds",
    "saw you comment in r/",
)


def check_existing_outreach(driver) -> str | None:
    try:
        time.sleep(3)
        return driver.execute_script(OUTREACH_MARKER_JS, list(OUTREACH_MARKERS))
    except Exception:
        return None


def check_existing_chat_history(driver, username: str) -> bool:
    marker = check_existing_outreach(driver)
    if marker:
        print(f"Existing outreach detected with u/{username} (matched: {marker})")
        return True
    return False


def send_reddit_chat_message(driver, username: str, message: str) -> SendOutcome:
    profile_url = f"https://www.reddit.com/user/{username}"
    print(f"Navigating to profile: {profile_url}")

    try:
        driver.get(profile_url)
    except Exception as exc:
        print(f"Browser navigation failed: {exc}")
        return SendOutcome("failed", str(exc))

    time.sleep(8)

    blocker = detect_send_blocker(driver)
    if blocker:
        print(f"Reddit send limit detected before chat open: {blocker}")
        return SendOutcome("rate_limited", f"Reddit blocker: {blocker}")

    try:
        clicked = driver.execute_script(
            """
            for (const elem of document.querySelectorAll('*')) {
              const text = (elem.textContent || elem.innerText || '').toLowerCase().trim();
              const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase().trim();
              const hasStartChat = text.includes('start chat') || ariaLabel.includes('start chat');

              if (!hasStartChat) continue;

              const tagName = elem.tagName.toLowerCase();
              if (tagName === 'button' || tagName === 'a' || elem.getAttribute('role') === 'button') {
                elem.click();
                return true;
              }
            }
            return false;
            """
        )
    except Exception as exc:
        print(f"Could not click Start Chat: {exc}")
        return SendOutcome("failed", str(exc))

    if not clicked:
        print("Start Chat button not found.")
        return SendOutcome("failed", "Start Chat button not found")

    time.sleep(8)

    blocker = detect_send_blocker(driver)
    if blocker:
        print(f"Reddit send limit detected in chat UI: {blocker}")
        return SendOutcome("rate_limited", f"Reddit blocker: {blocker}")

    if check_existing_chat_history(driver, username):
        print(f"Existing chat detected with u/{username}; skipping.")
        return SendOutcome("existing_chat")

    try:
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.common.keys import Keys

        actions = ActionChains(driver)
        human_like_typing(actions, message)
        actions.send_keys(Keys.ENTER).perform()

        status, detail = verify_message_delivered(driver, message)
        if status == "sent":
            print(f"Verified send to u/{username}. {detail}")
            return SendOutcome("sent", detail=detail)
        if status == "rate_limited":
            print(f"Rate limited while messaging u/{username}: {detail}")
            return SendOutcome("rate_limited", detail)

        print(f"Send unverified for u/{username}: {detail}")
        return SendOutcome("unverified", detail)
    except Exception as exc:
        print(f"Failed to send chat message: {exc}")
        return SendOutcome("failed", str(exc))


def create_chrome_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1400,1000")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    return webdriver.Chrome(options=options)


def _find_visible_field(driver, selectors: list[str]):
    from selenium.webdriver.common.by import By

    for selector in selectors:
        for element in driver.find_elements(By.CSS_SELECTOR, selector):
            if element.is_displayed() and element.is_enabled():
                return element
    return None


def _type_into_field(driver, element, value: str) -> None:
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.keys import Keys

    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    time.sleep(0.5)

    try:
        element.click()
    except Exception:
        driver.execute_script("arguments[0].click();", element)

    time.sleep(0.5)

    try:
        element.send_keys(Keys.COMMAND, "a")
        element.send_keys(Keys.BACKSPACE)
    except Exception:
        pass

    for char in value:
        try:
            element.send_keys(char)
        except Exception:
            driver.execute_script(
                """
                const el = arguments[0];
                const value = arguments[1];
                if (el.tagName === 'FACEPLATE-TEXT-INPUT') {
                  el.value = value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  return;
                }
                if (el.value !== undefined) {
                  el.value = value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                }
                """,
                element,
                value,
            )
            break
        time.sleep(random.uniform(0.04, 0.12))


def login_with_session_cookie(driver, session_cookie: str) -> bool:
    print("Logging into Reddit using session cookie...")
    driver.get("https://www.reddit.com/")
    time.sleep(2)
    driver.add_cookie(
        {
            "name": "reddit_session",
            "value": session_cookie,
            "domain": ".reddit.com",
            "path": "/",
            "secure": True,
        }
    )
    driver.get("https://www.reddit.com/")
    time.sleep(5)

    logged_in = driver.execute_script(
        """
        return Boolean(
          document.querySelector('[id="USER_DROPDOWN_ID"]') ||
          document.querySelector('button[aria-label*="User"]') ||
          document.querySelector('[data-testid="user-menu"]') ||
          window.location.pathname.startsWith('/user/')
        );
        """
    )
    if logged_in:
        print("Reddit cookie login succeeded.")
        return True

    print("Reddit cookie login failed.")
    return False


def login_to_reddit(driver, username: str, password: str) -> bool:
    session_cookie = os.getenv("REDDIT_SESSION_COOKIE", "").strip()
    if session_cookie:
        return login_with_session_cookie(driver, session_cookie)

    login_url = "https://www.reddit.com/login/"
    print(f"Logging into Reddit as u/{username}...")

    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        driver.get(login_url)
        time.sleep(6)

        wait = WebDriverWait(driver, 25)
        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
        time.sleep(2)

        username_field = _find_visible_field(
            driver,
            [
                "faceplate-text-input[name='username']",
                "#login-username",
                "input[name='username']",
                "input[autocomplete='username']",
                "input[type='text']",
            ],
        )
        password_field = _find_visible_field(
            driver,
            [
                "faceplate-text-input[name='password']",
                "#login-password",
                "input[name='password']",
                "input[autocomplete='current-password']",
                "input[type='password']",
            ],
        )

        if not username_field or not password_field:
            print("Could not find Reddit login fields.")
            return False

        _type_into_field(driver, username_field, username)
        time.sleep(1)
        _type_into_field(driver, password_field, password)
        time.sleep(1)

        submit = _find_visible_field(
            driver,
            [
                "button[type='submit']",
                "button.login",
                "faceplate-tracker[noun='login'] button",
            ],
        )
        if submit:
            driver.execute_script("arguments[0].click();", submit)
        else:
            from selenium.webdriver.common.keys import Keys

            password_field.send_keys(Keys.ENTER)

        time.sleep(10)

        if "login" in driver.current_url.lower():
            print("Login may have failed; still on login page.")
            print("Tip: set REDDIT_SESSION_COOKIE in apps/app/.env.local from your browser cookies.")
            return False

        print("Reddit login succeeded.")
        return True
    except Exception as exc:
        print(f"Reddit login failed: {exc}")
        print("Tip: set REDDIT_SESSION_COOKIE in apps/app/.env.local from your browser cookies.")
        return False
