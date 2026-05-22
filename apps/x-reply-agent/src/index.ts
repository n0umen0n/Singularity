import { config as loadDotenv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, ".singularity", "x-outreach-agent-state.json");

const STARTUP_SIGNAL_TERMS = [
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
];

const CRYPTO_TERMS = [
  "solana",
  "token launch",
  "defi",
  "web3",
  "nft",
  "airdrop",
  "pump.fun",
];

type AgentConfig = {
  bearerToken: string;
  userAccessToken: string;
  postIds: string[];
  dryRun: boolean;
  enableDm: boolean;
  enableQuote: boolean;
  statePath: string;
  maxPerRun: number;
  maxRepliesToScan: number;
  scanMultiplier: number;
  minConfidence: number;
  requestDelayMs: number;
  sendDelayMs: number;
  missionApiKey: string;
  missionApiBaseUrl: string;
  missionModel: string;
};

type XPost = {
  id: string;
  text: string;
  author_id?: string;
  author_username?: string;
  author_name?: string;
  author_description?: string;
  created_at?: string;
  conversation_id?: string;
};

type XSearchResponse = {
  data?: XPost[];
  includes?: {
    users?: Array<{ id: string; username: string; name?: string; description?: string }>;
  };
  meta?: { next_token?: string };
};

type XTweetResponse = {
  data?: XPost;
  includes?: {
    users?: Array<{ id: string; username: string; name?: string }>;
  };
};

type FounderLead = {
  replyId: string;
  authorId: string;
  username: string;
  replyText: string;
  startupName: string;
  valueProposition: string;
  appreciationClause: string;
  confidence: number;
  sourcePostId: string;
  sourcePostText: string;
};

type InteractionRecord = {
  id: string;
  username: string;
  authorId: string;
  replyId: string;
  sourcePostId: string;
  startupName: string;
  valueProposition: string;
  confidence: number;
  message: string;
  mode: "dry-run" | "live";
  status: "would_send" | "dm_sent" | "failed" | "skipped";
  dmConversationId?: string;
  dmEventId?: string;
  error?: string;
  createdAt: string;
};

type AgentState = {
  messagedUserIds: string[];
  interactions: InteractionRecord[];
};

function loadRepoEnv(): void {
  const preserved = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("X_") || key.startsWith("REDDIT_")),
  );
  loadDotenv({ path: path.join(REPO_ROOT, ".env") });
  loadDotenv({ path: path.join(REPO_ROOT, ".env.local"), override: true });
  loadDotenv({ path: path.join(REPO_ROOT, "apps", "app", ".env.local"), override: true });
  for (const [key, value] of Object.entries(preserved)) {
    if (value !== undefined) process.env[key] = value;
  }
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function positiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveMaxRepliesToScan(
  maxPerRun: number,
  scanMultiplier: number,
  explicitMaxReplies?: string,
): number {
  if (explicitMaxReplies?.trim()) {
    return positiveInt(explicitMaxReplies, maxPerRun * scanMultiplier);
  }
  return maxPerRun * scanMultiplier;
}

function validateXAuthTokens(bearerToken: string, userAccessToken: string, enableDm: boolean, dryRun: boolean): void {
  if (!enableDm || dryRun) return;

  if (bearerToken === userAccessToken) {
    throw new Error(
      "X_USER_ACCESS_TOKEN must not be the same as X_BEARER_TOKEN. Use the OAuth 2.0 user access token for DMs, not the app Bearer Token.",
    );
  }

  if (userAccessToken.length < 80) {
    throw new Error(
      `X_USER_ACCESS_TOKEN looks wrong (${userAccessToken.length} chars). ` +
        "It is probably your OAuth 2.0 Client Secret or Client ID — not a user access token. " +
        "In developer.x.com → your app → OAuth 2.0 Keys → click Generate to create a user access token " +
        "(long string, usually 80+ characters). Put that in X_USER_ACCESS_TOKEN.",
    );
  }

  if (bearerToken.startsWith("AAAA") && userAccessToken.startsWith("AAAA") && bearerToken.length > 90) {
    throw new Error(
      "X_USER_ACCESS_TOKEN looks like a second Bearer Token. Generate an OAuth 2.0 user access token instead (OAuth 2.0 Keys → Generate).",
    );
  }
}

function isDmAuthError(error: string): boolean {
  return /unsupported authentication|application-only|oauth 2\.0 application-only/i.test(error);
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function csv(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseXPostUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) {
      throw new Error(`Not an X/Twitter URL: ${url}`);
    }
    const match = parsed.pathname.match(/\/status\/(\d+)/i);
    if (!match) throw new Error(`Could not parse post id from URL: ${url}`);
    return match[1];
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL: ${url}`);
    }
    throw error;
  }
}

function resolvePostIds(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.includes("x.com") || trimmed.includes("twitter.com")) {
    return [parseXPostUrl(trimmed)];
  }

  if (/^\d+$/.test(trimmed)) {
    return [trimmed];
  }

  return csv(trimmed);
}

function readConfig(postInput: string | undefined): AgentConfig {
  const resolved =
    postInput?.trim() ||
    process.env.X_OUTREACH_POST_URL?.trim() ||
    process.env.X_REPLY_SOURCE_POST_IDS?.trim() ||
    "";

  const postIds = resolvePostIds(resolved);
  if (postIds.length === 0) {
    throw new Error(
      "Provide an X post URL or ID via CLI argument, X_OUTREACH_POST_URL, or X_REPLY_SOURCE_POST_IDS.",
    );
  }

  const statePathRaw = process.env.X_OUTREACH_STATE_PATH ?? process.env.X_REPLY_STATE_PATH ?? DEFAULT_STATE_PATH;
  const statePath = path.isAbsolute(statePathRaw) ? statePathRaw : path.join(REPO_ROOT, statePathRaw);

  const missionApiKey =
    process.env.X_OUTREACH_MISSION_API_KEY?.trim() ||
    process.env.X_REPLY_MISSION_API_KEY?.trim() ||
    "";

  if (!missionApiKey) {
    throw new Error("Missing required environment variable: X_OUTREACH_MISSION_API_KEY");
  }

  const bearerToken = requiredEnv("X_BEARER_TOKEN");
  const userAccessToken = requiredEnv("X_USER_ACCESS_TOKEN");
  const enableDm = envBool("X_OUTREACH_ENABLE_DM", true);
  const dryRun = envBool("X_OUTREACH_DRY_RUN", envBool("X_REPLY_DRY_RUN", true));
  validateXAuthTokens(bearerToken, userAccessToken, enableDm, dryRun);

  return {
    bearerToken,
    userAccessToken,
    postIds,
    dryRun,
    enableDm,
    enableQuote: envBool("X_OUTREACH_ENABLE_QUOTE", false),
    statePath,
    maxPerRun: positiveInt(process.env.X_OUTREACH_MAX_PER_RUN ?? process.env.X_REPLY_MAX_POSTS_PER_RUN, 5),
    scanMultiplier: positiveInt(process.env.X_OUTREACH_SCAN_MULTIPLIER, 10),
    maxRepliesToScan: resolveMaxRepliesToScan(
      positiveInt(process.env.X_OUTREACH_MAX_PER_RUN ?? process.env.X_REPLY_MAX_POSTS_PER_RUN, 5),
      positiveInt(process.env.X_OUTREACH_SCAN_MULTIPLIER, 10),
      process.env.X_OUTREACH_MAX_REPLIES ?? process.env.X_REPLY_MAX_REPLIES_PER_POST,
    ),
    minConfidence: Number.parseFloat(process.env.X_OUTREACH_MIN_CONFIDENCE ?? "0.55"),
    requestDelayMs: positiveInt(process.env.X_REPLY_REQUEST_DELAY_MS, 1_000),
    sendDelayMs: positiveInt(
      process.env.X_OUTREACH_SEND_DELAY_MS ?? process.env.X_OUTREACH_POST_DELAY_MS ?? process.env.X_REPLY_POST_DELAY_MS,
      15_000,
    ),
    missionApiKey,
    missionApiBaseUrl:
      process.env.X_OUTREACH_MISSION_API_BASE_URL ??
      process.env.X_REPLY_MISSION_API_BASE_URL ??
      "https://api.openai.com/v1",
    missionModel: process.env.X_OUTREACH_MISSION_MODEL ?? process.env.X_REPLY_MISSION_MODEL ?? "gpt-4o-mini",
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function looksLikeStartupReply(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length < 20) return false;
  if (CRYPTO_TERMS.some((term) => normalized.includes(term))) return false;
  if (/https?:\/\/|www\./i.test(text)) return true;
  return STARTUP_SIGNAL_TERMS.some((term) => normalized.includes(term));
}

function formatOutreachMessage(appreciationClause: string, startupName: string): string {
  const clause = appreciationClause.trim().replace(/\.+$/, "");
  const startup = startupName.trim();

  return (
    `Hey, saw your reply on X. ${clause}. ` +
    `Are you looking to raise funds for ${startup}? ` +
    `We're building a platform that gives founders like you access to capital. ` +
    `For founders it is free to use, we charge investors. :)`
  );
}

function heuristicAppreciationClause(rawValueProposition: string): string {
  const phrase = rawValueProposition.trim().replace(/^to\s+/i, "").replace(/\.+$/, "");
  if (!phrase) return "I like what you're building";

  if (
    /^(help|automate|build|enable|create|connect|make|fund|launch|power|provide|verify|track|simplify|reduce|give|offer|deliver)\b/i.test(
      phrase,
    )
  ) {
    return `I like your value proposition to ${phrase}`;
  }

  if (/^(a|an|the)\s+/i.test(phrase)) {
    return `I like your focus on ${phrase.replace(/^(a|an|the)\s+/i, "")}`;
  }

  if (/^\w+ing\b/i.test(phrase)) {
    return `I like that you're ${phrase}`;
  }

  return `I like what you're building around ${phrase}`;
}

type AppreciationPolish = {
  appreciation_clause: string;
  grammatically_sound?: boolean;
};

async function chatCompletionJson<T>(
  config: AgentConfig,
  system: string,
  user: string,
): Promise<T | null> {
  try {
    const response = await fetch(`${config.missionApiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.missionApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.missionModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function polishAppreciationClause(
  config: AgentConfig,
  lead: Pick<FounderLead, "valueProposition" | "startupName" | "replyText" | "username">,
): Promise<string> {
  const prompt = `
Write one natural English appreciation clause for a founder outreach DM.

The full message will be:
"Hey, saw your reply on X. {APPRECIATION_CLAUSE}. Are you looking to raise funds for ${lead.startupName}? ..."

Raw value proposition: "${lead.valueProposition}"
Startup: "${lead.startupName}"
Founder: @${lead.username}
Their reply: "${lead.replyText.slice(0, 500)}"

Return JSON:
{
  "appreciation_clause": "I like your value proposition to help indie founders track churn",
  "grammatically_sound": true
}

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
`;

  const result = await chatCompletionJson<AppreciationPolish>(
    config,
    "You polish founder outreach copy and return strict JSON.",
    prompt,
  );

  const clause = result?.appreciation_clause?.trim().replace(/\.+$/, "");
  if (clause && clause.length >= 12) {
    return clause;
  }

  return heuristicAppreciationClause(lead.valueProposition);
}

async function loadState(statePath: string): Promise<AgentState> {
  try {
    const data = JSON.parse(await readFile(statePath, "utf8")) as Partial<AgentState>;
    const interactions = Array.isArray(data.interactions) ? data.interactions : [];
    const messaged = new Set<string>();

    for (const interaction of interactions) {
      if (interaction.status !== "dm_sent") continue;
      if (interaction.authorId) messaged.add(interaction.authorId);
    }

    return { messagedUserIds: [...messaged], interactions };
  } catch {
    return { messagedUserIds: [], interactions: [] };
  }
}

async function saveState(statePath: string, state: AgentState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  state.messagedUserIds = [
    ...new Set(
      state.interactions.filter((i) => i.status === "dm_sent" && i.authorId).map((i) => i.authorId),
    ),
  ];
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function xRequest<T>(token: string, url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`X API request failed: ${response.status} ${response.statusText} ${body}`);
  }

  return (await response.json()) as T;
}

async function fetchSourcePost(config: AgentConfig, postId: string): Promise<XPost> {
  const params = new URLSearchParams({
    "tweet.fields": "author_id,conversation_id,created_at,text",
    expansions: "author_id",
    "user.fields": "username,name",
  });

  const data = await xRequest<XTweetResponse>(
    config.bearerToken,
    `https://api.x.com/2/tweets/${postId}?${params.toString()}`,
    { method: "GET" },
  );

  if (!data.data) throw new Error(`Could not load source post ${postId}`);
  const author = data.includes?.users?.[0];
  return author
    ? {
        ...data.data,
        author_username: author.username,
        author_name: author.name,
      }
    : data.data;
}

async function* streamConversationReplies(
  config: AgentConfig,
  conversationId: string,
): AsyncGenerator<XPost> {
  let scanned = 0;
  let nextToken: string | undefined;

  while (scanned < config.maxRepliesToScan) {
    const remaining = config.maxRepliesToScan - scanned;
    const params = new URLSearchParams({
      query: `conversation_id:${conversationId} -is:retweet`,
      max_results: String(Math.min(100, Math.max(10, remaining))),
      "tweet.fields": "author_id,conversation_id,created_at,text",
      expansions: "author_id",
      "user.fields": "description,name,username",
    });
    if (nextToken) params.set("next_token", nextToken);

    const data = await xRequest<XSearchResponse>(
      config.bearerToken,
      `https://api.x.com/2/tweets/search/recent?${params.toString()}`,
      { method: "GET" },
    );

    const usersById = new Map((data.includes?.users ?? []).map((user) => [user.id, user]));
    const pageReplies = (data.data ?? [])
      .filter((post) => post.id !== conversationId)
      .map((post) => {
        const author = post.author_id ? usersById.get(post.author_id) : undefined;
        return author
          ? {
              ...post,
              author_username: author.username,
              author_name: author.name,
              author_description: author.description,
            }
          : post;
      })
      .slice(0, remaining);

    for (const reply of pageReplies) {
      scanned += 1;
      yield reply;
    }

    nextToken = data.meta?.next_token;
    if (!nextToken || pageReplies.length === 0) break;
    await sleep(config.requestDelayMs);
  }
}

type FounderAnalysis = {
  is_startup_founder: boolean;
  confidence: number;
  startup_name: string | null;
  value_proposition: string | null;
  reason?: string;
};

async function analyzeReply(
  config: AgentConfig,
  reply: XPost,
  sourcePost: XPost,
): Promise<FounderAnalysis | null> {
  const username = reply.author_username ?? "unknown";
  const prompt = `
Analyze this X reply in a founder thread.

Source post: "${sourcePost.text}"
Author: @${username}
Profile bio: "${reply.author_description ?? ""}"
Reply: "${reply.text}"

Determine whether the author is talking about their own startup, product, or founder project.

Return JSON:
{
  "is_startup_founder": true/false,
  "confidence": 0.0-1.0,
  "startup_name": "best guess at startup/product name, or null",
  "value_proposition": "very short phrase (max 12 words) describing what they do and for whom, e.g. 'help indie founders track churn'",
  "reason": "one short sentence"
}

Rules:
- Only mark true when they appear to be promoting or describing their own venture.
- Ignore people recommending third-party tools they did not build.
- Ignore crypto-native token launches unless clearly a mission-driven product startup.
- value_proposition must be concrete and specific, not generic marketing fluff.
- startup_name should be short; use the product name if obvious, otherwise infer from context.
`;

  const result = await chatCompletionJson<FounderAnalysis>(
    config,
    "You identify founder-led startups in social posts and return strict JSON.",
    prompt,
  );

  if (!result) {
    console.warn(`OpenAI analysis failed for @${username}`);
  }

  return result;
}

function buildLead(
  reply: XPost,
  sourcePost: XPost,
  messagedUserIds: Set<string>,
  analysis: FounderAnalysis,
): FounderLead | null {
  if (!reply.author_id || !reply.author_username) return null;
  if (messagedUserIds.has(reply.author_id)) return null;

  const body = reply.text?.trim();
  if (!body) return null;
  if (!looksLikeStartupReply(body)) return null;

  if (!analysis.is_startup_founder) return null;

  const confidence = Number(analysis.confidence ?? 0);
  const startupName = (analysis.startup_name ?? "").trim();
  const valueProposition = (analysis.value_proposition ?? "").trim();
  if (!startupName || !valueProposition) return null;

  return {
    replyId: reply.id,
    authorId: reply.author_id,
    username: reply.author_username,
    replyText: body,
    startupName,
    valueProposition,
    appreciationClause: heuristicAppreciationClause(valueProposition),
    confidence,
    sourcePostId: sourcePost.id,
    sourcePostText: sourcePost.text,
  };
}

async function sendDirectMessage(
  config: AgentConfig,
  participantId: string,
  text: string,
): Promise<{ dm_conversation_id: string; dm_event_id: string }> {
  const result = await xRequest<{ data: { dm_conversation_id: string; dm_event_id: string } }>(
    config.userAccessToken,
    `https://api.x.com/2/dm_conversations/with/${participantId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
  return result.data;
}

async function createQuotePost(
  config: AgentConfig,
  quoteTweetId: string,
  text: string,
): Promise<string> {
  const result = await xRequest<{ data: { id: string } }>(config.userAccessToken, "https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, quote_tweet_id: quoteTweetId }),
  });
  return result.data.id;
}

function recordInteraction(
  state: AgentState,
  lead: FounderLead,
  message: string,
  mode: InteractionRecord["mode"],
  status: InteractionRecord["status"],
  extra: Partial<InteractionRecord> = {},
): void {
  state.interactions.push({
    id: `${lead.replyId}:${lead.authorId}`,
    username: lead.username,
    authorId: lead.authorId,
    replyId: lead.replyId,
    sourcePostId: lead.sourcePostId,
    startupName: lead.startupName,
    valueProposition: lead.valueProposition,
    confidence: lead.confidence,
    message,
    mode,
    status,
    createdAt: new Date().toISOString(),
    ...extra,
  });
}

async function maybeSendDm(
  config: AgentConfig,
  lead: FounderLead,
  message: string,
): Promise<{ status: InteractionRecord["status"]; error?: string; dmConversationId?: string; dmEventId?: string }> {
  if (config.dryRun || !config.enableDm) {
    return { status: "would_send" };
  }

  try {
    const dm = await sendDirectMessage(config, lead.authorId, message);
    return {
      status: "dm_sent",
      dmConversationId: dm.dm_conversation_id,
      dmEventId: dm.dm_event_id,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function run(config: AgentConfig): Promise<number> {
  const state = await loadState(config.statePath);
  const messaged = new Set(state.messagedUserIds);
  let leadsHandled = 0;
  let dmsSent = 0;

  console.log("X founder outreach agent");
  console.log(`  dry_run=${config.dryRun} enable_dm=${config.enableDm} enable_quote=${config.enableQuote}`);
  console.log(`  max_per_run=${config.maxPerRun}`);
  console.log(`  max_replies_to_scan=${config.maxRepliesToScan}`);
  console.log(`  previously messaged accounts: ${messaged.size}`);

  for (const postId of config.postIds) {
    if (leadsHandled >= config.maxPerRun) break;

    const sourcePost = await fetchSourcePost(config, postId);
    console.log(`\nPost ${postId}: ${sourcePost.text.slice(0, 120)}${sourcePost.text.length > 120 ? "…" : ""}`);

    let scanned = 0;

    for await (const reply of streamConversationReplies(config, postId)) {
      scanned += 1;
      if (leadsHandled >= config.maxPerRun) break;
      if (!reply.text?.trim() || !looksLikeStartupReply(reply.text)) continue;
      if (!reply.author_id || messaged.has(reply.author_id)) continue;

      const analysis = await analyzeReply(config, reply, sourcePost);
      if (!analysis) continue;

      const confidence = Number(analysis.confidence ?? 0);
      if (confidence < config.minConfidence) continue;

      const lead = buildLead(reply, sourcePost, messaged, analysis);
      if (!lead) continue;

      lead.appreciationClause = await polishAppreciationClause(config, lead);
      const message = formatOutreachMessage(lead.appreciationClause, lead.startupName);

      console.log("");
      console.log(`Lead: @${lead.username} — ${lead.startupName} (${lead.confidence.toFixed(2)})`);
      console.log(`Value prop: ${lead.valueProposition}`);
      console.log(`Appreciation: ${lead.appreciationClause}`);
      console.log(`Message:\n${message}`);

      const dmResult = await maybeSendDm(config, lead, message);
      const mode: InteractionRecord["mode"] = config.dryRun || !config.enableDm ? "dry-run" : "live";

      recordInteraction(state, lead, message, mode, dmResult.status, {
        dmConversationId: dmResult.dmConversationId,
        dmEventId: dmResult.dmEventId,
        error: dmResult.error,
      });
      await saveState(config.statePath, state);
      leadsHandled += 1;

      if (dmResult.status === "dm_sent") {
        dmsSent += 1;
        messaged.add(lead.authorId);
        if (config.sendDelayMs) await sleep(config.sendDelayMs);
      } else if (dmResult.status === "failed") {
        console.log(`Failed @${lead.username}: ${dmResult.error}`);
        if (dmResult.error && isDmAuthError(dmResult.error)) {
          throw new Error(
            `${dmResult.error}\n\n` +
              "Fix X_USER_ACCESS_TOKEN: use OAuth 2.0 user access token from developer.x.com → OAuth 2.0 Keys → Generate. " +
              "Do not use Bearer Token, Client ID, or Client Secret.",
          );
        }
      }

      if (config.enableQuote && !config.dryRun) {
        try {
          const quoteId = await createQuotePost(config, lead.replyId, message);
          console.log(`Quote posted: ${quoteId}`);
        } catch (error) {
          console.warn(
            `Quote failed for @${lead.username}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }

    console.log(
      `Scanned ${scanned} repl${scanned === 1 ? "y" : "ies"}${leadsHandled >= config.maxPerRun ? " (stopped after reaching max_per_run)" : ""}.`,
    );
  }

  console.log("");
  console.log(
    `Done. ${config.dryRun || !config.enableDm ? `Would contact ${leadsHandled}` : `Sent ${dmsSent}`} founder(s) (${leadsHandled} lead(s) processed). State: ${config.statePath}`,
  );
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  loadRepoEnv();
  const postInput = process.argv[2];

  try {
    const config = readConfig(postInput);
    const exitCode = await run(config);
    process.exit(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
