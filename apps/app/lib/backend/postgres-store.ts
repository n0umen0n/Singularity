import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { DEFAULT_COUNCIL_PROGRAM_ID, DEFAULT_DBC_TOTAL_SUPPLY, DEFAULT_REGISTRY_PROGRAM_ID, requireProgramConfig, resolveMeteoraDbcLaunchConfig } from "@singularity/solana";
import { DEMO_CREATOR_WALLET, isDemoMissionCreator } from "@/lib/demo-missions";
import type { FundingRequest, Mission } from "@/lib/mock-data";
import { currentUser, missions as fixtureMissions, type RequestStatus } from "@/lib/mock-data";
import { authMessage, verifySolanaSignature } from "@/lib/backend/auth";
import { emptyWalletBalanceSnapshot, getWalletBalanceSnapshot } from "@/lib/backend/balances";
import { publishMissionTokenMetadata } from "@/lib/backend/mission-token-metadata";
import { validateMissionLaunchInput, resolveMissionLaunchConfig } from "@/lib/mission-launch-validation";
import { normalizeMissionSocials, validateMissionSocials, type MissionSocials } from "@/lib/mission-socials";
import { query, transaction } from "@/lib/backend/db";
import {
  fundingRequestPda,
  prepareCandidateRegistrationTransaction,
  prepareCouncilExecuteTransaction,
  prepareFinalizeEpochCouncilTransaction,
  fetchMeteoraDbcMissionSnapshot,
  fetchMeteoraDammV2MissionSnapshot,
  prepareCouncilVoteTransaction,
  prepareFundingRequestTransaction,
  prepareLaunchTransaction,
  prepareMeteoraDammV2TradeTransaction,
  prepareMeteoraDbcTradeTransaction,
  prepareMissionMarketGraduationTransaction,
  prepareMissionTreasuryAllocationClaimTransaction,
  prepareReleaseVoteEscrowTransaction,
  prepareMissionGraduationTransaction,
  recoverDammV2FeePositions,
  submitBackendDammV2FeeDistribution,
  submitBackendMissionFeeDistribution,
  submitFinalizeEpochCouncilTransaction,
  submitReleaseVoteEscrowTransaction,
  voteEscrowPositionAddress,
} from "@/lib/backend/transactions";
import type { MissionSort } from "@/lib/backend/store";

type MissionRow = {
  id: string;
  creator_wallet: string;
  mission_pda: string | null;
  token_mint: string | null;
  dbc_pool: string | null;
  damm_pool: string | null;
  treasury_vault: string | null;
  lifecycle_state: Mission["lifecycle"] | null;
  statement: string;
  description: string;
  image_url: string;
  token_image_url: string;
  token_symbol: string;
  total_supply: string;
  treasury_supply_percent: string;
  performance_json: Mission["performance"];
  council_json: Mission["council"];
  socials: MissionSocials | null;
  token_price_usdc: string | null;
  holders: number | null;
  liquidity_usdc: string | null;
  treasury_usdc: string | null;
  treasury_tokens: string | null;
  market_tokens: string | null;
  circulating_tokens: string | null;
  base_reserve: string | null;
  quote_reserve: string | null;
  pool_progress_percent: string | null;
  treasury_allocation_claimed: boolean | null;
  market_data_updated_at: string | null;
};

type MissionTradeContextRow = Pick<MissionRow, "id" | "token_mint" | "dbc_pool" | "damm_pool" | "lifecycle_state"> & {
  token_price_usdc: string | null;
};

const MISSION_TRADE_CONTEXT_CACHE_TTL_MS = 10_000;
const missionTradeContextCache = new Map<string, { mission: MissionTradeContextRow; cachedAt: number }>();
const missionTradeContextInflight = new Map<string, Promise<MissionTradeContextRow | null>>();

type FundingRequestRow = {
  id: string;
  mission_id: string;
  requester_wallet: string;
  recipient_wallet: string;
  derived_usd_estimate: string;
  mission_token_amount: string;
  status: RequestStatus;
  title: string;
  description: string;
  metadata_hash: string;
  request_pda: string | null;
  epoch_number: number | string | null;
  approvals: string;
  rejections: string;
  executed_at: string | null;
  created_at?: string;
};

type FundingRequestVoteRow = {
  request_id: string;
  voter_wallet: string;
  vote: "approve" | "reject";
};

type CouncilCandidateRow = {
  mission_id: string;
  owner_wallet: string;
  latest_checkpoint_balance: string;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type EscrowedBalanceRow = {
  mission_id: string;
  voter_wallet: string;
  escrowed_base_units: string;
  locked_until: string | null;
};

type PricePointRow = {
  timestamp: string;
  price_usdc: string;
};

type ProfileRow = {
  wallet_address: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  socials: string[];
  balances: typeof currentUser.balances;
  token_balances: typeof currentUser.tokenBalances;
  created_missions: typeof currentUser.createdMissions;
};

type CreatedMissionFeeRow = {
  mission_id: string;
  trading_fees_earned: string | null;
  claimable_fees: string | null;
};

type PendingMissionLaunchRow = {
  id: string;
  creator_wallet: string;
  metadata_hash: string;
  metadata_uri: string;
  statement: string;
  description: string;
  image_url: string;
  token_image_url: string;
  token_symbol: string;
  total_supply: string;
  treasury_supply_percent: string;
  initial_purchase_usdc: string;
  launch_accounts: Record<string, unknown>;
  socials: MissionSocials | null;
};

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;
type CouncilCheckpointMember = Mission["council"][number] & {
  tokenBaseUnits: string;
  tokenDecimals: number;
};

const performanceFrames = {
  "1H": { label: "1 hour", agoLabel: "1 hour ago", ms: 60 * 60 * 1000 },
  "4H": { label: "4 hours", agoLabel: "4 hours ago", ms: 4 * 60 * 60 * 1000 },
  "1D": { label: "1 day", agoLabel: "1 day ago", ms: 24 * 60 * 60 * 1000 },
  "1W": { label: "1 week", agoLabel: "1 week ago", ms: 7 * 24 * 60 * 60 * 1000 },
  "1M": { label: "1 month", agoLabel: "1 month ago", ms: 30 * 24 * 60 * 60 * 1000 },
  "6M": { label: "6 months", agoLabel: "6 months ago", ms: 182 * 24 * 60 * 60 * 1000 },
  "1Y": { label: "1 year", agoLabel: "1 year ago", ms: 365 * 24 * 60 * 60 * 1000 },
} as const satisfies Record<keyof Mission["performance"], { label: string; agoLabel: string; ms: number }>;

const launchPerformance = Object.fromEntries(
  Object.entries(performanceFrames).map(([key, frame]) => [
    key,
    {
      label: frame.label,
      agoLabel: frame.agoLabel,
      value: 100,
      change: 0,
    },
  ]),
) as Mission["performance"];

const marketRefreshTtlMs = 30_000;
const marketRefreshCache = new Map<string, { expiresAt: number; promise: Promise<Mission | null> }>();

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

function launchAccountString(accounts: Record<string, unknown>, key: string) {
  const value = accounts[key];
  return typeof value === "string" ? value : null;
}

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function tokenBaseUnitsToDecimalString(value: string | number | bigint | null | undefined, decimals = 6) {
  const amount = BigInt(value ?? 0);
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toString();

  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function shortWallet(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function emptyProfile(address: string) {
  return {
    name: "",
    address,
    avatar: "",
    description: "",
    socials: [],
    ...emptyWalletBalanceSnapshot(),
    createdMissions: [],
    submittedRequests: [],
    councilRequests: [],
  };
}

async function walletBalances(address: string, missionList: Mission[]) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      getWalletBalanceSnapshot(address, missionList),
      new Promise<ReturnType<typeof emptyWalletBalanceSnapshot>>((resolve) => {
        timeout = setTimeout(() => resolve(emptyWalletBalanceSnapshot()), 2500);
      }),
    ]);
  } catch {
    return emptyWalletBalanceSnapshot();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function rpcUrl() {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertSuccessfulOnchainTransaction(signature: string) {
  if (!signature) throw new Error("signature is required.");
  const url = rpcUrl();
  if (!url) throw new Error("Solana RPC is required to verify the transaction before saving data.");

  const connection = new Connection(url, "confirmed");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error("The on-chain transaction failed. No changes were saved.");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized" || status?.confirmations === null) return;
    await wait(500);
  }

  throw new Error("The on-chain transaction could not be verified. No changes were saved.");
}

const REQUEST_VOTE_APPROVE_OFFSET = 8 + 32 + 32;

async function assertOnchainFundingRequestVote(requestAccount: string, voter: string, vote: "approve" | "reject") {
  const url = rpcUrl();
  if (!url) throw new Error("Solana RPC is required to verify the vote before saving data.");
  const account = votePda(requestAccount, voter);
  const connection = new Connection(url, "confirmed");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(account, "confirmed");
    if (info) {
      const onchainVote = info.data[REQUEST_VOTE_APPROVE_OFFSET] === 1 ? "approve" : "reject";
      if (onchainVote !== vote) throw new Error("The confirmed on-chain vote does not match the submitted vote. No changes were saved.");
      return;
    }
    await wait(500);
  }

  throw new Error("The on-chain vote could not be verified. No changes were saved.");
}

function configuredAddressSet(value?: string) {
  return new Set(
    (value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.toLowerCase()),
  );
}

const mintDecimalsCache = new Map<string, number>();

async function getMintDecimals(mintAddress: string): Promise<number | null> {
  const cached = mintDecimalsCache.get(mintAddress);
  if (cached !== undefined) return cached;

  const url = rpcUrl();
  if (!url) return null;

  try {
    const connection = new Connection(url, "confirmed");
    const info = await connection.getParsedAccountInfo(new PublicKey(mintAddress), "confirmed");
    const data = info.value?.data;
    if (data && typeof data !== "string" && "parsed" in data) {
      const parsed = data.parsed as { info?: { decimals?: number | string } };
      const decimals = Number(parsed.info?.decimals);
      if (Number.isFinite(decimals) && decimals >= 0) {
        mintDecimalsCache.set(mintAddress, decimals);
        return decimals;
      }
    }
  } catch {
    // ignore — fall through and return null so callers can degrade gracefully
  }

  return null;
}

async function fetchTokenBalanceBaseUnits(wallet: string, mintAddress: string): Promise<string> {
  const url = rpcUrl();
  if (!url) return "0";

  try {
    const connection = new Connection(url, "confirmed");
    const accounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(wallet),
      { mint: new PublicKey(mintAddress) },
      "confirmed",
    );
    let total = 0n;
    for (const account of accounts.value) {
      const data = account.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } };
      const amount = data.parsed?.info?.tokenAmount?.amount;
      const decimals = data.parsed?.info?.tokenAmount?.decimals;
      if (amount) total += BigInt(amount);
      if (typeof decimals === "number" && Number.isFinite(decimals)) {
        mintDecimalsCache.set(mintAddress, decimals);
      }
    }
    return total.toString();
  } catch {
    return "0";
  }
}

function tokenAccountAmountToNumber(amount: string, decimals: number) {
  return Number(amount) / 10 ** decimals;
}

type EscrowedVoteBalance = {
  amount: bigint;
  lockedUntil: string | null;
};

const VOTE_ESCROW_LOCK_INTERVAL_SQL = "3 days";

async function escrowedVoteBalancesByMission(missionIds: string[], client?: Queryable) {
  if (missionIds.length === 0) return new Map<string, Map<string, EscrowedVoteBalance>>();

  const result = await (client || { query }).query<EscrowedBalanceRow>(
    `
      select
        fr.mission_id,
        frv.voter_wallet,
        max(coalesce((ec.escrow_amounts ->> (member_wallet.ordinality::int - 1))::numeric, 0))::numeric(40, 0) as escrowed_base_units,
        max(frv.created_at + $2::interval) as locked_until
      from funding_request_votes frv
      join funding_requests fr on fr.id = frv.request_id
      join epoch_councils ec on ec.mission_id = fr.mission_id and ec.epoch_number = fr.epoch_number
      left join transactions release_tx
        on release_tx.mission_id = fr.mission_id
        and lower(release_tx.wallet) = lower(frv.voter_wallet)
        and release_tx.type = 'funding-request-vote-escrow-release'
        and release_tx.status = 'confirmed'
        and release_tx.created_at >= frv.created_at + $2::interval
      join jsonb_array_elements_text(ec.member_wallets) with ordinality as member_wallet(wallet, ordinality)
        on lower(member_wallet.wallet) = lower(frv.voter_wallet)
      where fr.mission_id = any($1::text[])
        and release_tx.signature is null
      group by fr.mission_id, frv.voter_wallet
    `,
    [missionIds, VOTE_ESCROW_LOCK_INTERVAL_SQL],
  );
  const byMission = new Map<string, Map<string, EscrowedVoteBalance>>();
  for (const row of result.rows) {
    const missionMap = byMission.get(row.mission_id) || new Map<string, EscrowedVoteBalance>();
    missionMap.set(row.voter_wallet.toLowerCase(), {
      amount: BigInt(row.escrowed_base_units || "0"),
      lockedUntil: row.locked_until,
    });
    byMission.set(row.mission_id, missionMap);
  }

  return byMission;
}

async function createdMissionFeeRows(address: string, client?: Queryable) {
  // Creator fee share and profile UI are controlled in lib/trading-fees.ts.
  const result = await (client || { query }).query<CreatedMissionFeeRow>(
    `
      select
        m.id as mission_id,
        coalesce(sum(re.creator_amount), 0)::text as trading_fees_earned,
        0::numeric(40, 6)::text as claimable_fees
      from missions m
      left join reward_epochs re on re.mission_id = m.id
      where lower(m.creator_wallet) = lower($1)
      group by m.id, m.created_at
      order by m.created_at desc
    `,
    [address],
  );

  return result.rows.map((row) => ({
    missionId: row.mission_id,
    tradingFeesEarned: num(row.trading_fees_earned),
    claimableFees: num(row.claimable_fees),
  }));
}

function pda(programId: string, namespace: string, id: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from(namespace), createHash("sha256").update(id).digest().subarray(0, 32)],
    new PublicKey(programId),
  );

  return address;
}

function missionPda(mission: Mission) {
  if (mission.missionPda) return new PublicKey(mission.missionPda);
  return pda(process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID, "mission", mission.id);
}

function epochCouncilPda(mission: PublicKey, epoch: number) {
  const epochBuffer = Buffer.alloc(8);
  epochBuffer.writeBigUInt64LE(BigInt(epoch));
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("epoch_council"), mission.toBuffer(), epochBuffer],
    new PublicKey(process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID),
  );

  return address;
}

function votePda(request: string, voter: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), new PublicKey(request).toBuffer(), new PublicKey(voter).toBuffer()],
    new PublicKey(process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID),
  );

  return address;
}

const FUNDING_REQUEST_VOTING_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

function votingEndsAtForRequest(row: FundingRequestRow) {
  if (!row.created_at) return null;
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt)) return null;
  return new Date(createdAt + FUNDING_REQUEST_VOTING_PERIOD_MS).toISOString();
}

function requestTimeLeft(row: FundingRequestRow) {
  const status = row.status;
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired";
  const endsAt = votingEndsAtForRequest(row);
  if (!endsAt) return "3d 0h 0m left";
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  if (remainingMs <= 0) return "0d 0h 0m left";
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m left`;
}

function rowToRequest(
  row: FundingRequestRow,
  requester?: Pick<ProfileRow, "display_name" | "avatar_url">,
  councillors?: FundingRequest["councillors"],
): FundingRequest {
  const requesterName = requester?.display_name?.trim() || "";
  return {
    id: row.id,
    missionId: row.mission_id,
    requester: requesterName || row.requester_wallet,
    requesterAddress: row.requester_wallet,
    requesterName,
    requesterAvatar: requester?.avatar_url || "",
    name: row.title,
    description: row.description,
    amountUsd: num(row.derived_usd_estimate),
    tokenAmount: num(row.mission_token_amount),
    approvals: Number(row.approvals || 0),
    rejections: Number(row.rejections || 0),
    timeLeft: requestTimeLeft(row),
    createdAt: row.created_at,
    votingEndsAt: votingEndsAtForRequest(row) || undefined,
    status: row.status,
    paid: Boolean(row.executed_at),
    paidAt: row.executed_at,
    councillors,
  };
}

const FUNDING_REQUEST_EXECUTED_AT_OFFSET = 187;

function requestAccountForRow(row: FundingRequestRow) {
  return (
    row.request_pda ||
    fundingRequestPda({
      registryProgramId: process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
      councilProgramId: process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
      missionId: row.mission_id,
      metadataHash: row.metadata_hash,
    })
  );
}

async function getFundingRequestRow(requestId: string) {
  const result = await query<FundingRequestRow>(
    `
      select
        fr.*,
        count(*) filter (where frv.vote = 'approve') as approvals,
        count(*) filter (where frv.vote = 'reject') as rejections
      from funding_requests fr
      left join funding_request_votes frv on frv.request_id = fr.id
      where fr.id = $1
      group by fr.id
    `,
    [requestId],
  );

  return result.rows[0] || null;
}

function executedAtFromFundingRequestAccount(data: Buffer) {
  if (data.length < FUNDING_REQUEST_EXECUTED_AT_OFFSET + 8) return null;
  const seconds = Number(data.readBigInt64LE(FUNDING_REQUEST_EXECUTED_AT_OFFSET));
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

async function hydrateFundingRequestExecutionState(rows: FundingRequestRow[], client?: Queryable) {
  const url = rpcUrl();
  if (!url) return;

  const entries = rows
    .filter((row) => row.status === "accepted" && !row.executed_at)
    .flatMap((row) => {
      try {
        return [{ row, account: new PublicKey(requestAccountForRow(row)) }];
      } catch {
        return [];
      }
    });
  if (!entries.length) return;

  try {
    const connection = new Connection(url, "confirmed");
    const infos = await connection.getMultipleAccountsInfo(entries.map((entry) => entry.account), "confirmed");
    await Promise.all(
      entries.map(async (entry, index) => {
        const data = infos[index]?.data;
        const executedAt = data ? executedAtFromFundingRequestAccount(data) : null;
        if (!executedAt) return;
        entry.row.executed_at = executedAt;
        await (client || { query }).query("update funding_requests set executed_at = coalesce(executed_at, $2) where id = $1", [entry.row.id, executedAt]);
      }),
    );
  } catch {
    // Chain state refresh is opportunistic; DB state remains the fallback.
  }
}

function rowToMission(row: MissionRow, requests: FundingRequest[]): Mission {
  return {
    id: row.id,
    isDemo: isDemoMissionCreator(row.creator_wallet),
    missionPda: row.mission_pda,
    statement: row.statement,
    description: row.description,
    socials: normalizeMissionSocials(row.socials),
    image: row.image_url,
    tokenImage: row.token_image_url,
    tokenSymbol: row.token_symbol,
    tokenMint: row.token_mint,
    dbcPool: row.dbc_pool,
    dammPool: row.damm_pool,
    treasuryVault: row.treasury_vault,
    lifecycle: row.lifecycle_state || "draft",
    tokenPrice: num(row.token_price_usdc),
    holders: Number(row.holders || 0),
    liquidity: num(row.liquidity_usdc),
    treasuryUsdc: num(row.treasury_usdc),
    treasuryTokens: num(row.treasury_tokens),
    treasurySupplyPercent: num(row.treasury_supply_percent),
    totalSupply: num(row.total_supply),
    marketTokens: row.market_tokens == null ? undefined : num(row.market_tokens),
    circulatingTokens: row.circulating_tokens == null ? undefined : num(row.circulating_tokens),
    baseReserve: row.base_reserve == null ? undefined : num(row.base_reserve),
    quoteReserve: row.quote_reserve == null ? undefined : num(row.quote_reserve),
    poolProgressPercent: row.pool_progress_percent == null ? undefined : num(row.pool_progress_percent),
    treasuryAllocationClaimed: row.treasury_allocation_claimed ?? undefined,
    marketDataUpdatedAt: row.market_data_updated_at ?? undefined,
    performance: row.performance_json || fixtureMissions[0].performance,
    council: row.council_json || [],
    requests,
  };
}

async function enrichCouncilWithProfiles(members: Mission["council"], tokenImage: string, client?: Queryable) {
  const addresses = Array.from(new Set(members.map((member) => member.address).filter(Boolean)));
  if (addresses.length === 0) return members;

  const profiles = await (client || { query }).query<Pick<ProfileRow, "wallet_address" | "display_name" | "avatar_url" | "bio">>(
    "select wallet_address, display_name, avatar_url, bio from profiles where wallet_address = any($1::text[])",
    [addresses],
  );
  const profilesByWallet = new Map(profiles.rows.map((profile) => [profile.wallet_address.toLowerCase(), profile]));

  return members.map((member) => {
    const profile = profilesByWallet.get(member.address.toLowerCase());
    const currentAvatar = member.avatar === tokenImage ? "" : member.avatar;
    if (!profile) return { ...member, avatar: currentAvatar, description: member.description?.trim() || undefined };

    return {
      ...member,
      name: profile.display_name || shortWallet(member.address),
      avatar: profile.avatar_url || currentAvatar,
      description: profile.bio?.trim() || undefined,
    };
  });
}

async function candidateRowsToCouncil(row: MissionRow, candidates: CouncilCandidateRow[], client?: Queryable) {
  const existing = new Map((row.council_json || []).map((member) => [member.address.toLowerCase(), member]));
  const totalSupply = num(row.total_supply);
  const merged = [...(row.council_json || [])];
  const escrowedByMission = await escrowedVoteBalancesByMission([row.id], client);
  const missionEscrowed = escrowedByMission.get(row.id) || new Map<string, EscrowedVoteBalance>();
  const decimals = row.token_mint ? await getMintDecimals(row.token_mint) : null;
  const divisor = decimals === null ? 1 : 10 ** decimals;

  // The council_json column stores tokens in human-readable UI units, while
  // council_candidates.latest_checkpoint_balance is denominated in raw base
  // units (e.g. 100k GF -> 100_000_000_000 with 6 decimals). Convert candidate
  // balances down to UI units so the final list can be ranked consistently.
  const newCandidates = candidates.filter((candidate) => !existing.has(candidate.owner_wallet.toLowerCase()));

  for (const candidate of newCandidates) {
    const baseUnits = num(candidate.latest_checkpoint_balance);
    const tokens = baseUnits / divisor;
    merged.push({
      id: `${row.id}-candidate-${candidate.owner_wallet}`,
      name: candidate.display_name || shortWallet(candidate.owner_wallet),
      address: candidate.owner_wallet,
      avatar: candidate.avatar_url || "",
      description: candidate.bio?.trim() || undefined,
      tokens,
      ownership: totalSupply > 0 ? (tokens / totalSupply) * 100 : 0,
    });
  }

  const escrowAdjusted = merged.map((member) => {
    const escrowedBaseUnits = missionEscrowed.get(member.address.toLowerCase())?.amount || 0n;
    const escrowedTokens = tokenAccountAmountToNumber(escrowedBaseUnits.toString(), decimals ?? 0);
    const liquidTokens = Math.max(member.tokens - (member.escrowedTokens || 0), 0);
    const totalTokens = liquidTokens + escrowedTokens;
    return {
      ...member,
      escrowedTokens,
      tokens: totalTokens,
      ownership: totalSupply > 0 ? (totalTokens / totalSupply) * 100 : member.ownership,
    };
  });
  const enriched = await enrichCouncilWithProfiles(escrowAdjusted, row.token_image_url, client);
  return enriched.sort((a, b) => b.tokens - a.tokens).slice(0, 6);
}

async function councilCandidateRows(missionIds: string[], client?: Queryable) {
  if (missionIds.length === 0) return new Map<string, CouncilCandidateRow[]>();
  const result = await (client || { query }).query<CouncilCandidateRow>(
    `
      select cc.mission_id, cc.owner_wallet, cc.latest_checkpoint_balance, cc.created_at, p.display_name, p.avatar_url, p.bio
      from council_candidates cc
      left join profiles p on p.wallet_address = cc.owner_wallet
      where cc.mission_id = any($1::text[]) and cc.status = 'registered'
      order by cc.latest_checkpoint_balance desc, cc.created_at asc
    `,
    [missionIds],
  );
  const byMission = new Map<string, CouncilCandidateRow[]>();
  for (const row of result.rows) {
    const entries = byMission.get(row.mission_id) || [];
    entries.push(row);
    byMission.set(row.mission_id, entries);
  }

  return byMission;
}

async function refreshMissionCouncilFromTopHoldersInPostgres(mission: Mission, client?: Queryable) {
  if (!mission.tokenMint) throw new Error("Mission token mint is not available yet.");
  const url = rpcUrl();
  if (!url) throw new Error("SOLANA_RPC_URL is required to checkpoint token holders.");

  const connection = new Connection(url, "confirmed");
  const mint = new PublicKey(mission.tokenMint);
  const councilProgramId = process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID;
  const missionAccount = missionPda(mission);
  const excludedOwners = configuredAddressSet(process.env.SINGULARITY_COUNCIL_EXCLUDED_OWNERS);

  // 1. Enumerate every on-chain Candidate PDA for this mission. memcmp at offset 8 = the mission key
  // stored on the Candidate account immediately after Anchor's 8-byte discriminator.
  const candidateAccounts = await connection.getProgramAccounts(new PublicKey(councilProgramId), {
    commitment: "confirmed",
    filters: [
      { memcmp: { offset: 8, bytes: missionAccount.toBase58() } },
    ],
  });

  // Anchor Candidate layout: [discriminator(8)][mission(32)][owner(32)][registered_at(8)][bump(1)] = 81 bytes.
  // Other account types in this program (EpochCouncil, FundingRequest, RequestVote) have different
  // sizes, so size-filtering here keeps only the Candidate accounts even if someone happens to write a
  // matching memcmp prefix.
  const CANDIDATE_ACCOUNT_SIZE = 8 + 32 + 32 + 8 + 1;
  const candidateOwners: { owner: string }[] = [];
  for (const entry of candidateAccounts) {
    if (entry.account.data.length !== CANDIDATE_ACCOUNT_SIZE) continue;
    const owner = new PublicKey(entry.account.data.subarray(8 + 32, 8 + 64)).toBase58();
    if (excludedOwners.has(owner.toLowerCase())) continue;
    candidateOwners.push({ owner });
  }

  if (candidateOwners.length === 0) {
    throw new Error("No registered council candidates were found for this mission. Ask top holders to register before opening funding requests.");
  }

  // 2. Look up each registered candidate's mission-token ATA balance. We treat the ATA as the source
  // of voting weight; non-ATA token accounts are intentionally ignored (consistent with the existing
  // FE which always uses ATAs).
  const decimals = (await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID)).decimals;
  const ownerAtas = candidateOwners.map((entry) =>
    getAssociatedTokenAddressSync(mint, new PublicKey(entry.owner), false, TOKEN_2022_PROGRAM_ID),
  );
  const ataInfos = ownerAtas.length ? await connection.getMultipleAccountsInfo(ownerAtas, "confirmed") : [];
  const escrowedByMission = await escrowedVoteBalancesByMission([mission.id], client);
  const missionEscrowed = escrowedByMission.get(mission.id) || new Map<string, EscrowedVoteBalance>();
  const balanced = candidateOwners.map((entry, index) => {
    const info = ataInfos[index];
    let liquidAmount = 0n;
    if (info && info.data.length >= 72) {
      // Token-2022 account: mint(32) + owner(32) + amount(8) starting at offset 64.
      liquidAmount = info.data.readBigUInt64LE(64);
    }
    const escrowedAmount = missionEscrowed.get(entry.owner.toLowerCase())?.amount || 0n;
    return { owner: entry.owner, amount: liquidAmount + escrowedAmount, liquidAmount, escrowedAmount, decimals };
  });

  // 3. Drop zero-balance candidates (the on-chain program rejects votes whose escrow_amount == 0)
  // and rank the rest by balance, with address tiebreak for stability across calls.
  const ranked = balanced
    .filter((entry) => entry.amount > 0n)
    .sort((a, b) => (a.amount === b.amount ? a.owner.localeCompare(b.owner) : a.amount > b.amount ? -1 : 1));
  const top6 = ranked.slice(0, 6);
  if (top6.length < 6) {
    const symbol = mission.tokenSymbol || "mission-token";
    throw new Error(
      `This mission has only ${top6.length} registered candidate${top6.length === 1 ? "" : "s"} with a non-zero ${symbol} position. ` +
        `At least 6 are required before a treasury council can be finalized. Ask more top holders to register and hold ${symbol}.`,
    );
  }

  const profiles = await (client || { query }).query<Pick<ProfileRow, "wallet_address" | "display_name" | "avatar_url" | "bio">>(
    "select wallet_address, display_name, avatar_url, bio from profiles where wallet_address = any($1::text[])",
    [top6.map((entry) => entry.owner)],
  );
  const profilesByWallet = new Map(profiles.rows.map((profile) => [profile.wallet_address, profile]));
  const totalSupply = mission.totalSupply || DEFAULT_DBC_TOTAL_SUPPLY;
  const council = top6.map((entry, index) => {
    const profile = profilesByWallet.get(entry.owner);
    const tokens = tokenAccountAmountToNumber(entry.amount.toString(), entry.decimals);
    return {
      id: `${mission.id}-holder-${index + 1}`,
      name: profile?.display_name || shortWallet(entry.owner),
      address: entry.owner,
      avatar: profile?.avatar_url || "",
      description: profile?.bio?.trim() || undefined,
      tokens,
      ownership: totalSupply > 0 ? (tokens / totalSupply) * 100 : 0,
      tokenBaseUnits: entry.amount.toString(),
      tokenDecimals: entry.decimals,
    } satisfies CouncilCheckpointMember;
  });

  // Persist DB state. Status flips to 'registered' for everyone we just confirmed has a Candidate PDA;
  // if there are stale rows for a wallet whose Candidate PDA was closed, mark them 'observed' on the
  // next refresh by removing the unconditional registered upsert.
  await (client || { query }).query("update missions set council_json = $2 where id = $1", [mission.id, JSON.stringify(council)]);
  for (const entry of balanced) {
    await (client || { query }).query(
      `
        insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status)
        values ($1, $2, $3, 'registered')
        on conflict (mission_id, owner_wallet) do update set
          latest_checkpoint_balance = excluded.latest_checkpoint_balance,
          status = 'registered'
      `,
      [mission.id, entry.owner, entry.amount.toString()],
    );
  }

  return council;
}

async function ensureEpochCouncilFinalizedOnChain(input: {
  mission: Mission;
  epoch: number;
  candidates: CouncilCheckpointMember[];
  escrowAmounts: number[];
}) {
  const url = rpcUrl();
  if (!url) throw new Error("SOLANA_RPC_URL is required to verify the treasury council checkpoint.");
  const connection = new Connection(url, "confirmed");
  const account = await connection.getAccountInfo(epochCouncilPda(missionPda(input.mission), input.epoch), "confirmed");
  if (account) return null;

  const finalized = await submitFinalizeEpochCouncilTransaction({
    missionId: input.mission.id,
    epoch: input.epoch,
    members: input.candidates.map((candidate) => candidate.address),
    escrowAmounts: input.escrowAmounts,
  });
  if (!finalized) {
    throw new Error("This mission has 6 holders, but automatic council finalization is not configured. Set SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR on the backend.");
  }

  return finalized;
}

// Returns the epoch number that newly-created funding requests for this mission should reference.
// Reuses the latest finalized epoch when the on-chain council would be unchanged; otherwise allocates
// the next epoch number and submits `finalize_epoch_council` on chain.
async function selectOrFinalizeEpochCouncil(input: {
  mission: Mission;
  candidates: CouncilCheckpointMember[];
  escrowAmounts: number[];
  client?: Queryable;
}): Promise<{ epoch: number; rotated: boolean }> {
  const reader = input.client || { query };
  const latest = await reader.query<{ epoch_number: number; member_wallets: string[]; escrow_amounts: unknown[] }>(
    "select epoch_number, member_wallets, escrow_amounts from epoch_councils where mission_id = $1 order by epoch_number desc limit 1",
    [input.mission.id],
  );
  const latestRow = latest.rows[0];

  // Build a stable signature: address -> escrow amount as string (BigInt-safe).
  const sigFor = (members: string[], amounts: Array<number | string>) => {
    const map = new Map<string, string>();
    members.forEach((address, index) => map.set(address, String(amounts[index] ?? "0")));
    return map;
  };
  const mapsEqual = (a: Map<string, string>, b: Map<string, string>) => {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) if (b.get(key) !== value) return false;
    return true;
  };

  const newSig = sigFor(input.candidates.map((c) => c.address), input.escrowAmounts);
  if (latestRow) {
    const latestSig = sigFor(latestRow.member_wallets || [], (latestRow.escrow_amounts as Array<number | string>) || []);
    if (mapsEqual(newSig, latestSig)) return { epoch: latestRow.epoch_number, rotated: false };
  }

  const nextEpoch = (latestRow?.epoch_number ?? 0) + 1;
  await ensureEpochCouncilFinalizedOnChain({
    mission: input.mission,
    epoch: nextEpoch,
    candidates: input.candidates,
    escrowAmounts: input.escrowAmounts,
  });
  await recordEpochCouncilInPostgres({
    missionId: input.mission.id,
    epoch: nextEpoch,
    candidates: input.candidates,
    escrowAmounts: input.escrowAmounts,
    client: input.client,
  });
  return { epoch: nextEpoch, rotated: true };
}

async function recordEpochCouncilInPostgres(input: {
  missionId: string;
  epoch: number;
  candidates: CouncilCheckpointMember[];
  escrowAmounts: number[];
  client?: Queryable;
}) {
  await (input.client || { query }).query(
    `
      insert into epoch_councils (mission_id, epoch_number, member_wallets, checkpoint_balances, escrow_amounts)
      values ($1, $2, $3, $4, $5)
      on conflict (mission_id, epoch_number) do update set
        member_wallets = excluded.member_wallets,
        checkpoint_balances = excluded.checkpoint_balances,
        escrow_amounts = excluded.escrow_amounts,
        finalized_at = now()
    `,
    [
      input.missionId,
      input.epoch,
      JSON.stringify(input.candidates.map((candidate) => candidate.address)),
      JSON.stringify(input.candidates.map((candidate) => candidate.tokenBaseUnits)),
      JSON.stringify(input.escrowAmounts),
    ],
  );
}

async function performanceFromPricePoints(
  missionId: string,
  currentPrice: number,
  client?: Queryable,
  options: { fallbackBaselinePrice?: number | null; fallbackAgoLabel?: string; previous?: Mission["performance"] } = {},
): Promise<Mission["performance"]> {
  const result = await (client || { query }).query<PricePointRow>(
    `
      select timestamp, price_usdc
      from price_points
      where mission_id = $1 and timestamp >= now() - interval '370 days'
      order by timestamp asc
    `,
    [missionId],
  );
  const points = result.rows.map((row) => ({ timestamp: new Date(row.timestamp).getTime(), price: num(row.price_usdc) })).filter((point) => point.price > 0);
  const now = Date.now();
  const oldestTimestamp = points[0]?.timestamp ?? now;

  return Object.fromEntries(
    Object.entries(performanceFrames).map(([key, frame]) => {
      const frameKey = key as keyof Mission["performance"];
      const cutoff = now - frame.ms;
      const olderPoint = [...points].reverse().find((point) => point.timestamp <= cutoff);
      const hasHistoryForFrame = olderPoint !== undefined || oldestTimestamp <= cutoff;
      const fallbackBaseline =
        Number.isFinite(options.fallbackBaselinePrice) && (options.fallbackBaselinePrice || 0) > 0
          ? Number(options.fallbackBaselinePrice)
          : null;
      const previousPoint = options.previous?.[frameKey];
      const baseline = hasHistoryForFrame
        ? olderPoint?.price || points[0]?.price || currentPrice || 1
        : fallbackBaseline || currentPrice || 1;

      if (!hasHistoryForFrame && !fallbackBaseline && previousPoint) {
        return [key, previousPoint];
      }

      const value = baseline > 0 && currentPrice > 0 ? (currentPrice / baseline) * 100 : 100;
      return [
        key,
        {
          label: frame.label,
          agoLabel: hasHistoryForFrame ? frame.agoLabel : options.fallbackAgoLabel || frame.agoLabel,
          value: Number(value.toFixed(2)),
          change: Number((value - 100).toFixed(2)),
        },
      ];
    }),
  ) as Mission["performance"];
}

export async function refreshMissionMarketDataInPostgres(missionId: string, client?: Queryable): Promise<Mission | null> {
  if (!client) {
    const cached = marketRefreshCache.get(missionId);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    let promise: Promise<Mission | null>;
    promise = refreshMissionMarketDataInPostgres(missionId, { query: query as unknown as Queryable["query"] }).catch((error: unknown) => {
      const cached = marketRefreshCache.get(missionId);
      if (cached?.promise === promise) marketRefreshCache.delete(missionId);
      throw error;
    });
    marketRefreshCache.set(missionId, { expiresAt: Date.now() + marketRefreshTtlMs, promise });
    return promise;
  }

  const mission = await getMissionByIdFromPostgres(missionId, client);
  if (!mission) return null;
  const snapshot =
    mission.dammPool || mission.lifecycle === "graduated"
      ? await fetchMeteoraDammV2MissionSnapshot({
          dammPool: mission.dammPool,
          tokenMint: mission.tokenMint,
          treasuryVault: mission.treasuryVault,
          treasurySupplyPercent: mission.treasurySupplyPercent,
          totalSupply: mission.totalSupply,
          fallbackPrice: mission.tokenPrice,
        }).catch(() => null)
      : mission.lifecycle === "bonding" && mission.dbcPool
        ? await fetchMeteoraDbcMissionSnapshot({
            dbcPool: mission.dbcPool,
            tokenMint: mission.tokenMint,
            treasuryVault: mission.treasuryVault,
            treasurySupplyPercent: mission.treasurySupplyPercent,
            totalSupply: mission.totalSupply,
          }).catch(() => null)
        : null;
  if (!snapshot) return mission;

  const holders = snapshot.holders || mission.holders || 1;
  await (client || { query }).query(
    `
      insert into mission_metrics (
        mission_id, token_price_usdc, holders, liquidity_usdc, treasury_usdc, treasury_tokens,
        market_tokens, circulating_tokens, base_reserve, quote_reserve, pool_progress_percent,
        treasury_allocation_claimed, market_data_updated_at, volume_usdc, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, now())
      on conflict (mission_id) do update set
        token_price_usdc = excluded.token_price_usdc,
        holders = excluded.holders,
        liquidity_usdc = excluded.liquidity_usdc,
        treasury_usdc = excluded.treasury_usdc,
        treasury_tokens = excluded.treasury_tokens,
        market_tokens = excluded.market_tokens,
        circulating_tokens = excluded.circulating_tokens,
        base_reserve = excluded.base_reserve,
        quote_reserve = excluded.quote_reserve,
        pool_progress_percent = excluded.pool_progress_percent,
        treasury_allocation_claimed = excluded.treasury_allocation_claimed,
        market_data_updated_at = excluded.market_data_updated_at,
        updated_at = now()
    `,
    [
      missionId,
      snapshot.currentPrice,
      holders,
      snapshot.liquidityUsd,
      snapshot.treasuryUsdc,
      snapshot.treasuryTokens,
      snapshot.marketTokens,
      snapshot.circulatingTokens,
      snapshot.baseReserve,
      snapshot.quoteReserve,
      "poolProgressPercent" in snapshot ? snapshot.poolProgressPercent : null,
      "treasuryAllocationClaimed" in snapshot ? snapshot.treasuryAllocationClaimed : null,
      snapshot.updatedAt,
    ],
  );

  const lastPoint = await (client || { query }).query<{ price_usdc: string; timestamp: string }>(
    "select price_usdc, timestamp from price_points where mission_id = $1 order by timestamp desc limit 1",
    [missionId],
  );
  const last = lastPoint.rows[0];
  const lastPrice = num(last?.price_usdc);
  const lastTimestamp = last ? new Date(last.timestamp).getTime() : 0;
  const shouldInsertPoint = !last || Date.now() - lastTimestamp > 5 * 60 * 1000 || Math.abs(lastPrice - snapshot.currentPrice) / Math.max(lastPrice, 1e-12) > 0.001;

  if (shouldInsertPoint) {
    await (client || { query }).query(
      "insert into price_points (mission_id, timestamp, price_usdc, volume_usdc, source) values ($1, now(), $2, 0, $3)",
      [missionId, snapshot.currentPrice, snapshot.route],
    );
  }

  const performance = await performanceFromPricePoints(missionId, snapshot.currentPrice, client, {
    fallbackBaselinePrice: snapshot.route === "meteora-dbc" ? snapshot.launchPrice : null,
    fallbackAgoLabel: snapshot.route === "meteora-dbc" ? "at launch" : undefined,
    previous: mission.performance,
  });
  await (client || { query }).query("update missions set performance_json = $2 where id = $1", [missionId, JSON.stringify(performance)]);

  const refreshed = await getMissionByIdFromPostgres(missionId, client);
  return refreshed
    ? {
        ...refreshed,
        marketTokens: snapshot.marketTokens,
        circulatingTokens: snapshot.circulatingTokens,
        baseReserve: snapshot.baseReserve,
        quoteReserve: snapshot.quoteReserve,
        poolProgressPercent: "poolProgressPercent" in snapshot ? snapshot.poolProgressPercent : undefined,
        treasuryAllocationClaimed: "treasuryAllocationClaimed" in snapshot ? snapshot.treasuryAllocationClaimed : undefined,
        marketDataUpdatedAt: snapshot.updatedAt,
      }
    : refreshed;
}

async function requestRows(missionIds: string[], client?: Queryable) {
  if (missionIds.length === 0) return new Map<string, FundingRequest[]>();

  const reader = client || { query };
  const result = await reader.query<FundingRequestRow>(
    `
      select
        fr.*,
        count(*) filter (where frv.vote = 'approve') as approvals,
        count(*) filter (where frv.vote = 'reject') as rejections
      from funding_requests fr
      left join funding_request_votes frv on frv.request_id = fr.id
      where fr.mission_id = any($1)
      group by fr.id
      order by fr.created_at desc
    `,
    [missionIds],
  );
  await hydrateFundingRequestExecutionState(result.rows, client);
  const [voteRows, councilRows] = await Promise.all([
    reader.query<FundingRequestVoteRow>(
      "select request_id, voter_wallet, vote from funding_request_votes where request_id = any($1::text[])",
      [result.rows.map((row) => row.id)],
    ),
    reader.query<{ mission_id: string; epoch_number: number; member_wallets: unknown; escrow_amounts: unknown }>(
      "select mission_id, epoch_number, member_wallets, escrow_amounts from epoch_councils where mission_id = any($1::text[])",
      [missionIds],
    ),
  ]);
  const votesByRequest = new Map<string, Map<string, "approve" | "reject">>();
  for (const vote of voteRows.rows) {
    const requestVotes = votesByRequest.get(vote.request_id) || new Map<string, "approve" | "reject">();
    requestVotes.set(vote.voter_wallet.toLowerCase(), vote.vote);
    votesByRequest.set(vote.request_id, requestVotes);
  }
  const councilByMissionEpoch = new Map<string, { members: string[]; amounts: string[] }>();
  for (const council of councilRows.rows) {
    const members = Array.isArray(council.member_wallets) ? council.member_wallets.map(String) : [];
    const amounts = Array.isArray(council.escrow_amounts) ? council.escrow_amounts.map(String) : [];
    councilByMissionEpoch.set(`${council.mission_id}:${council.epoch_number}`, { members, amounts });
  }
  const profileAddresses = Array.from(
    new Set([
      ...result.rows.map((row) => row.requester_wallet),
      ...Array.from(councilByMissionEpoch.values()).flatMap((council) => council.members),
    ]),
  );
  const profiles = await reader.query<Pick<ProfileRow, "wallet_address" | "display_name" | "avatar_url" | "bio">>(
    "select wallet_address, display_name, avatar_url, bio from profiles where wallet_address = any($1::text[])",
    [profileAddresses],
  );
  const profilesByWallet = new Map(profiles.rows.map((profile) => [profile.wallet_address.toLowerCase(), profile]));

  const byMission = new Map<string, FundingRequest[]>();

  for (const row of result.rows) {
    const list = byMission.get(row.mission_id) || [];
    const epochCouncil = councilByMissionEpoch.get(`${row.mission_id}:${Number(row.epoch_number ?? 1)}`);
    const requestVotes = votesByRequest.get(row.id) || new Map<string, "approve" | "reject">();
    const councillors = epochCouncil?.members.map((address, index) => {
      const profile = profilesByWallet.get(address.toLowerCase());
      return {
        address,
        name: profile?.display_name || shortWallet(address),
        avatar: profile?.avatar_url || "",
        tokens: Number(epochCouncil.amounts[index] || 0),
        vote: requestVotes.get(address.toLowerCase()),
      };
    });
    list.push(rowToRequest(row, profilesByWallet.get(row.requester_wallet.toLowerCase()), councillors));
    byMission.set(row.mission_id, list);
  }

  return byMission;
}

export async function listMissionsFromPostgres(options: { q?: string; sort?: MissionSort; includeDetails?: boolean; limit?: number; offset?: number }) {
  const values: unknown[] = [];
  const where: string[] = [];
  const queryText = options.q?.trim();

  if (queryText) {
    values.push(`%${queryText}%`);
    where.push("(m.statement ilike $1 or m.description ilike $1 or m.token_symbol ilike $1)");
  }

  const demoSortPrefix = `case when lower(m.creator_wallet) = lower('${DEMO_CREATOR_WALLET}') then 1 else 0 end asc`;
  const primaryOrder =
    options.sort === "most-holders"
      ? "coalesce(mm.holders, 0) desc, m.id asc"
      : options.sort === "newest"
        ? "m.created_at desc, m.id asc"
        : "coalesce(mm.liquidity_usdc, 0) desc, m.id asc";
  const orderBy = `${demoSortPrefix}, ${primaryOrder}`;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const offset = Math.max(Math.floor(options.offset ?? 0), 0);
  let pagination = "";

  if (limit) {
    values.push(limit);
    pagination += ` limit $${values.length}`;
  }

  if (offset) {
    values.push(offset);
    pagination += ` offset $${values.length}`;
  }

  const result = await query<MissionRow>(
    `
      select
        m.*,
        mm.token_price_usdc,
        mm.holders,
        mm.liquidity_usdc,
        mm.treasury_usdc,
        mm.treasury_tokens,
        mm.market_tokens,
        mm.circulating_tokens,
        mm.base_reserve,
        mm.quote_reserve,
        mm.pool_progress_percent,
        mm.treasury_allocation_claimed,
        mm.market_data_updated_at
      from missions m
      left join mission_metrics mm on mm.mission_id = m.id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by ${orderBy}
      ${pagination}
    `,
    values,
  );
  if (!options.includeDetails) {
    return result.rows.map((row) => rowToMission(row, []));
  }

  const requestsByMission = await requestRows(result.rows.map((row) => row.id));
  const candidatesByMission = await councilCandidateRows(result.rows.map((row) => row.id));
  const councilByMission = await Promise.all(
    result.rows.map((row) => candidateRowsToCouncil(row, candidatesByMission.get(row.id) || [])),
  );

  return result.rows.map((row, index) =>
    rowToMission(
      {
        ...row,
        council_json: councilByMission[index],
      },
      requestsByMission.get(row.id) || [],
    ),
  );
}

export async function getMissionByIdFromPostgres(missionId: string, client?: Queryable) {
  const result = await (client || { query }).query<MissionRow>(
    `
      select
        m.*,
        mm.token_price_usdc,
        mm.holders,
        mm.liquidity_usdc,
        mm.treasury_usdc,
        mm.treasury_tokens,
        mm.market_tokens,
        mm.circulating_tokens,
        mm.base_reserve,
        mm.quote_reserve,
        mm.pool_progress_percent,
        mm.treasury_allocation_claimed,
        mm.market_data_updated_at
      from missions m
      left join mission_metrics mm on mm.mission_id = m.id
      where m.id = $1
      limit 1
    `,
    [missionId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const requestsByMission = await requestRows([missionId], client);
  const candidatesByMission = await councilCandidateRows([missionId], client);
  const councilJson = await candidateRowsToCouncil(row, candidatesByMission.get(missionId) || [], client);
  return rowToMission(
    {
      ...row,
      council_json: councilJson,
    },
    requestsByMission.get(missionId) || [],
  );
}

export async function getProfileFromPostgres(address: string, options: { includeBalances?: boolean } = {}) {
  const normalizedAddress = address === "me" ? currentUser.address : address;
  const result = await query<ProfileRow>("select * from profiles where wallet_address = $1 limit 1", [normalizedAddress]);
  const row = result.rows[0];
  const createdMissionEntries = await createdMissionFeeRows(normalizedAddress);
  if (options.includeBalances === false) {
    if (!row) return { ...emptyProfile(normalizedAddress), createdMissions: createdMissionEntries };
    return {
      name: row.display_name,
      address: row.wallet_address,
      avatar: row.avatar_url || "",
      description: row.bio || "",
      socials: row.socials || [],
      ...emptyWalletBalanceSnapshot(),
      createdMissions: createdMissionEntries,
      submittedRequests: [],
      councilRequests: [],
    };
  }

  const allMissions = await listMissionsFromPostgres({ sort: "highest-liquidity", includeDetails: true });
  const balances = await walletBalances(normalizedAddress, allMissions);
  const escrowedByMission = await escrowedVoteBalancesByMission(allMissions.map((mission) => mission.id));
  const tokenBalances = balances.tokenBalances.map((entry) => {
    const escrow = escrowedByMission.get(entry.missionId)?.get(normalizedAddress.toLowerCase());
    return {
      ...entry,
      escrowedUnlocksAt: escrow?.lockedUntil || null,
      mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
    };
  });

  const createdMissions = createdMissionEntries.map((entry) => ({
    ...entry,
    mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
  }));

  if (!row) {
    return { ...emptyProfile(normalizedAddress), balances: balances.balances, tokenBalances, createdMissions };
  }

  const councilMissionIds = new Set(tokenBalances.filter((entry) => entry.council).map((entry) => entry.missionId));
  const submittedRequests = allMissions.flatMap((mission) =>
    mission.requests
      .filter((request) => request.requester === row.wallet_address || request.requester === row.display_name)
      .map((request) => ({ request, symbol: mission.tokenSymbol })),
  );
  const councilRequests = allMissions.flatMap((mission) =>
    councilMissionIds.has(mission.id)
      ? mission.requests.filter((request) => request.status === "active").map((request) => ({ request, symbol: mission.tokenSymbol }))
      : [],
  );

  return {
    name: row.display_name,
    address: row.wallet_address,
    avatar: row.avatar_url || "",
    description: row.bio || "",
    socials: row.socials || [],
    balances: balances.balances,
    tokenBalances,
    createdMissions,
    submittedRequests,
    councilRequests,
  };
}

export async function updateProfileInPostgres(input: { address: string; name?: string; description?: string; avatar?: string; socials?: string[] }) {
  await query<ProfileRow>(
    `
      insert into profiles (wallet_address, display_name, avatar_url, bio, socials)
      values ($1, $2, $3, $4, $5)
      on conflict (wallet_address) do update set
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        bio = excluded.bio,
        socials = excluded.socials,
        updated_at = now()
      returning *
    `,
    [input.address, input.name?.trim() ?? "", input.avatar?.trim() || null, input.description?.trim() || null, JSON.stringify(input.socials || [])],
  );

  return getProfileFromPostgres(input.address);
}

export async function prepareMissionLaunchInPostgres(input: {
  creatorWallet?: string;
  statement?: string;
  description?: string;
  tokenSymbol?: string;
  missionImage?: string;
  tokenImage?: string;
  initialPurchaseUsdc?: number;
  initialMarketCap?: number;
  migrationMarketCap?: number;
  socials?: MissionSocials;
  sponsorFees?: boolean;
}) {
  const { statement, description, tokenSymbol, initialPurchaseUsdc } = validateMissionLaunchInput(input);
  const socials = validateMissionSocials(input.socials);

  const idBase = slugify(statement);
  const id = `${idBase}-${randomBytes(2).toString("hex")}`;
  const seed = fixtureMissions[0];
  const creatorWallet = input.creatorWallet || currentUser.address;
  const publishedMetadata = await publishMissionTokenMetadata({
    creatorWallet,
    missionId: id,
    statement,
    tokenSymbol,
    description,
    tokenImage: input.tokenImage,
    missionImage: input.missionImage,
  });
  const metadataHash = publishedMetadata.hash;
  const metadataUri = publishedMetadata.onChainUri;
  const metadataStorageUri = publishedMetadata.storageUri;
  const launchConfig = resolveMissionLaunchConfig({
    initialPurchaseUsdc,
    initialMarketCap: input.initialMarketCap,
    migrationMarketCap: input.migrationMarketCap,
  });
  const tokenPrice = launchConfig.initialMarketCap / launchConfig.totalSupply;
  const treasuryTokens = Math.floor((launchConfig.totalSupply * launchConfig.treasurySupplyPercent) / 100);
  const launchTransaction = await prepareLaunchTransaction({
    creatorWallet: input.creatorWallet,
    missionId: id,
    metadataHash,
    metadataUri,
    tokenName: tokenSymbol,
    tokenSymbol,
    totalSupply: launchConfig.totalSupply,
    initialPurchaseUsdc: launchConfig.initialPurchaseUsdc,
    initialMarketCap: launchConfig.initialMarketCap,
    migrationMarketCap: launchConfig.migrationMarketCap,
    sponsorFees: input.sponsorFees,
  });
  const launchAccounts = {
    ...("accounts" in launchTransaction ? launchTransaction.accounts || {} : {}),
    ...("sponsorFees" in launchTransaction && launchTransaction.sponsorFees ? { sponsorFees: true } : {}),
  };
  const mission: Mission = {
    id,
    missionPda: launchAccountString(launchAccounts, "mission"),
    statement,
    description,
    socials,
    image: input.missionImage || seed.image,
    tokenImage: input.tokenImage || seed.tokenImage,
    tokenSymbol,
    tokenMint: launchAccountString(launchAccounts, "tokenMint"),
    dbcPool: launchAccountString(launchAccounts, "dbcPool"),
    treasuryVault: launchAccountString(launchAccounts, "treasuryVault"),
    lifecycle: "draft",
    tokenPrice,
    holders: 1,
    liquidity: launchConfig.initialPurchaseUsdc,
    treasuryUsdc: 0,
    treasuryTokens,
    treasurySupplyPercent: launchConfig.treasurySupplyPercent,
    totalSupply: launchConfig.totalSupply,
    performance: launchPerformance,
    council: [],
    requests: [],
  };

  if (launchTransaction.status === "ready") {
    await query(
      "insert into metadata_uploads (hash, uri, owner_wallet, content_type) values ($1, $2, $3, 'application/json') on conflict (hash) do update set uri = excluded.uri",
      [metadataHash, metadataStorageUri, creatorWallet],
    );
    await query(
      `
        insert into pending_mission_launches (
          id, creator_wallet, metadata_hash, metadata_uri, statement, description,
          image_url, token_image_url, token_symbol, total_supply, treasury_supply_percent,
          initial_purchase_usdc, launch_accounts, socials
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 20, $11, $12, $13)
      `,
      [
        id,
        creatorWallet,
        metadataHash,
        metadataUri,
        statement,
        description,
        mission.image,
        mission.tokenImage,
        tokenSymbol,
        launchConfig.totalSupply,
        launchConfig.initialPurchaseUsdc,
        JSON.stringify(launchAccounts),
        JSON.stringify(socials),
      ],
    );
  }

  return {
    launchId: launchTransaction.status === "ready" ? id : null,
    mission,
    metadataHash,
    metadataUri,
    transaction: launchTransaction,
  };
}

export async function refreshMissionLaunchTransactionInPostgres(input: {
  launchId?: string;
  wallet?: string;
  sponsorFees?: boolean;
}) {
  if (!input.launchId) throw new Error("launchId is required.");
  const wallet = input.wallet || currentUser.address;
  const pendingResult = await query<PendingMissionLaunchRow>(
    "select * from pending_mission_launches where id = $1 and creator_wallet = $2 and status = 'prepared' limit 1",
    [input.launchId, wallet],
  );
  const pending = pendingResult.rows[0];
  if (!pending) throw new Error("Pending mission launch not found.");

  const accounts = pending.launch_accounts || {};
  const sponsorFees = input.sponsorFees ?? Boolean((accounts as { sponsorFees?: boolean }).sponsorFees);
  const launchSignerSecrets = Array.isArray(accounts.launchSignerSecrets)
    ? accounts.launchSignerSecrets.filter((value): value is string => typeof value === "string")
    : [];
  if (launchSignerSecrets.length < 2) {
    throw new Error("Launch signer secrets are missing for this pending mission.");
  }

  const launchConfig = resolveMeteoraDbcLaunchConfig({
    totalSupply: Number(pending.total_supply || DEFAULT_DBC_TOTAL_SUPPLY),
    initialPurchaseUsdc: Number(pending.initial_purchase_usdc || 0),
  });
  const launchTransaction = await prepareLaunchTransaction({
    creatorWallet: pending.creator_wallet,
    missionId: pending.id,
    metadataHash: pending.metadata_hash,
    metadataUri: pending.metadata_uri,
    tokenName: pending.token_symbol,
    tokenSymbol: pending.token_symbol,
    totalSupply: launchConfig.totalSupply,
    initialPurchaseUsdc: launchConfig.initialPurchaseUsdc,
    launchSignerSecrets,
    sponsorFees,
  });
  if (launchTransaction.status !== "ready") {
    throw new Error(launchTransaction.status === "not_configured" ? launchTransaction.message : "Launch transaction refresh failed.");
  }

  const launchAccounts = {
    ...("accounts" in launchTransaction ? launchTransaction.accounts || {} : {}),
    ...("sponsorFees" in launchTransaction && launchTransaction.sponsorFees ? { sponsorFees: true } : {}),
  };
  await query("update pending_mission_launches set launch_accounts = $1 where id = $2 and status = 'prepared'", [
    JSON.stringify(launchAccounts),
    pending.id,
  ]);

  return { launchId: pending.id, transaction: launchTransaction };
}

export async function confirmMissionLaunchInPostgres(input: { launchId?: string; signature?: string; wallet?: string }) {
  if (!input.launchId) throw new Error("launchId is required.");
  if (!input.signature) throw new Error("signature is required.");
  if (!input.wallet) throw new Error("wallet is required.");
  await assertSuccessfulOnchainTransaction(input.signature);

  const confirmed = await transaction(async (client) => {
    const pendingResult = await client.query<PendingMissionLaunchRow>(
      "select * from pending_mission_launches where id = $1 and creator_wallet = $2 and status = 'prepared' for update",
      [input.launchId, input.wallet],
    );
    const pending = pendingResult.rows[0];
    if (!pending) throw new Error("Pending mission launch not found.");

    const accounts = pending.launch_accounts || {};
    const launchConfig = resolveMeteoraDbcLaunchConfig({
      totalSupply: Number(pending.total_supply || DEFAULT_DBC_TOTAL_SUPPLY),
      initialPurchaseUsdc: Number(pending.initial_purchase_usdc || 0),
    });
    const tokenPrice = launchConfig.initialMarketCap / launchConfig.totalSupply;
    const treasuryTokens = Math.floor((launchConfig.totalSupply * Number(pending.treasury_supply_percent || 20)) / 100);
    await client.query(
      `
        insert into missions (
          id, mission_pda, creator_wallet, token_mint, dbc_pool, treasury_vault,
          lifecycle_state, metadata_hash, statement, description,
          image_url, token_image_url, token_symbol, total_supply, treasury_supply_percent,
          performance_json, council_json, socials
        )
        values ($1, $2, $3, $4, $5, $6, 'bonding', $7, $8, $9, $10, $11, $12, $13, $14, $15, '[]'::jsonb, $16)
      `,
      [
        pending.id,
        launchAccountString(accounts, "mission"),
        pending.creator_wallet,
        launchAccountString(accounts, "tokenMint"),
        launchAccountString(accounts, "dbcPool"),
        launchAccountString(accounts, "treasuryVault"),
        pending.metadata_hash,
        pending.statement,
        pending.description,
        pending.image_url,
        pending.token_image_url,
        pending.token_symbol,
        pending.total_supply,
        pending.treasury_supply_percent,
        JSON.stringify(launchPerformance),
        JSON.stringify(normalizeMissionSocials(pending.socials)),
      ],
    );
    await client.query(
      `
        insert into mission_metrics (mission_id, token_price_usdc, holders, liquidity_usdc, treasury_usdc, treasury_tokens)
        values ($1, $2, 1, $3, 0, $4)
      `,
      [pending.id, tokenPrice, Number(pending.initial_purchase_usdc || 0), treasuryTokens],
    );
    await client.query(
      "insert into metadata_uploads (hash, uri, owner_wallet, content_type) values ($1, $2, $3, 'application/json') on conflict (hash) do nothing",
      [pending.metadata_hash, pending.metadata_uri, pending.creator_wallet],
    );
    await client.query(
      "insert into transactions (signature, wallet, mission_id, type, status) values ($1, $2, $3, 'mission-launch', 'submitted') on conflict (signature) do nothing",
      [input.signature, pending.creator_wallet, pending.id],
    );
    await client.query("update pending_mission_launches set status = 'submitted', signature = $1, confirmed_at = now() where id = $2", [input.signature, pending.id]);

    const mission = await getMissionByIdFromPostgres(pending.id, client);
    if (!mission) throw new Error("Mission launch confirmation failed.");
    return { mission };
  });

  const refreshed = await refreshMissionMarketDataInPostgres(confirmed.mission.id).catch(() => null);
  return { mission: refreshed || confirmed.mission };
}

async function getMissionTradeContextFromPostgres(missionId: string) {
  const cached = missionTradeContextCache.get(missionId);
  if (cached && Date.now() - cached.cachedAt < MISSION_TRADE_CONTEXT_CACHE_TTL_MS) return cached.mission;
  const inflight = missionTradeContextInflight.get(missionId);
  if (inflight) return inflight;

  const promise = query<MissionTradeContextRow>(
      `
        select m.id, m.token_mint, m.dbc_pool, m.damm_pool, m.lifecycle_state, mm.token_price_usdc
        from missions m
        left join mission_metrics mm on mm.mission_id = m.id
        where m.id = $1
        limit 1
      `,
      [missionId],
    )
    .then((result) => {
      const mission = result.rows[0] || null;
      if (mission) missionTradeContextCache.set(missionId, { mission, cachedAt: Date.now() });
      return mission;
    })
    .finally(() => missionTradeContextInflight.delete(missionId));
  missionTradeContextInflight.set(missionId, promise);
  return promise;
}

export async function quoteMissionTradeFromPostgres(missionId: string, input: { side?: string; amount?: number; wallet?: string; slippageBps?: number }) {
  const mission = await getMissionTradeContextFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  const amount = Math.max(Number(input.amount) || 0, 0);
  const side = input.side === "sell" ? "sell" : "buy";
  const lifecycle = mission.lifecycle_state || "draft";
  const isBondingDbc = lifecycle === "bonding" && Boolean(mission.dbc_pool) && !mission.damm_pool;
  const chainQuote = isBondingDbc
    ? await prepareMeteoraDbcTradeTransaction({
        wallet: input.wallet,
        side,
        amount,
        dbcPool: mission.dbc_pool,
        slippageBps: input.slippageBps,
      })
    : await prepareMeteoraDammV2TradeTransaction({
        wallet: input.wallet,
        side,
        amount,
        dammPool: mission.damm_pool,
        tokenMint: mission.token_mint,
        quoteMint: process.env.SINGULARITY_USDC_MINT,
        slippageBps: input.slippageBps,
        referencePrice: num(mission.token_price_usdc),
      });

  return {
    missionId,
    side,
    route: "route" in chainQuote ? chainQuote.route : lifecycle === "graduated" ? "amm" : "bonding-curve",
    inputAmount: "inputAmount" in chainQuote ? chainQuote.inputAmount : amount,
    requestedInputAmount: "requestedInputAmount" in chainQuote ? chainQuote.requestedInputAmount : undefined,
    partialFill: "partialFill" in chainQuote ? chainQuote.partialFill : undefined,
    willGraduate: "willGraduate" in chainQuote ? chainQuote.willGraduate : undefined,
    estimatedOutput: "estimatedOutput" in chainQuote ? chainQuote.estimatedOutput : 0,
    minimumAmountOut: "minimumAmountOut" in chainQuote ? chainQuote.minimumAmountOut : null,
    priceImpactPercent: "priceImpactPercent" in chainQuote ? chainQuote.priceImpactPercent : null,
    currentPrice: "currentPrice" in chainQuote ? chainQuote.currentPrice : num(mission.token_price_usdc),
    market: {
      lifecycle,
      dbcPool: mission.dbc_pool || null,
      dammPool: mission.damm_pool || null,
      ...("market" in chainQuote ? chainQuote.market : {}),
    },
    transaction: "transaction" in chainQuote ? chainQuote.transaction : chainQuote,
  };
}

export async function prepareMissionGraduationInPostgres(
  missionId: string,
  input: {
    authorityWallet?: string;
    dammPool?: string;
  },
) {
  if (!input.dammPool) throw new Error("dammPool is required.");
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  await query(
    `
      update missions
      set damm_pool = $2, lifecycle_state = 'graduated'
      where id = $1
    `,
    [missionId, input.dammPool],
  );
  await query(
    `
      update migration_reconciliation_jobs
      set damm_pool = $2, status = 'submitted', updated_at = now()
      where mission_id = $1 and status in ('pending', 'failed')
    `,
    [missionId, input.dammPool],
  );

  return {
    mission: {
      ...mission,
      dammPool: input.dammPool,
      lifecycle: "graduated" as const,
    },
    transaction: await prepareMissionGraduationTransaction({
      authorityWallet: input.authorityWallet || currentUser.address,
      missionId,
      dammPool: input.dammPool,
    }),
  };
}

export async function prepareMissionMarketGraduationInPostgres(missionId: string, input: { wallet?: string }) {
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);
  if (!mission.dbcPool) throw new Error("This mission does not have a bonding-curve pool to graduate.");
  if (mission.dammPool) {
    return {
      mission,
      dammPool: mission.dammPool,
      transaction: {
        kind: "mission-market-graduation",
        status: "not_configured" as const,
        message: "This market has already graduated.",
        instructions: [],
      },
    };
  }

  const result = await prepareMissionMarketGraduationTransaction({ wallet: input.wallet || currentUser.address, dbcPool: mission.dbcPool });
  return {
    mission,
    dammPool: "dammPool" in result ? result.dammPool : null,
    transaction: "transaction" in result ? result.transaction : result,
  };
}

export async function confirmMissionMarketGraduationInPostgres(missionId: string, input: { signature?: string; dammPool?: string; wallet?: string }) {
  if (!input.signature) throw new Error("signature is required.");
  if (!input.dammPool) throw new Error("dammPool is required.");
  await assertSuccessfulOnchainTransaction(input.signature);
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  await query(
    `
      update missions
      set damm_pool = $2, lifecycle_state = 'graduated'
      where id = $1
    `,
    [missionId, input.dammPool],
  );
  await query(
    `
      insert into transactions (signature, wallet, mission_id, type, status)
      values ($1, $2, $3, 'mission-market-graduation', 'submitted')
      on conflict (signature) do nothing
    `,
    [input.signature, input.wallet || currentUser.address, missionId],
  );
  await query(
    `
      update migration_reconciliation_jobs
      set damm_pool = $2, signature = coalesce(signature, $3), status = 'submitted', updated_at = now()
      where mission_id = $1 and status in ('pending', 'failed')
    `,
    [missionId, input.dammPool, input.signature],
  );
  await syncDammFeePositionsInPostgres(missionId, { dammPool: input.dammPool, signature: input.signature }).catch((error) => {
    const message = error instanceof Error ? error.message : "Could not sync DAMM fee positions.";
    console.error("DAMM fee position sync failed", { missionId, error: message });
  });

  const refreshed = await getMissionByIdFromPostgres(missionId);
  if (!refreshed) throw new Error(`Mission not found: ${missionId}`);
  return { mission: refreshed };
}

export async function prepareMissionTreasuryAllocationClaimInPostgres(missionId: string, input: { wallet?: string }) {
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);
  if (!mission.dbcPool) throw new Error("This mission does not have a bonding-curve pool.");
  if (mission.lifecycle !== "graduated") throw new Error("This mission must graduate before claiming the treasury allocation.");

  const result = await prepareMissionTreasuryAllocationClaimTransaction({ wallet: input.wallet || currentUser.address, dbcPool: mission.dbcPool });
  return {
    mission,
    treasuryVault: "treasuryVault" in result ? result.treasuryVault : mission.treasuryVault || null,
    transaction: "transaction" in result ? result.transaction : result,
  };
}

export async function confirmMissionTreasuryAllocationClaimInPostgres(missionId: string, input: { signature?: string; wallet?: string }) {
  if (!input.signature) throw new Error("signature is required.");
  await assertSuccessfulOnchainTransaction(input.signature);
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  await query(
    `
      insert into transactions (signature, wallet, mission_id, type, status)
      values ($1, $2, $3, 'mission-treasury-allocation-claim', 'submitted')
      on conflict (signature) do nothing
    `,
    [input.signature, input.wallet || currentUser.address, missionId],
  );

  const refreshed =
    (await refreshMissionMarketDataInPostgres(missionId, { query: query as unknown as Queryable["query"] })) ||
    (await getMissionByIdFromPostgres(missionId));
  if (!refreshed) throw new Error(`Mission not found: ${missionId}`);
  return { mission: refreshed };
}

async function syncDammFeePositionsInPostgres(missionId: string, input: { dammPool?: string | null; signature?: string | null }) {
  if (!input.dammPool || !input.signature) return [];
  const positions = await recoverDammV2FeePositions({ dammPool: input.dammPool, signature: input.signature });
  for (const position of positions) {
    await query(
      `
        insert into mission_damm_fee_positions (
          position_nft_mint,
          mission_id,
          damm_pool,
          position_account,
          position_nft_account,
          owner_wallet,
          source_signature
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (position_nft_mint) do update set
          mission_id = excluded.mission_id,
          damm_pool = excluded.damm_pool,
          position_account = excluded.position_account,
          position_nft_account = excluded.position_nft_account,
          owner_wallet = excluded.owner_wallet,
          source_signature = coalesce(mission_damm_fee_positions.source_signature, excluded.source_signature),
          updated_at = now()
      `,
      [position.positionNftMint, missionId, input.dammPool, position.position, position.positionNftAccount, position.owner, input.signature],
    );
  }
  return positions;
}

async function ensureDammFeePositionsForMission(missionId: string, dammPool: string) {
  const existing = await query<{ count: string }>("select count(*) from mission_damm_fee_positions where mission_id = $1", [missionId]);
  if (Number(existing.rows[0]?.count || 0) > 0) return;
  const graduation = await query<{ signature: string }>(
    "select signature from transactions where mission_id = $1 and type = 'mission-market-graduation' order by created_at desc limit 1",
    [missionId],
  );
  await syncDammFeePositionsInPostgres(missionId, { dammPool, signature: graduation.rows[0]?.signature });
}

async function getBackendOwnedDammFeePositions(missionId: string) {
  const distributorWallet = process.env.SINGULARITY_FEE_DISTRIBUTOR_PUBKEY?.trim() || null;
  const result = await query<{
    position_nft_mint: string;
    position_account: string;
    position_nft_account: string;
    owner_wallet: string;
  }>(
    `
      select position_nft_mint, position_account, position_nft_account, owner_wallet
      from mission_damm_fee_positions
      where mission_id = $1
        and ($2::text is null or owner_wallet = $2)
      order by created_at asc
    `,
    [missionId, distributorWallet || null],
  );
  return result.rows.map((row) => ({
    positionNftMint: row.position_nft_mint,
    position: row.position_account,
    positionNftAccount: row.position_nft_account,
    owner: row.owner_wallet,
  }));
}

async function nextRewardEpochNumber(missionId: string) {
  const result = await query<{ epoch_number: number | null }>("select coalesce(max(epoch_number), 0) + 1 as epoch_number from reward_epochs where mission_id = $1", [missionId]);
  return Number(result.rows[0]?.epoch_number || 1);
}

async function recordFeeDistributionRewardEpoch(input: {
  missionId: string;
  sourceAmount: string;
  creatorAmount: string;
  platformAmount: string;
}) {
  const sourceAmount = tokenBaseUnitsToDecimalString(input.sourceAmount);
  const creatorAmount = tokenBaseUnitsToDecimalString(input.creatorAmount);
  const platformAmount = tokenBaseUnitsToDecimalString(input.platformAmount);
  const epochNumber = await nextRewardEpochNumber(input.missionId);

  await query(
    `
      insert into reward_epochs (
        mission_id,
        epoch_number,
        source_usdc_amount,
        creator_amount,
        platform_amount,
        council_amount,
        other_lockers_amount
      )
      values ($1, $2, $3, $4, $5, 0, 0)
      on conflict (mission_id, epoch_number) do nothing
    `,
    [input.missionId, epochNumber, sourceAmount, creatorAmount, platformAmount],
  );
}

export async function distributeMissionFeesInPostgres(input: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(input.limit || 50, 100));
  const result = await query<{
    id: string;
    creator_wallet: string;
    token_mint: string | null;
    dbc_pool: string;
    damm_pool: string | null;
  }>(
    `
      select id, creator_wallet, token_mint, dbc_pool, damm_pool
      from missions
      where lifecycle_state in ('bonding', 'graduated')
        and dbc_pool is not null
      order by created_at asc
      limit $1
    `,
    [limit],
  );

  const missions = result.rows;
  const results = [];
  for (const mission of missions) {
    try {
      const distribution = await submitBackendMissionFeeDistribution({
        missionId: mission.id,
        creatorWallet: mission.creator_wallet,
        dbcPool: mission.dbc_pool,
      });
      if (distribution.distributionSignature) {
        await query(
          "insert into transactions (signature, wallet, mission_id, type, status) values ($1, $2, $3, 'mission-fee-distribution', 'confirmed') on conflict (signature) do nothing",
          [distribution.distributionSignature, process.env.SINGULARITY_FEE_DISTRIBUTOR_PUBKEY || "backend-fee-distributor", mission.id],
        );
        await recordFeeDistributionRewardEpoch({
          missionId: mission.id,
          sourceAmount: distribution.distributedAmount,
          creatorAmount: distribution.creatorAmount,
          platformAmount: distribution.platformAmount,
        });
      }
      results.push(distribution);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mission fee distribution failed.";
      console.error("Mission fee distribution failed", { missionId: mission.id, error: message });
      results.push({ status: "failed" as const, missionId: mission.id, error: message });
    }

    if (mission.damm_pool && mission.token_mint) {
      try {
        await ensureDammFeePositionsForMission(mission.id, mission.damm_pool);
        const positions = await getBackendOwnedDammFeePositions(mission.id);
        const distribution = await submitBackendDammV2FeeDistribution({
          missionId: mission.id,
          creatorWallet: mission.creator_wallet,
          tokenMint: mission.token_mint,
          dammPool: mission.damm_pool,
          positions,
        });
        if (distribution.distributionSignature) {
          await query(
            "insert into transactions (signature, wallet, mission_id, type, status) values ($1, $2, $3, 'mission-fee-distribution', 'confirmed') on conflict (signature) do nothing",
            [distribution.distributionSignature, process.env.SINGULARITY_FEE_DISTRIBUTOR_PUBKEY || "backend-fee-distributor", mission.id],
          );
          await recordFeeDistributionRewardEpoch({
            missionId: mission.id,
            sourceAmount: distribution.distributedAmount,
            creatorAmount: distribution.creatorAmount,
            platformAmount: distribution.platformAmount,
          });
        }
        results.push(distribution);
      } catch (error) {
        const message = error instanceof Error ? error.message : "DAMM fee distribution failed.";
        console.error("DAMM fee distribution failed", { missionId: mission.id, error: message });
        results.push({ status: "failed" as const, missionId: mission.id, source: "damm-v2" as const, error: message });
      }
    }
  }

  return {
    checked: missions.length,
    distributed: results.filter((entry) => entry.status === "distributed").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    results,
  };
}

async function getMissionCreatorWallet(missionId: string) {
  const result = await query<{ creator_wallet: string }>("select creator_wallet from missions where id = $1", [missionId]);
  return result.rows[0]?.creator_wallet || null;
}

export async function prepareFundingRequestInPostgres(input: {
  missionId?: string;
  requesterWallet?: string;
  name?: string;
  description?: string;
  amountUsd?: number;
}) {
  if (!input.missionId) throw new Error("missionId is required.");
  const mission = await getMissionByIdFromPostgres(input.missionId);
  if (!mission) throw new Error(`Mission not found: ${input.missionId}`);

  const name = input.name?.trim();
  const description = input.description?.trim();
  const amountUsd = Math.max(Number(input.amountUsd) || 0, 0);
  if (!name) throw new Error("Request name is required.");
  if (!description) throw new Error("Request description is required.");
  if (amountUsd <= 0) throw new Error("Request amount must be greater than zero.");
  if (!Number.isFinite(mission.tokenPrice) || mission.tokenPrice <= 0) throw new Error("Mission token price is not available yet.");
  const council = await refreshMissionCouncilFromTopHoldersInPostgres(mission);
  if (council.length < 6) {
    throw new Error("This mission does not have 6 eligible token holders yet. At least 6 holders are required before funding requests can open.");
  }
  const escrowAmounts = councilEscrowAmounts(council);
  // Re-checked on every funding request: if the top-6 holders + their escrow amounts changed since the
  // last finalized council, allocate a new epoch and submit `finalize_epoch_council` on chain.
  const { epoch } = await selectOrFinalizeEpochCouncil({ mission, candidates: council, escrowAmounts });

  const tokenAmount = amountUsd / mission.tokenPrice;
  const id = `${mission.id}-r-${randomBytes(4).toString("hex")}`;
  const requesterWallet = input.requesterWallet || currentUser.address;
  const metadataHash = contentHash({ name, description, tokenAmount, amountUsd, requesterWallet });
  const requestPdaAddress = fundingRequestPda({
    registryProgramId: process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
    councilProgramId: process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
    missionId: mission.id,
    metadataHash,
  });

  const requestRow: FundingRequestRow = {
    id,
    request_pda: requestPdaAddress,
    mission_id: mission.id,
    requester_wallet: requesterWallet,
    recipient_wallet: requesterWallet,
    mission_token_amount: String(tokenAmount),
    derived_usd_estimate: String(amountUsd),
    status: "active",
    metadata_hash: metadataHash,
    title: name,
    description,
    epoch_number: epoch,
    approvals: "0",
    rejections: "0",
    executed_at: null,
  };

  return {
    request: rowToRequest(requestRow),
    metadataHash,
    epochNumber: epoch,
    transaction: await prepareFundingRequestTransaction({
      requesterWallet,
      missionId: mission.id,
      requestId: id,
      metadataHash,
      recipientWallet: requesterWallet,
      tokenAmount: tokenAmount * 1_000_000,
      tokenMint: mission.tokenMint,
      epoch,
    }),
  };
}

export async function confirmFundingRequestInPostgres(input: {
  requestId?: string;
  missionId?: string;
  requesterWallet?: string;
  name?: string;
  description?: string;
  amountUsd?: number;
  metadataHash?: string;
  epochNumber?: number;
  signature?: string;
}) {
  if (!input.requestId) throw new Error("requestId is required.");
  if (!input.missionId) throw new Error("missionId is required.");
  if (!input.signature) throw new Error("signature is required.");
  await assertSuccessfulOnchainTransaction(input.signature);

  const mission = await getMissionByIdFromPostgres(input.missionId);
  if (!mission) throw new Error(`Mission not found: ${input.missionId}`);

  const name = input.name?.trim();
  const description = input.description?.trim();
  const amountUsd = Math.max(Number(input.amountUsd) || 0, 0);
  const requesterWallet = input.requesterWallet || currentUser.address;
  if (!name) throw new Error("Request name is required.");
  if (!description) throw new Error("Request description is required.");
  if (amountUsd <= 0) throw new Error("Request amount must be greater than zero.");
  if (!Number.isFinite(mission.tokenPrice) || mission.tokenPrice <= 0) throw new Error("Mission token price is not available yet.");

  const tokenAmount = amountUsd / mission.tokenPrice;
  const metadataHash = input.metadataHash || contentHash({ name, description, tokenAmount, amountUsd, requesterWallet });
  const requestPdaAddress = fundingRequestPda({
    registryProgramId: process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
    councilProgramId: process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
    missionId: mission.id,
    metadataHash,
  });
  const epoch = Math.max(Number(input.epochNumber) || 1, 1);

  const inserted = await query<FundingRequestRow>(
    `
      insert into funding_requests (
        id, request_pda, mission_id, requester_wallet, recipient_wallet, mission_token_amount,
        derived_usd_estimate, status, metadata_hash, title, description, epoch_number
      )
      values ($1, $2, $3, $4, $4, $5, $6, 'active', $7, $8, $9, $10)
      on conflict (id) do nothing
      returning *, 0::bigint as approvals, 0::bigint as rejections
    `,
    [input.requestId, requestPdaAddress, mission.id, requesterWallet, tokenAmount, amountUsd, metadataHash, name, description, epoch],
  );
  const row =
    inserted.rows[0] ||
    (
      await query<FundingRequestRow>(
        `
          select
            fr.*,
            count(*) filter (where frv.vote = 'approve') as approvals,
            count(*) filter (where frv.vote = 'reject') as rejections
          from funding_requests fr
          left join funding_request_votes frv on frv.request_id = fr.id
          where fr.id = $1
          group by fr.id
        `,
        [input.requestId],
      )
    ).rows[0];
  if (!row) throw new Error("Funding request confirmation failed.");
  return { request: rowToRequest(row) };
}

export async function voteFundingRequestInPostgres(requestId: string, input: { wallet?: string; vote?: "approve" | "reject" }) {
  const wallet = input.wallet || currentUser.address;
  if (input.vote !== "approve" && input.vote !== "reject") throw new Error("Choose approve or reject before submitting your vote.");
  const vote = input.vote;

  const existing = await query<{
    request_status: RequestStatus;
    existing_vote: "approve" | "reject" | null;
    request_pda: string | null;
    mission_id: string;
    metadata_hash: string;
    token_mint: string | null;
    epoch_number: number | null;
  }>(
    `
      select
        fr.status as request_status,
        frv.vote as existing_vote,
        fr.request_pda,
        fr.mission_id,
        fr.metadata_hash,
        fr.epoch_number,
        m.token_mint
      from funding_requests fr
      join missions m on m.id = fr.mission_id
      left join funding_request_votes frv
        on frv.request_id = fr.id
        and lower(frv.voter_wallet) = lower($2)
      where fr.id = $1
    `,
    [requestId, wallet],
  );
  const current = existing.rows[0];
  if (!current) throw new Error("This funding request could not be found. Refresh the page and try again.");
  if (current.existing_vote) {
    const previousVote = current.existing_vote === "approve" ? "approved" : "rejected";
    throw new Error(`You already ${previousVote} this funding request. Each council wallet can vote only once.`);
  }
  if (current.request_status !== "active") {
    throw new Error(`This funding request is already ${current.request_status}. Only active requests can receive votes.`);
  }

  // Fall back to recomputing the request PDA if it wasn't persisted yet (legacy rows).
  const requestAccount =
    current.request_pda ||
    fundingRequestPda({
      registryProgramId: process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
      councilProgramId: process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
      missionId: current.mission_id,
      metadataHash: current.metadata_hash,
    });
  const transaction = await prepareCouncilVoteTransaction({
    wallet,
    missionId: current.mission_id,
    requestId,
    vote,
    requestAccount,
    mint: current.token_mint,
    epoch: Number(current.epoch_number ?? 1),
  });
  return {
    request: rowToRequest((await getFundingRequestRow(requestId))!),
    transaction,
  };
}

export async function confirmFundingRequestVoteInPostgres(requestId: string, input: { wallet?: string; vote?: "approve" | "reject"; signature?: string }) {
  const wallet = input.wallet || currentUser.address;
  const vote = input.vote;
  if (vote !== "approve" && vote !== "reject") throw new Error("Choose approve or reject before submitting your vote.");
  if (!input.signature) throw new Error("signature is required.");
  await assertSuccessfulOnchainTransaction(input.signature);

  return transaction(async (client) => {
    const existing = await client.query<{
      request_status: RequestStatus;
      existing_vote: "approve" | "reject" | null;
      request_pda: string | null;
      metadata_hash: string;
      mission_id: string;
    }>(
      `
        select
          fr.status as request_status,
          frv.vote as existing_vote,
          fr.request_pda,
          fr.metadata_hash,
          fr.mission_id
        from funding_requests fr
        left join funding_request_votes frv
          on frv.request_id = fr.id
          and lower(frv.voter_wallet) = lower($2)
        where fr.id = $1
      `,
      [requestId, wallet],
    );
    const current = existing.rows[0];
    if (!current) throw new Error("This funding request could not be found. Refresh the page and try again.");
    if (current.existing_vote) {
      const previousVote = current.existing_vote === "approve" ? "approved" : "rejected";
      throw new Error(`You already ${previousVote} this funding request. Each council wallet can vote only once.`);
    }
    if (current.request_status !== "active") {
      throw new Error(`This funding request is already ${current.request_status}. Only active requests can receive votes.`);
    }
    const requestAccount =
      current.request_pda ||
      fundingRequestPda({
        registryProgramId: process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
        councilProgramId: process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
        missionId: current.mission_id,
        metadataHash: current.metadata_hash,
      });
    await assertOnchainFundingRequestVote(requestAccount, wallet, vote);

    await client.query(
      `
        insert into funding_request_votes (request_id, voter_wallet, vote, escrow_locked_until)
        values ($1, $2, $3, now() + $4::interval)
      `,
      [requestId, wallet, vote, VOTE_ESCROW_LOCK_INTERVAL_SQL],
    );

    const counts = await client.query<{ approvals: string; rejections: string }>(
      `
        select
          count(*) filter (where vote = 'approve') as approvals,
          count(*) filter (where vote = 'reject') as rejections
        from funding_request_votes
        where request_id = $1
      `,
      [requestId],
    );
    const approvals = Number(counts.rows[0]?.approvals || 0);
    const rejections = Number(counts.rows[0]?.rejections || 0);
    const status = approvals >= 4 ? "accepted" : rejections >= 3 ? "rejected" : "active";
    const result = await client.query<FundingRequestRow>(
      `
        update funding_requests set status = $2 where id = $1
        returning *, $3::bigint as approvals, $4::bigint as rejections
      `,
      [requestId, status, approvals, rejections],
    );
    await client.query(
      `
        insert into transactions (signature, wallet, mission_id, type, status)
        values ($1, $2, $3, 'funding-request-vote', 'confirmed')
        on conflict (signature) do nothing
      `,
      [input.signature, wallet, current.mission_id],
    );

    return {
      request: rowToRequest(result.rows[0]),
    };
  });
}

export async function executeFundingRequestInPostgres(
  requestId: string,
  input: {
    wallet?: string;
  } = {},
) {
  const result = await query<
    FundingRequestRow & {
      request_pda: string | null;
      recipient_wallet: string;
      token_mint: string | null;
      treasury_vault: string | null;
    }
  >(
    `
      select
        fr.*,
        m.token_mint,
        m.treasury_vault,
        count(*) filter (where frv.vote = 'approve') as approvals,
        count(*) filter (where frv.vote = 'reject') as rejections
      from funding_requests fr
      join missions m on m.id = fr.mission_id
      left join funding_request_votes frv on frv.request_id = fr.id
      where fr.id = $1
      group by fr.id, m.token_mint, m.treasury_vault
    `,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Funding request not found: ${requestId}`);
  if (row.status !== "accepted") throw new Error("Only accepted requests can be executed.");
  await hydrateFundingRequestExecutionState([row]);
  if (row.executed_at) throw new Error("This funding request has already been paid.");

  const requestAccount = requestAccountForRow(row);

  return {
    request: rowToRequest(row),
    transaction: await prepareCouncilExecuteTransaction({
      wallet: input.wallet || currentUser.address,
      missionId: row.mission_id,
      requestId,
      requestAccount,
      treasuryVault: row.treasury_vault,
      recipientWallet: row.recipient_wallet,
      mint: row.token_mint,
    }),
  };
}

export async function confirmFundingRequestExecutionInPostgres(requestId: string, input: { signature?: string; wallet?: string }) {
  if (!input.signature) throw new Error("signature is required.");
  await assertSuccessfulOnchainTransaction(input.signature);

  const result = await transaction(async (client) => {
    const currentResult = await client.query<FundingRequestRow>(
      `
        select
          fr.*,
          count(*) filter (where frv.vote = 'approve') as approvals,
          count(*) filter (where frv.vote = 'reject') as rejections
        from funding_requests fr
        left join funding_request_votes frv on frv.request_id = fr.id
        where fr.id = $1
        group by fr.id
      `,
      [requestId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error(`Funding request not found: ${requestId}`);
    if (current.status !== "accepted") throw new Error("Only accepted requests can be marked as paid.");

    await client.query(
      `
        update funding_requests
        set executed_at = coalesce(executed_at, now())
        where id = $1
      `,
      [requestId],
    );
    await client.query(
      `
        insert into transactions (signature, wallet, mission_id, type, status)
        values ($1, $2, $3, 'funding-request-execute', 'confirmed')
        on conflict (signature) do nothing
      `,
      [input.signature, input.wallet || currentUser.address, current.mission_id],
    );

    const refreshed = await client.query<FundingRequestRow>(
      `
        select
          fr.*,
          count(*) filter (where frv.vote = 'approve') as approvals,
          count(*) filter (where frv.vote = 'reject') as rejections
        from funding_requests fr
        left join funding_request_votes frv on frv.request_id = fr.id
        where fr.id = $1
        group by fr.id
      `,
      [requestId],
    );

    return refreshed.rows[0];
  });

  if (!result) throw new Error(`Funding request not found: ${requestId}`);
  return { request: rowToRequest(result) };
}

export async function prepareVoteEscrowWithdrawalInPostgres(missionId: string, input: { wallet?: string }) {
  const wallet = input.wallet || currentUser.address;
  const result = await query<{ id: string; token_mint: string | null }>(
    "select id, token_mint from missions where id = $1 limit 1",
    [missionId],
  );
  const mission = result.rows[0];
  if (!mission) throw new Error(`Mission not found: ${missionId}`);
  if (!mission.token_mint) throw new Error("Mission token mint is unavailable. Refresh your profile and try again.");

  const escrowed = await escrowedVoteBalancesByMission([missionId]);
  const escrow = escrowed.get(missionId)?.get(wallet.toLowerCase());
  if (!escrow || escrow.amount <= 0n) throw new Error("No vote escrow is available to withdraw for this mission.");
  const config = requireProgramConfig(process.env);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const voteEscrowPosition = await voteEscrowPositionAddress({ missionId, voter: wallet });
  const escrowPositionAccount = await connection.getAccountInfo(new PublicKey(voteEscrowPosition));
  if (!escrowPositionAccount) {
    throw new Error("This escrow was recorded before the on-chain escrow position was initialized. Submit a fresh approval after this fix, then test withdrawal again.");
  }

  return {
    transaction: await prepareReleaseVoteEscrowTransaction({
      wallet,
      missionId,
      mint: mission.token_mint,
    }),
  };
}

export async function confirmVoteEscrowWithdrawalInPostgres(missionId: string, input: { wallet?: string; signature?: string }) {
  const wallet = input.wallet || currentUser.address;
  if (!input.signature) throw new Error("signature is required.");
  await assertSuccessfulOnchainTransaction(input.signature);
  await query(
    `
      insert into transactions (signature, wallet, mission_id, type, status)
      values ($1, $2, $3, 'funding-request-vote-escrow-release', 'confirmed')
      on conflict (signature) do nothing
    `,
    [input.signature, wallet, missionId],
  );

  return { profile: await getProfileFromPostgres(wallet) };
}

export async function releaseFundingRequestVoteEscrowInPostgres(requestId: string) {
  void requestId;
  throw new Error("Vote escrow is withdrawn by each voter from their profile after the three-day lock expires.");
}

async function releaseFundingRequestVoteEscrowInPostgresLegacy(requestId: string) {
  const result = await query<
    FundingRequestRow & {
      request_pda: string | null;
      token_mint: string | null;
    }
  >(
    `
      select
        fr.*,
        m.token_mint,
        count(*) filter (where frv.vote = 'approve') as approvals,
        count(*) filter (where frv.vote = 'reject') as rejections
      from funding_requests fr
      join missions m on m.id = fr.mission_id
      left join funding_request_votes frv on frv.request_id = fr.id
      where fr.id = $1
      group by fr.id, m.token_mint
    `,
    [requestId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Funding request not found: ${requestId}`);
  await hydrateFundingRequestExecutionState([row]);
  if (row.status !== "rejected" && !row.executed_at) throw new Error("Vote escrow can only be released after a request is rejected or paid.");
  if (!row.token_mint) throw new Error("Mission token mint is unavailable. Refresh the mission and try again.");

  const votes = await query<{ voter_wallet: string }>(
    `
      select distinct frv.voter_wallet
      from funding_request_votes frv
      join funding_requests fr on fr.id = frv.request_id
      where frv.request_id = $1
        and not exists (
          select 1
          from funding_request_votes later_vote
          join funding_requests later_request on later_request.id = later_vote.request_id
          where later_request.mission_id = fr.mission_id
            and lower(later_vote.voter_wallet) = lower(frv.voter_wallet)
            and later_vote.created_at + $2::interval > now()
        )
    `,
    [requestId, VOTE_ESCROW_LOCK_INTERVAL_SQL],
  );
  const releases: Array<{ voter: string; signature: string; skipped?: false } | { voter: string; skipped: true; reason: string }> = [];

  for (const vote of votes.rows) {
    try {
      const release = await submitReleaseVoteEscrowTransaction({
        missionId: row.mission_id,
        voter: vote.voter_wallet,
        mint: row.token_mint,
      });
      releases.push({ voter: vote.voter_wallet, signature: release.signature });
      await query(
        `
          insert into transactions (signature, wallet, mission_id, type, status)
          values ($1, $2, $3, 'funding-request-vote-escrow-release', 'confirmed')
          on conflict (signature) do nothing
        `,
        [release.signature, vote.voter_wallet, row.mission_id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vote escrow release failed.";
      if (/AccountNotFound|could not find account|custom program error: 0xbc4|already in use/i.test(message)) {
        releases.push({ voter: vote.voter_wallet, skipped: true, reason: message });
        continue;
      }
      throw error;
    }
  }

  return {
    request: rowToRequest(row),
    releases,
  };
}

export async function createAuthNonceInPostgres(address?: string) {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await query("delete from auth_nonces where expires_at <= now()");
  await query("insert into auth_nonces (nonce, wallet_address, expires_at) values ($1, $2, $3)", [nonce, address || null, expiresAt]);

  return {
    nonce,
    address,
    expiresAt,
    message: authMessage(nonce),
  };
}

export async function verifyAuthInPostgres(input: { address?: string; nonce?: string; signature?: string }) {
  if (!input.address || !input.nonce || !input.signature) throw new Error("address, nonce, and signature are required.");

  const result = await query<{ nonce: string }>(
    "select nonce from auth_nonces where nonce = $1 and (wallet_address is null or wallet_address = $2) and expires_at > now() limit 1",
    [input.nonce, input.address],
  );
  if (!result.rows[0]) throw new Error("Nonce is invalid or expired.");
  if (!verifySolanaSignature({ address: input.address, nonce: input.nonce, signature: input.signature })) {
    throw new Error("Signature is invalid.");
  }

  await query("delete from auth_nonces where nonce = $1", [input.nonce]);

  return {
    address: input.address,
    authenticated: true,
    sessionMode: "solana-signature",
  };
}

export async function registerCouncilCandidateInPostgres(input: { missionId?: string; wallet?: string; tokenAccounts?: string[] }) {
  if (!input.missionId) throw new Error("missionId is required.");
  const wallet = input.wallet || currentUser.address;

  return {
    missionId: input.missionId,
    wallet,
    tokenAccounts: input.tokenAccounts || [],
    transaction: await prepareCandidateRegistrationTransaction({ wallet, missionId: input.missionId }),
  };
}

export async function confirmCouncilCandidateRegistrationInPostgres(input: { missionId?: string; wallet?: string; signature?: string; tokenAccounts?: string[] }) {
  if (!input.missionId) throw new Error("missionId is required.");
  if (!input.signature) throw new Error("signature is required.");
  const wallet = input.wallet || currentUser.address;
  await assertSuccessfulOnchainTransaction(input.signature);

  // Snapshot the candidate's current on-chain balance only after registration
  // succeeds, so failed wallet transactions do not appear in the council list.
  const mintRow = await query<{ token_mint: string | null }>("select token_mint from missions where id = $1", [input.missionId]);
  const tokenMint = mintRow.rows[0]?.token_mint || null;
  const balanceBaseUnits = tokenMint ? await fetchTokenBalanceBaseUnits(wallet, tokenMint) : "0";

  await query(
    `
      insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status)
      values ($1, $2, $3, 'registered')
      on conflict (mission_id, owner_wallet) do update set
        latest_checkpoint_balance = greatest(council_candidates.latest_checkpoint_balance, excluded.latest_checkpoint_balance),
        status = 'registered'
    `,
    [input.missionId, wallet, balanceBaseUnits],
  );

  return {
    missionId: input.missionId,
    wallet,
    tokenAccounts: input.tokenAccounts || [],
  };
}

function councilEscrowAmounts(candidates: Array<{ tokens: number; tokenBaseUnits?: string }>) {
  return candidates.slice(0, 6).map((candidate) => {
    const baseUnits = Number(candidate.tokenBaseUnits);
    return Number.isFinite(baseUnits) && baseUnits > 0 ? Math.floor(baseUnits) : Math.max(Math.floor(candidate.tokens), 1);
  });
}

export async function prepareCouncilCheckpointInPostgres(input: { missionId?: string; epoch?: number; authorityWallet?: string }) {
  if (!input.missionId) throw new Error("missionId is required.");
  const mission = await getMissionByIdFromPostgres(input.missionId);
  if (!mission) throw new Error(`Mission not found: ${input.missionId}`);
  const epoch = input.epoch ?? 1;
  const candidates = await refreshMissionCouncilFromTopHoldersInPostgres(mission);
  const escrowAmounts = councilEscrowAmounts(candidates);
  const metadataHash = contentHash({ missionId: mission.id, epoch, candidates, escrowAmounts });

  await recordEpochCouncilInPostgres({ missionId: mission.id, epoch, candidates, escrowAmounts });

  return {
    missionId: mission.id,
    epoch,
    candidates,
    escrowAmounts,
    metadataHash,
    transaction: await prepareFinalizeEpochCouncilTransaction({
      authorityWallet: input.authorityWallet || currentUser.address,
      missionId: mission.id,
      epoch,
      members: candidates.map((candidate) => candidate.address),
      escrowAmounts,
    }),
  };
}

export async function backendHealthFromPostgres() {
  const result = await query<{ mission_count: string }>("select count(*) as mission_count from missions");

  return {
    ok: true,
    storage: "postgres",
    missionCount: Number(result.rows[0]?.mission_count || 0),
    generatedAt: new Date().toISOString(),
  };
}

function notConfiguredTransaction(kind: string) {
  return {
    kind,
    status: "not_configured" as const,
    message: "Solana transaction builders are not configured yet. Configure program IDs and RPC/indexer providers before enabling signed transactions.",
    instructions: [],
  };
}
