import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { authMessage, verifySolanaSignature } from "@/lib/backend/auth";
import { assertProductionStorage, storageMode } from "@/lib/backend/env";
import {
  backendHealthFromPostgres,
  confirmMissionLaunchInPostgres,
  createAuthNonceInPostgres,
  executeFundingRequestInPostgres,
  getMissionByIdFromPostgres,
  getProfileFromPostgres,
  listMissionsFromPostgres,
  prepareCouncilCheckpointInPostgres,
  prepareFundingRequestInPostgres,
  prepareMissionGraduationInPostgres,
  prepareMissionLaunchInPostgres,
  quoteMissionTradeFromPostgres,
  registerCouncilCandidateInPostgres,
  updateProfileInPostgres,
  verifyAuthInPostgres,
  voteFundingRequestInPostgres,
} from "@/lib/backend/postgres-store";
import {
  prepareCandidateRegistrationTransaction,
  prepareCouncilExecuteTransaction,
  prepareFinalizeEpochCouncilTransaction,
  prepareCouncilVoteTransaction,
  prepareFundingRequestTransaction,
  prepareJupiterTradeTransaction,
  prepareLaunchTransaction,
  prepareMissionGraduationTransaction,
} from "@/lib/backend/transactions";
import { currentUser, missions, type FundingRequest, type Mission, type RequestStatus } from "@/lib/mock-data";

type PreparedTransaction = {
  kind: string;
  status: "not_configured" | "ready";
  message: string;
  instructions: unknown[];
};

type StoredNonce = {
  nonce: string;
  address?: string;
  expiresAt: string;
};

type FundingRequestVote = {
  requestId: string;
  wallet: string;
  vote: "approve" | "reject";
  createdAt: string;
};

type BackendState = {
  missions: Mission[];
  currentUser: typeof currentUser;
  nonces: StoredNonce[];
  fundingRequestVotes: FundingRequestVote[];
  metadataUploads: Array<{
    hash: string;
    uri: string;
    ownerWallet: string;
    contentType: string;
    createdAt: string;
  }>;
};

export type MissionSort = "highest-liquidity" | "newest" | "most-holders";

const defaultDataPath = path.join(process.cwd(), ".singularity", "backend-db.json");

function dataPath() {
  return process.env.SINGULARITY_DATA_PATH || defaultDataPath;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function initialState(): BackendState {
  return {
    missions: clone(missions),
    currentUser: clone(currentUser),
    nonces: [],
    fundingRequestVotes: [],
    metadataUploads: [],
  };
}

async function readState(): Promise<BackendState> {
  assertProductionStorage();
  const filePath = dataPath();

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as BackendState;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;

    const state = initialState();
    await writeState(state);
    return state;
  }
}

async function writeState(state: BackendState) {
  const filePath = dataPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function updateState<T>(mutate: (state: BackendState) => T | Promise<T>) {
  const state = await readState();
  const result = await mutate(state);
  await writeState(state);
  return result;
}

function contentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug || `mission-${randomBytes(3).toString("hex")}`;
}

function expiry(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function placeholderTransaction(kind: string): PreparedTransaction {
  return {
    kind,
    status: "not_configured",
    message: "Solana transaction builders are not configured yet. Configure program IDs and RPC/indexer providers before enabling signed transactions.",
    instructions: [],
  };
}

function findMissionOrThrow(state: BackendState, missionId: string) {
  const mission = state.missions.find((entry) => entry.id === missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);
  return mission;
}

function findRequestOrThrow(state: BackendState, requestId: string) {
  for (const mission of state.missions) {
    const request = mission.requests.find((entry) => entry.id === requestId);
    if (request) return { mission, request };
  }

  throw new Error(`Funding request not found: ${requestId}`);
}

export async function listMissions(options: { q?: string; sort?: MissionSort }) {
  if (storageMode() === "postgres") return listMissionsFromPostgres(options);

  const state = await readState();
  const query = options.q?.trim().toLowerCase();
  const filtered = query
    ? state.missions.filter(
        (mission) =>
          mission.statement.toLowerCase().includes(query) ||
          mission.description.toLowerCase().includes(query) ||
          mission.tokenSymbol.toLowerCase().includes(query),
      )
    : [...state.missions];

  if (options.sort === "most-holders") filtered.sort((a, b) => b.holders - a.holders);
  else filtered.sort((a, b) => b.liquidity - a.liquidity);

  return filtered;
}

export async function getMissionById(missionId: string) {
  if (storageMode() === "postgres") return getMissionByIdFromPostgres(missionId);

  const state = await readState();
  return state.missions.find((mission) => mission.id === missionId) ?? null;
}

export async function getProfile(address: string) {
  if (storageMode() === "postgres") return getProfileFromPostgres(address);

  const state = await readState();
  const normalized = address.toLowerCase();
  const isCurrentUser = state.currentUser.address.toLowerCase() === normalized || address === "me";
  const user = isCurrentUser ? state.currentUser : { ...state.currentUser, address };

  const tokenBalances = user.tokenBalances.map((entry) => ({
    ...entry,
    mission: state.missions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const createdMissions = user.createdMissions.map((entry) => ({
    ...entry,
    mission: state.missions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const councilMissionIds = new Set(user.tokenBalances.filter((entry) => entry.council).map((entry) => entry.missionId));
  const submittedRequests = state.missions.flatMap((mission) =>
    mission.requests.slice(0, 1).map((request) => ({
      request: { ...request, requester: user.name, requesterAvatar: user.avatar },
      symbol: mission.tokenSymbol,
    })),
  );
  const councilRequests = state.missions.flatMap((mission) =>
    councilMissionIds.has(mission.id)
      ? mission.requests
          .filter((request) => request.status === "active")
          .map((request) => ({
            request,
            symbol: mission.tokenSymbol,
          }))
      : [],
  );

  return { ...user, tokenBalances, createdMissions, submittedRequests, councilRequests };
}

export async function updateProfile(input: { address: string; name?: string; description?: string; avatar?: string; socials?: string[] }) {
  if (storageMode() === "postgres") return updateProfileInPostgres(input);

  return updateState(async (state) => {
    state.currentUser = {
      ...state.currentUser,
      address: input.address,
      name: input.name ?? state.currentUser.name,
      description: input.description ?? state.currentUser.description,
      avatar: input.avatar ?? state.currentUser.avatar,
      socials: input.socials ?? state.currentUser.socials,
    };

    return state.currentUser;
  });
}

export async function prepareMissionLaunch(input: {
  creatorWallet?: string;
  statement?: string;
  description?: string;
  tokenSymbol?: string;
  missionImage?: string;
  tokenImage?: string;
  initialPurchaseUsdc?: number;
}) {
  if (storageMode() === "postgres") return prepareMissionLaunchInPostgres(input);

  return updateState(async (state) => {
    const statement = input.statement?.trim();
    const description = input.description?.trim();
    const tokenSymbol = input.tokenSymbol?.trim().toUpperCase();
    if (!statement || statement.length > 96) throw new Error("Mission statement is required and must be 96 characters or fewer.");
    if (!description || description.length > 1200) throw new Error("Mission description is required and must be 1200 characters or fewer.");
    if (!tokenSymbol || !/^[A-Z0-9]{2,8}$/.test(tokenSymbol)) throw new Error("Token symbol must be 2-8 uppercase letters or numbers.");

    const idBase = slugify(statement);
    const id = state.missions.some((mission) => mission.id === idBase) ? `${idBase}-${randomBytes(2).toString("hex")}` : idBase;
    const metadata = {
      name: statement,
      symbol: tokenSymbol,
      description,
      image: input.missionImage,
      properties: { category: "mission-token", platform: "Singularity" },
    };
    const hash = contentHash(metadata);
    const seed = state.missions[0];
    const mission: Mission = {
      ...seed,
      id,
      statement,
      description,
      image: input.missionImage || seed.image,
      tokenImage: input.tokenImage || seed.tokenImage,
      tokenSymbol,
      tokenPrice: 0.01,
      holders: 1,
      liquidity: Number(input.initialPurchaseUsdc || 0),
      treasuryUsdc: 0,
      treasuryTokens: 10_000_000,
      totalSupply: 50_000_000,
      council: [],
      requests: [],
    };

    state.missions.unshift(mission);
    state.metadataUploads.push({
      hash,
      uri: `local://metadata/${hash}.json`,
      ownerWallet: input.creatorWallet || state.currentUser.address,
      contentType: "application/json",
      createdAt: new Date().toISOString(),
    });

    const metadataUri = `local://metadata/${hash}.json`;
    const transaction = await prepareLaunchTransaction({
      creatorWallet: input.creatorWallet,
      missionId: mission.id,
      metadataHash: hash,
      metadataUri,
      tokenName: statement,
      tokenSymbol,
      totalSupply: mission.totalSupply,
      initialPurchaseUsdc: input.initialPurchaseUsdc,
    });

    return {
      mission,
      metadataHash: hash,
      metadataUri,
      transaction,
    };
  });
}

export async function confirmMissionLaunch(input: { launchId?: string; signature?: string; wallet?: string }) {
  if (storageMode() === "postgres") return confirmMissionLaunchInPostgres(input);
  if (!input.launchId) throw new Error("launchId is required.");
  const state = await readState();
  const mission = state.missions.find((entry) => entry.id === input.launchId);
  if (!mission) throw new Error(`Mission not found: ${input.launchId}`);
  return { mission };
}

export async function quoteMissionTrade(missionId: string, input: { side?: string; amount?: number; wallet?: string; slippageBps?: number }) {
  if (storageMode() === "postgres") return quoteMissionTradeFromPostgres(missionId, input);

  const state = await readState();
  const mission = findMissionOrThrow(state, missionId);
  const amount = Math.max(Number(input.amount) || 0, 0);
  const side = input.side === "sell" ? "sell" : "buy";
  const estimatedOutput = side === "buy" ? amount / mission.tokenPrice : amount * mission.tokenPrice;
  const chainQuote = mission.tokenMint
    ? await prepareJupiterTradeTransaction({
        wallet: input.wallet,
        side,
        amount,
        tokenMint: mission.tokenMint,
        slippageBps: input.slippageBps,
      })
    : undefined;

  return {
    missionId,
    side,
    route: chainQuote && "route" in chainQuote ? chainQuote.route : mission.lifecycle === "graduated" ? "amm" : "bonding-curve",
    inputAmount: amount,
    estimatedOutput: chainQuote && "estimatedOutput" in chainQuote ? chainQuote.estimatedOutput : estimatedOutput,
    priceImpactPercent: chainQuote && "priceImpactPercent" in chainQuote ? chainQuote.priceImpactPercent : 0.42,
    market: {
      lifecycle: mission.lifecycle || "draft",
      tokenMint: mission.tokenMint || null,
      dbcPool: mission.dbcPool || null,
      dammPool: mission.dammPool || null,
    },
    transaction: chainQuote && "transaction" in chainQuote ? chainQuote.transaction : placeholderTransaction("trade"),
  };
}

export async function prepareMissionGraduation(
  missionId: string,
  input: {
    authorityWallet?: string;
    dammPool?: string;
  },
) {
  if (storageMode() === "postgres") return prepareMissionGraduationInPostgres(missionId, input);

  return updateState(async (state) => {
    const mission = findMissionOrThrow(state, missionId);
    if (!input.dammPool) throw new Error("dammPool is required.");
    mission.dammPool = input.dammPool;
    mission.lifecycle = "graduated";

    return {
      mission,
      transaction: await prepareMissionGraduationTransaction({
        authorityWallet: input.authorityWallet || state.currentUser.address,
        missionId,
        dammPool: input.dammPool,
      }),
    };
  });
}

export async function prepareFundingRequest(input: {
  missionId?: string;
  requesterWallet?: string;
  requesterName?: string;
  requesterAvatar?: string;
  name?: string;
  description?: string;
  amountUsd?: number;
}) {
  if (storageMode() === "postgres") return prepareFundingRequestInPostgres(input);

  return updateState(async (state) => {
    if (!input.missionId) throw new Error("missionId is required.");
    const mission = findMissionOrThrow(state, input.missionId);
    const name = input.name?.trim();
    const description = input.description?.trim();
    const amountUsd = Math.max(Number(input.amountUsd) || 0, 0);
    if (!name) throw new Error("Request name is required.");
    if (!description) throw new Error("Request description is required.");
    if (amountUsd <= 0) throw new Error("Request amount must be greater than zero.");

    const request: FundingRequest = {
      id: `${mission.id}-r${mission.requests.length + 1}-${randomBytes(2).toString("hex")}`,
      missionId: mission.id,
      requester: input.requesterName || state.currentUser.name,
      requesterAvatar: input.requesterAvatar || state.currentUser.avatar,
      name,
      description,
      amountUsd,
      tokenAmount: amountUsd / mission.tokenPrice,
      approvals: 0,
      rejections: 0,
      timeLeft: "3d left",
      status: "active",
    };
    const metadataHash = contentHash({
      name,
      description,
      requested_token_amount: request.tokenAmount,
      estimated_amount_usdc: amountUsd,
      created_by: input.requesterWallet || state.currentUser.address,
    });

    mission.requests.unshift(request);

    return {
      request,
      metadataHash,
      transaction: await prepareFundingRequestTransaction({
        requesterWallet: input.requesterWallet,
        missionId: mission.id,
        requestId: request.id,
        metadataHash,
      }),
    };
  });
}

export async function voteFundingRequest(requestId: string, input: { wallet?: string; vote?: "approve" | "reject" }) {
  if (storageMode() === "postgres") return voteFundingRequestInPostgres(requestId, input);

  return updateState(async (state) => {
    const wallet = input.wallet || state.currentUser.address;
    const vote = input.vote;
    if (vote !== "approve" && vote !== "reject") throw new Error("vote must be approve or reject.");

    const existingVote = state.fundingRequestVotes.find((entry) => entry.requestId === requestId && entry.wallet === wallet);
    if (existingVote) throw new Error("This wallet has already voted on the request.");

    const { mission, request } = findRequestOrThrow(state, requestId);
    if (request.status !== "active") throw new Error("Only active funding requests can be voted on.");

    if (vote === "approve") request.approvals += 1;
    else request.rejections += 1;

    if (request.approvals >= 4) {
      request.status = "accepted";
      request.timeLeft = "Accepted";
    } else if (request.rejections >= 3) {
      request.status = "rejected";
      request.timeLeft = "Rejected";
    }

    state.fundingRequestVotes.push({ requestId, wallet, vote, createdAt: new Date().toISOString() });

    return {
      request,
      transaction: await prepareCouncilVoteTransaction({ wallet, missionId: mission.id, requestId, vote }),
    };
  });
}

export async function executeFundingRequest(
  requestId: string,
  input: {
    wallet?: string;
    requestAccount?: string;
    treasuryVault?: string;
    recipientTokenAccount?: string;
    mint?: string;
  } = {},
) {
  if (storageMode() === "postgres") return executeFundingRequestInPostgres(requestId, input);

  return updateState(async (state) => {
    const { mission, request } = findRequestOrThrow(state, requestId);
    if (request.status !== "accepted") throw new Error("Only accepted requests can be executed in local mode.");

    return {
      request,
      transaction: await prepareCouncilExecuteTransaction({
        wallet: input.wallet || state.currentUser.address,
        missionId: mission.id,
        requestId,
        requestAccount: input.requestAccount,
        treasuryVault: input.treasuryVault,
        recipientTokenAccount: input.recipientTokenAccount,
        mint: input.mint,
      }),
    };
  });
}

export async function createAuthNonce(address?: string) {
  if (storageMode() === "postgres") return createAuthNonceInPostgres(address);

  return updateState((state) => {
    const nonce: StoredNonce = {
      nonce: randomBytes(16).toString("hex"),
      address,
      expiresAt: expiry(10),
    };

    state.nonces = state.nonces.filter((entry) => new Date(entry.expiresAt).getTime() > Date.now());
    state.nonces.push(nonce);

    return {
      ...nonce,
      message: authMessage(nonce.nonce),
    };
  });
}

export async function verifyAuth(input: { address?: string; nonce?: string; signature?: string }) {
  if (storageMode() === "postgres") return verifyAuthInPostgres(input);

  return updateState((state) => {
    if (!input.address || !input.nonce || !input.signature) throw new Error("address, nonce, and signature are required.");

    const nonce = state.nonces.find((entry) => entry.nonce === input.nonce && (!entry.address || entry.address === input.address));
    if (!nonce || new Date(nonce.expiresAt).getTime() <= Date.now()) throw new Error("Nonce is invalid or expired.");
    if (!verifySolanaSignature({ address: input.address, nonce: input.nonce, signature: input.signature })) {
      throw new Error("Signature is invalid.");
    }

    state.nonces = state.nonces.filter((entry) => entry.nonce !== input.nonce);

    return {
      address: input.address,
      authenticated: true,
      sessionMode: "solana-signature",
    };
  });
}

export async function registerCouncilCandidate(input: { missionId?: string; wallet?: string; tokenAccounts?: string[] }) {
  if (storageMode() === "postgres") return registerCouncilCandidateInPostgres(input);

  const state = await readState();
  if (!input.missionId) throw new Error("missionId is required.");
  const mission = findMissionOrThrow(state, input.missionId);

  return {
    missionId: mission.id,
    wallet: input.wallet || state.currentUser.address,
    tokenAccounts: input.tokenAccounts || [],
    transaction: await prepareCandidateRegistrationTransaction({ wallet: input.wallet || state.currentUser.address, missionId: mission.id }),
  };
}

function councilEscrowAmounts(candidates: Array<{ tokens: number }>) {
  return candidates.slice(0, 6).map((candidate) => Math.max(Math.floor(candidate.tokens), 1));
}

export async function prepareCouncilCheckpoint(input: { missionId?: string; epoch?: number; authorityWallet?: string }) {
  if (storageMode() === "postgres") return prepareCouncilCheckpointInPostgres(input);

  const state = await readState();
  if (!input.missionId) throw new Error("missionId is required.");
  const mission = findMissionOrThrow(state, input.missionId);
  const epoch = input.epoch ?? 1;
  const candidates = mission.council.slice(0, 6);
  const escrowAmounts = councilEscrowAmounts(candidates);
  const members = candidates.map((candidate) => candidate.address);
  const metadataHash = contentHash({ missionId: mission.id, epoch, candidates, escrowAmounts });

  return {
    missionId: mission.id,
    epoch,
    candidates,
    escrowAmounts,
    metadataHash,
    transaction: await prepareFinalizeEpochCouncilTransaction({
      authorityWallet: input.authorityWallet || state.currentUser.address,
      missionId: mission.id,
      epoch,
      members,
      escrowAmounts,
    }),
  };
}

export async function backendHealth() {
  if (storageMode() === "postgres") return backendHealthFromPostgres();

  const state = await readState();
  return {
    ok: true,
    storage: process.env.SINGULARITY_DATA_PATH ? "file-custom" : "file-local",
    dataPath: dataPath(),
    missionCount: state.missions.length,
    generatedAt: new Date().toISOString(),
  };
}

export function isRequestStatus(value: string): value is RequestStatus {
  return value === "active" || value === "accepted" || value === "rejected" || value === "expired";
}
