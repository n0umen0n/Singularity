import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Env = NodeJS.ProcessEnv;

type AgentConfig = {
  bearerToken: string;
  userAccessToken: string;
  postIds: string[];
  dryRun: boolean;
  statePath: string;
  maxRepliesPerPost: number;
  maxPostsPerRun: number;
  minScore: number;
  requestDelayMs: number;
  replyDelayMs: number;
  siteTimeoutMs: number;
  missionProvider: "heuristic" | "openai-compatible";
  missionApiKey?: string;
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
  referenced_tweets?: Array<{ type: string; id: string }>;
  entities?: {
    urls?: Array<{
      expanded_url?: string;
      display_url?: string;
      url?: string;
      title?: string;
      description?: string;
    }>;
    mentions?: Array<{ username?: string; id?: string }>;
  };
};

type XSearchResponse = {
  data?: XPost[];
  includes?: {
    users?: Array<{ id: string; username: string; name?: string; description?: string }>;
  };
  meta?: { next_token?: string; result_count?: number };
  errors?: unknown[];
};

type AgentState = {
  repliedToPostIds: string[];
  skippedPostIds: string[];
  interactions: InteractionRecord[];
};

type InteractionRecord = {
  id: string;
  sourcePostId: string;
  commentId: string;
  commentText: string;
  authorDescription?: string;
  projectName?: string;
  projectWebsiteUrl?: string;
  mission?: string;
  missionConfidence?: "specific" | "fallback";
  replyText?: string;
  score?: number;
  reasons?: string[];
  mode: "dry-run" | "posted" | "skipped";
  status: "would_post" | "posted" | "skipped_not_relevant" | "failed";
  createdAt: string;
  xReplyPostId?: string;
  error?: string;
};

type Candidate = {
  post: XPost;
  score: number;
  projectName: string;
  websiteUrl?: string;
  mission: string;
  missionConfidence: "specific" | "fallback";
  replyText: string;
  reasons: string[];
};

type MissionResult = {
  text: string;
  confidence: "specific" | "fallback";
};

const SOLANA_TERMS = [
  "solana",
  "spl",
  "anchor",
  "phantom",
  "jupiter",
  "metaplex",
  "pump.fun",
  "raydium",
  "helius",
  "solscan",
  "bonk",
  "drift",
  "orca",
  "backpack",
];

const FUNDRAISING_WORDS = ["building", "project", "protocol", "startup", "app", "dapp", "platform", "mission", "launching"];

async function main() {
  const config = readConfig(process.env);
  const state = await loadState(config.statePath);

  console.log(`X reply agent starting with ${config.postIds.length} source post(s). dryRun=${config.dryRun}`);

  let postedThisRun = 0;
  const inspectedReplies = new Set<string>();

  for (const postId of config.postIds) {
    if (postedThisRun >= config.maxPostsPerRun) break;

    console.log(`Fetching replies for conversation ${postId}...`);
    const replies = await fetchConversationReplies(config, postId);
    console.log(`Found ${replies.length} reply candidate(s).`);

    for (const reply of replies) {
      if (postedThisRun >= config.maxPostsPerRun) break;
      if (inspectedReplies.has(reply.id)) continue;
      inspectedReplies.add(reply.id);

      if (hasPostedInteraction(state, reply.id)) {
        continue;
      }

      const candidate = await buildCandidate(config, reply);

      if (!candidate) {
        state.skippedPostIds.push(reply.id);
        upsertInteraction(state, {
          id: makeInteractionId(postId, reply.id, "skipped"),
          sourcePostId: postId,
          commentId: reply.id,
          commentText: reply.text,
        authorDescription: reply.author_description,
          mode: "skipped",
          status: "skipped_not_relevant",
          createdAt: new Date().toISOString(),
        });
        await saveState(config.statePath, state);
        continue;
      }

      console.log(`Matched @${candidate.projectName} on reply ${reply.id} with score ${candidate.score}: ${candidate.reasons.join(", ")}`);
      console.log(candidate.replyText);

      let xReplyPostId: string | undefined;
      if (!config.dryRun) {
        const response = await createReply(config, reply.id, candidate.replyText);
        xReplyPostId = response.data.id;
        await sleep(config.replyDelayMs);
      }

      if (!state.repliedToPostIds.includes(reply.id)) {
        state.repliedToPostIds.push(reply.id);
      }
      upsertInteraction(state, {
        id: makeInteractionId(postId, reply.id, config.dryRun ? "dry-run" : "posted"),
        sourcePostId: postId,
        commentId: reply.id,
        commentText: reply.text,
        authorDescription: reply.author_description,
        projectName: candidate.projectName,
        projectWebsiteUrl: candidate.websiteUrl,
        mission: candidate.mission,
        missionConfidence: candidate.missionConfidence,
        replyText: candidate.replyText,
        score: candidate.score,
        reasons: candidate.reasons,
        mode: config.dryRun ? "dry-run" : "posted",
        status: config.dryRun ? "would_post" : "posted",
        createdAt: new Date().toISOString(),
        xReplyPostId,
      });
      await saveState(config.statePath, state);
      postedThisRun += 1;
    }
  }

  console.log(`Done. ${config.dryRun ? "Would have posted" : "Posted"} ${postedThisRun} reply/replies.`);
}

function readConfig(env: Env): AgentConfig {
  const bearerToken = requiredEnv(env, "X_BEARER_TOKEN");
  const userAccessToken = requiredEnv(env, "X_USER_ACCESS_TOKEN");
  const postIds = csv(env.X_REPLY_SOURCE_POST_IDS);

  if (postIds.length === 0) {
    throw new Error("Set X_REPLY_SOURCE_POST_IDS to one or more comma-separated X post IDs.");
  }

  return {
    bearerToken,
    userAccessToken,
    postIds,
    dryRun: env.X_REPLY_DRY_RUN !== "false",
    statePath: resolveStatePath(env.X_REPLY_STATE_PATH ?? ".singularity/x-reply-agent-state.json"),
    maxRepliesPerPost: positiveInt(env.X_REPLY_MAX_REPLIES_PER_POST, 100),
    maxPostsPerRun: positiveInt(env.X_REPLY_MAX_POSTS_PER_RUN, 5),
    minScore: positiveInt(env.X_REPLY_MIN_SCORE, 4),
    requestDelayMs: positiveInt(env.X_REPLY_REQUEST_DELAY_MS, 1_000),
    replyDelayMs: positiveInt(env.X_REPLY_POST_DELAY_MS, 15_000),
    siteTimeoutMs: positiveInt(env.X_REPLY_SITE_TIMEOUT_MS, 7_000),
    missionProvider: env.X_REPLY_MISSION_PROVIDER === "openai-compatible" ? "openai-compatible" : "heuristic",
    missionApiKey: env.X_REPLY_MISSION_API_KEY,
    missionApiBaseUrl: env.X_REPLY_MISSION_API_BASE_URL ?? "https://api.openai.com/v1",
    missionModel: env.X_REPLY_MISSION_MODEL ?? "gpt-4o-mini",
  };
}

async function fetchConversationReplies(config: AgentConfig, conversationId: string): Promise<XPost[]> {
  const replies: XPost[] = [];
  let nextToken: string | undefined;

  while (replies.length < config.maxRepliesPerPost) {
    const remaining = config.maxRepliesPerPost - replies.length;
    const params = new URLSearchParams({
      query: `conversation_id:${conversationId} -is:retweet`,
      max_results: String(Math.min(100, Math.max(10, remaining))),
      "tweet.fields": "author_id,conversation_id,created_at,entities,referenced_tweets",
      expansions: "author_id",
      "user.fields": "description,name,username,url",
    });

    if (nextToken) params.set("next_token", nextToken);

    const url = `https://api.x.com/2/tweets/search/recent?${params.toString()}`;
    const data = await xRequest<XSearchResponse>(config.bearerToken, url, { method: "GET" });

    const usersById = new Map((data.includes?.users ?? []).map((user) => [user.id, user]));
    const pageReplies = (data.data ?? [])
      .filter((post) => post.id !== conversationId)
      .map((post) => {
        const author = post.author_id ? usersById.get(post.author_id) : undefined;
        return author
          ? { ...post, author_username: author.username, author_name: author.name, author_description: author.description }
          : post;
      });
    replies.push(...pageReplies.slice(0, remaining));
    nextToken = data.meta?.next_token;

    if (!nextToken) break;
    await sleep(config.requestDelayMs);
  }

  return replies;
}

async function buildCandidate(config: AgentConfig, post: XPost): Promise<Candidate | null> {
  const score = scoreReply(post);

  const websiteUrl = getBestWebsiteUrl(post);
  const website = websiteUrl ? await fetchWebsiteSummary(websiteUrl, config.siteTimeoutMs) : null;
  const projectName = inferProjectName(post, website);

  if (!projectName) {
    return null;
  }

  const mission = await inferMission(config, {
    projectName,
    postText: post.text,
    authorDescription: post.author_description,
    siteTitle: website?.title,
    siteDescription: website?.description,
    siteText: website?.text,
  });

  const replyText = formatReply(projectName, mission);

  return {
    post,
    score: score.value,
    projectName,
    websiteUrl,
    mission: mission.text,
    missionConfidence: mission.confidence,
    replyText,
    reasons: score.reasons,
  };
}

function scoreReply(post: XPost): { value: number; reasons: string[] } {
  const text = normalize(post.text);
  const reasons: string[] = [];
  let value = 0;

  for (const term of SOLANA_TERMS) {
    if (text.includes(term)) {
      value += term === "solana" ? 3 : 2;
      reasons.push(`mentions ${term}`);
    }
  }

  for (const word of FUNDRAISING_WORDS) {
    if (text.includes(word)) {
      value += 1;
      reasons.push(`mentions ${word}`);
      break;
    }
  }

  if (post.entities?.urls?.some((url) => isLikelyProjectUrl(url.expanded_url ?? url.url ?? ""))) {
    value += 2;
    reasons.push("includes project URL");
  }

  if (/\$[a-z0-9]{2,12}\b/i.test(post.text)) {
    value += 1;
    reasons.push("mentions ticker");
  }

  return { value, reasons };
}

function getBestWebsiteUrl(post: XPost): string | undefined {
  const urls = post.entities?.urls ?? [];
  const expandedUrls = urls.map((url) => url.expanded_url ?? url.url).filter((url): url is string => Boolean(url));
  return expandedUrls.find(isLikelyProjectUrl) ?? expandedUrls[0];
}

function isLikelyProjectUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
    return ![
      "x.com",
      "twitter.com",
      "t.co",
      "solscan.io",
      "birdeye.so",
      "dexscreener.com",
      "github.com",
      "docs.google.com",
      "medium.com",
      "mirror.xyz",
    ].includes(hostname);
  } catch {
    return false;
  }
}

async function fetchWebsiteSummary(rawUrl: string, timeoutMs: number) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "SingularityReplyAgent/0.1 (+https://singularity.diy)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    return {
      url: rawUrl,
      title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      description:
        firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
        firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i),
      text: htmlToText(html).slice(0, 2_000),
    };
  } catch {
    return null;
  }
}

function inferProjectName(post: XPost, website: Awaited<ReturnType<typeof fetchWebsiteSummary>>): string | null {
  const cashtag = post.text.match(/\$([A-Z0-9]{2,12})\b/);
  if (cashtag) return cashtag[1];

  if (website?.title) {
    const title = website.title.split(/[|–-]/)[0]?.trim();
    if (title && title.length <= 40 && !isWeakProjectName(title)) return cleanProjectName(title);
  }

  const explicitName =
    post.text.match(/\b(?:building|launching|introducing|meet)\s+([A-Z][A-Za-z0-9._-]{2,30})/)?.[1] ??
    post.text.match(/\b([A-Z][A-Za-z0-9._-]{2,30})\s+(?:is|builds|lets|helps|enables)\b/)?.[1];

  if (explicitName && !isWeakProjectName(explicitName)) {
    return cleanProjectName(explicitName);
  }

  const mention = post.entities?.mentions?.find((item) => item.username && !isWeakProjectName(item.username))?.username;
  if (mention && !isWeakProjectName(mention)) return cleanProjectName(mention);

  if (post.author_username && !isWeakProjectName(post.author_username)) return cleanProjectName(post.author_username);
  if (post.author_name && !isWeakProjectName(post.author_name)) return cleanProjectName(post.author_name);

  return "this project";
}

function isWeakProjectName(input: string): boolean {
  const normalized = input.toLowerCase().replace(/^@/, "").trim();
  return ["solana", "solana_devs", "the", "this", "that", "our", "we", "i"].includes(normalized);
}

async function inferMission(
  config: AgentConfig,
  input: { projectName: string; postText: string; authorDescription?: string; siteTitle?: string; siteDescription?: string; siteText?: string },
): Promise<MissionResult> {
  if (config.missionProvider === "openai-compatible" && config.missionApiKey) {
    const mission = await inferMissionWithOpenAiCompatible(config, input).catch(() => null);
    const cleaned = mission ? normalizeMissionPhrase(cleanMission(mission)) : "";
    if (isSpecificMission(cleaned, input.projectName)) {
      return { text: cleaned, confidence: "specific" };
    }
  }

  return heuristicMission(input);
}

async function inferMissionWithOpenAiCompatible(
  config: AgentConfig,
  input: { projectName: string; postText: string; authorDescription?: string; siteTitle?: string; siteDescription?: string; siteText?: string },
): Promise<string | null> {
  const response = await fetch(`${config.missionApiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.missionApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.missionModel,
      messages: [
        {
          role: "system",
          content:
            "Extract a subtle, concrete project mission phrase from noisy social and website text. Return only the phrase, lower-case unless a proper noun is needed, 4 to 9 words, no punctuation. Avoid slogans, exact technical mechanisms, token tickers, X handles, and vague phrases like build something meaningful.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const mission = data.choices?.[0]?.message?.content?.trim();
  return mission ? mission.replace(/^["']|["']$/g, "").slice(0, 120) : null;
}

function heuristicMission(input: {
  projectName: string;
  postText: string;
  authorDescription?: string;
  siteTitle?: string;
  siteDescription?: string;
  siteText?: string;
}): MissionResult {
  const source = [input.authorDescription, input.siteDescription, input.siteText, input.postText].filter(Boolean).join(" ");
  const sentence = source
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .find((part) => /\b(build|help|enable|create|connect|bring|make|fund|launch|power|provide|track|verify)\w*\b/i.test(part));

  const cleaned = normalizeMissionPhrase(cleanMission(sentence ?? input.siteDescription ?? input.siteTitle ?? input.postText));
  if (isSpecificMission(cleaned, input.projectName)) {
    return { text: cleaned, confidence: "specific" };
  }

  return { text: fallbackMission(source), confidence: "fallback" };
}

function isSpecificMission(mission: string, projectName: string): boolean {
  const words = mission.split(/\s+/).filter(Boolean);
  const normalized = mission.toLowerCase();
  const normalizedProject = projectName.toLowerCase();

  if (words.length < 4 || words.length > 12) return false;
  if (normalized.includes("@")) return false;
  if (normalized.includes(normalizedProject)) return false;
  if (/\b(build something meaningful|missing credit layer|own the world|one click|from 1 sol|utility token|what'?s|sir)\b/i.test(mission)) {
    return false;
  }
  if (/^https?:\/\//i.test(mission)) return false;

  return true;
}

function normalizeMissionPhrase(mission: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/^tracking\b/i, "track"],
    [/^building\b/i, "build"],
    [/^helping\b/i, "help"],
    [/^enabling\b/i, "enable"],
    [/^creating\b/i, "create"],
    [/^connecting\b/i, "connect"],
    [/^making\b/i, "make"],
    [/^funding\b/i, "fund"],
    [/^launching\b/i, "launch"],
    [/^powering\b/i, "power"],
    [/^providing\b/i, "provide"],
    [/^verifying\b/i, "verify"],
    [/^understanding\b/i, "understand"],
    [/^on-chain mortgage loan\b/i, "provide onchain mortgage loans"],
    [/^on-chain proof surface\b/i, "make onchain proofs clearer"],
    [/^a field guide to\b/i, "make"],
    [/^private payroll\b/i, "make payroll more private"],
  ];

  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), mission);
}

function fallbackMission(input: string): string {
  const source = input.toLowerCase();

  if (/\b(game|gaming|play|player|collectible)\b/.test(source)) return "a stronger web3 gaming community";
  if (/\b(rwa|real estate|mortgage|loan|credit|tokenized asset|tokenized real estate)\b/.test(source)) {
    return "better financing for tokenized real estate";
  }
  if (/\b(pay|payment|payroll|invoice|checkout|subscription)\b/.test(source)) return "simpler crypto payment flows";
  if (/\b(wallet|identity|auth|login|key|custody)\b/.test(source)) return "better user ownership tools";
  if (/\b(data|analytics|dashboard|index|explorer|insight)\b/.test(source)) return "clearer onchain data tools";
  if (/\b(dev|developer|sdk|api|tooling|infrastructure)\b/.test(source)) return "better Solana developer tooling";
  if (/\b(defi|swap|trade|trading|liquidity|yield|market)\b/.test(source)) return "better onchain market access";

  return "something useful for Solana users";
}

function formatReply(projectName: string, mission: MissionResult): string {
  if (mission.confidence === "fallback") {
    return `If the mission is building ${mission.text}, it is possible to raise funds via Singularity.`;
  }

  const prefix = startsWithVerb(mission.text) ? "is to" : "is";
  return `If the mission ${prefix} ${mission.text}, it is possible to raise funds via Singularity.`;
}

function startsWithVerb(input: string): boolean {
  return /^(track|build|help|enable|create|connect|make|fund|launch|power|provide|verify|understand|inspect|decode|grow|improve|simplify)\b/i.test(
    input,
  );
}

async function createReply(config: AgentConfig, inReplyToTweetId: string, text: string): Promise<{ data: { id: string; text: string } }> {
  return xRequest(config.userAccessToken, "https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      reply: { in_reply_to_tweet_id: inReplyToTweetId },
    }),
  });
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

async function loadState(statePath: string): Promise<AgentState> {
  try {
    const data = JSON.parse(await readFile(statePath, "utf8")) as Partial<AgentState>;
    return {
      repliedToPostIds: Array.isArray(data.repliedToPostIds) ? data.repliedToPostIds : [],
      skippedPostIds: Array.isArray(data.skippedPostIds) ? data.skippedPostIds : [],
      interactions: Array.isArray(data.interactions) ? data.interactions : [],
    };
  } catch {
    return { repliedToPostIds: [], skippedPostIds: [], interactions: [] };
  }
}

async function saveState(statePath: string, state: AgentState) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function hasPostedInteraction(state: AgentState, commentId: string): boolean {
  return state.interactions.some((interaction) => interaction.commentId === commentId && interaction.status === "posted");
}

function upsertInteraction(state: AgentState, interaction: InteractionRecord) {
  const existingIndex = state.interactions.findIndex((record) => record.id === interaction.id);

  if (existingIndex >= 0) {
    state.interactions[existingIndex] = interaction;
    return;
  }

  state.interactions.push(interaction);
}

function makeInteractionId(sourcePostId: string, commentId: string, mode: InteractionRecord["mode"]): string {
  return `${sourcePostId}:${commentId}:${mode}`;
}

function firstMatch(input: string, pattern: RegExp): string | undefined {
  const match = input.match(pattern)?.[1];
  return match ? decodeHtml(match.trim()) : undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanProjectName(input: string): string {
  return input.replace(/^@/, "").replace(/[^\w .-]/g, "").trim();
}

function cleanMission(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s.?!]+$/g, "")
    .replace(/\b(we|our team|this project)\b/gi, "they")
    .slice(0, 110)
    .trim()
    .toLowerCase();
}

function normalize(input: string): string {
  return input.toLowerCase();
}

function csv(input?: string): string[] {
  return (input ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function requiredEnv(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function resolveStatePath(statePath: string): string {
  return path.isAbsolute(statePath) ? statePath : path.join(REPO_ROOT, statePath);
}

function positiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
