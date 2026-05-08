import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { DEFAULT_COUNCIL_PROGRAM_ID, DEFAULT_DBC_TOTAL_SUPPLY, DEFAULT_REGISTRY_PROGRAM_ID, resolveMeteoraDbcLaunchConfig } from "@singularity/solana";
import type { FundingRequest, Mission } from "@/lib/mock-data";
import { currentUser, missions as fixtureMissions, type RequestStatus } from "@/lib/mock-data";
import { authMessage, verifySolanaSignature } from "@/lib/backend/auth";
import { emptyWalletBalanceSnapshot, getWalletBalanceSnapshot } from "@/lib/backend/balances";
import { query, transaction } from "@/lib/backend/db";
import {
  prepareCandidateRegistrationTransaction,
  prepareCouncilExecuteTransaction,
  prepareFinalizeEpochCouncilTransaction,
  fetchMeteoraDbcMissionSnapshot,
  fetchMeteoraDammV2MissionSnapshot,
  prepareJupiterTradeTransaction,
  prepareCouncilVoteTransaction,
  prepareFundingRequestTransaction,
  prepareLaunchTransaction,
  prepareMeteoraDbcTradeTransaction,
  prepareMissionMarketGraduationTransaction,
  prepareMissionTreasuryAllocationClaimTransaction,
  prepareMissionGraduationTransaction,
  submitBackendMissionFeeDistribution,
  submitFinalizeEpochCouncilTransaction,
} from "@/lib/backend/transactions";
import type { MissionSort } from "@/lib/backend/store";

type MissionRow = {
  id: string;
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
  token_price_usdc: string | null;
  holders: number | null;
  liquidity_usdc: string | null;
  treasury_usdc: string | null;
  treasury_tokens: string | null;
};

type FundingRequestRow = {
  id: string;
  mission_id: string;
  requester_wallet: string;
  derived_usd_estimate: string;
  mission_token_amount: string;
  status: RequestStatus;
  title: string;
  description: string;
  approvals: string;
  rejections: string;
};

type CouncilCandidateRow = {
  mission_id: string;
  owner_wallet: string;
  latest_checkpoint_balance: string;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
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
  launch_accounts: Record<string, string>;
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

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
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
  try {
    return await getWalletBalanceSnapshot(address, missionList);
  } catch {
    return emptyWalletBalanceSnapshot();
  }
}

function rpcUrl() {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL;
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

function tokenAccountAmountToNumber(amount: string, decimals: number) {
  return Number(amount) / 10 ** decimals;
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

function requestTimeLeft(status: RequestStatus) {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired";
  return "3d left";
}

function rowToRequest(row: FundingRequestRow, requester?: ProfileRow): FundingRequest {
  return {
    id: row.id,
    missionId: row.mission_id,
    requester: requester?.display_name || row.requester_wallet,
    requesterAvatar: requester?.avatar_url || currentUser.avatar,
    name: row.title,
    description: row.description,
    amountUsd: num(row.derived_usd_estimate),
    tokenAmount: num(row.mission_token_amount),
    approvals: Number(row.approvals || 0),
    rejections: Number(row.rejections || 0),
    timeLeft: requestTimeLeft(row.status),
    status: row.status,
  };
}

function rowToMission(row: MissionRow, requests: FundingRequest[]): Mission {
  return {
    id: row.id,
    missionPda: row.mission_pda,
    statement: row.statement,
    description: row.description,
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
    performance: row.performance_json || fixtureMissions[0].performance,
    council: row.council_json || [],
    requests,
  };
}

function candidateRowsToCouncil(row: MissionRow, candidates: CouncilCandidateRow[]) {
  const existing = new Map((row.council_json || []).map((member) => [member.address.toLowerCase(), member]));
  const totalSupply = num(row.total_supply);
  const merged = [...(row.council_json || [])];

  for (const candidate of candidates) {
    if (existing.has(candidate.owner_wallet.toLowerCase())) continue;
    const tokens = num(candidate.latest_checkpoint_balance);
    merged.push({
      id: `${row.id}-candidate-${candidate.owner_wallet}`,
      name: candidate.display_name || shortWallet(candidate.owner_wallet),
      address: candidate.owner_wallet,
      avatar: candidate.avatar_url || row.token_image_url,
      tokens,
      ownership: totalSupply > 0 ? (tokens / totalSupply) * 100 : 0,
    });
  }

  return merged.slice(0, 6);
}

async function councilCandidateRows(missionIds: string[], client?: Queryable) {
  if (missionIds.length === 0) return new Map<string, CouncilCandidateRow[]>();
  const result = await (client || { query }).query<CouncilCandidateRow>(
    `
      select cc.mission_id, cc.owner_wallet, cc.latest_checkpoint_balance, cc.created_at, p.display_name, p.avatar_url
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
  const largestAccounts = await connection.getTokenLargestAccounts(mint);
  const excludedTokenAccounts = configuredAddressSet(process.env.SINGULARITY_COUNCIL_EXCLUDED_TOKEN_ACCOUNTS);
  const excludedOwners = configuredAddressSet(process.env.SINGULARITY_COUNCIL_EXCLUDED_OWNERS);
  if (mission.treasuryVault) excludedTokenAccounts.add(mission.treasuryVault.toLowerCase());

  const tokenAccounts = largestAccounts.value
    .filter((account) => BigInt(account.amount) > 0n)
    .filter((account) => !excludedTokenAccounts.has(account.address.toBase58().toLowerCase()));

  const tokenAccountInfos = await Promise.all(tokenAccounts.map((account) => connection.getParsedAccountInfo(account.address, "confirmed")));
  const ownerCandidates = tokenAccounts
    .map((account, index) => {
      const parsed = tokenAccountInfos[index].value?.data;
      if (!parsed || typeof parsed === "string" || !("parsed" in parsed)) return null;
      const owner = String(parsed.parsed?.info?.owner || "");
      if (!owner || excludedOwners.has(owner.toLowerCase())) return null;
      const decimals = account.decimals;
      return {
        owner,
        amount: account.amount,
        decimals,
        tokens: tokenAccountAmountToNumber(account.amount, decimals),
      };
    })
    .filter((candidate): candidate is { owner: string; amount: string; decimals: number; tokens: number } => Boolean(candidate));

  if (ownerCandidates.length === 0) throw new Error("No eligible token holders were found for this mission.");

  const ownerInfos = await connection.getMultipleAccountsInfo(ownerCandidates.map((candidate) => new PublicKey(candidate.owner)), "confirmed");
  const walletCandidates = ownerCandidates.filter((candidate, index) => ownerInfos[index]?.owner.equals(SystemProgram.programId));
  const grouped = new Map<string, { owner: string; amount: bigint; decimals: number }>();
  for (const candidate of walletCandidates) {
    const existing = grouped.get(candidate.owner);
    grouped.set(candidate.owner, {
      owner: candidate.owner,
      amount: (existing?.amount || 0n) + BigInt(candidate.amount),
      decimals: candidate.decimals,
    });
  }

  const ranked = [...grouped.values()].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1)).slice(0, 6);
  if (ranked.length < 6) {
    throw new Error(`This mission has only ${ranked.length} eligible token holder${ranked.length === 1 ? "" : "s"}. At least 6 holders are required before a treasury council can be finalized.`);
  }

  const profiles = await (client || { query }).query<Pick<ProfileRow, "wallet_address" | "display_name" | "avatar_url">>(
    "select wallet_address, display_name, avatar_url from profiles where wallet_address = any($1::text[])",
    [ranked.map((candidate) => candidate.owner)],
  );
  const profilesByWallet = new Map(profiles.rows.map((profile) => [profile.wallet_address, profile]));
  const totalSupply = mission.totalSupply || DEFAULT_DBC_TOTAL_SUPPLY;
  const council = ranked.map((candidate, index) => {
    const profile = profilesByWallet.get(candidate.owner);
    const tokens = tokenAccountAmountToNumber(candidate.amount.toString(), candidate.decimals);
    return {
      id: `${mission.id}-holder-${index + 1}`,
      name: profile?.display_name || shortWallet(candidate.owner),
      address: candidate.owner,
      avatar: profile?.avatar_url || mission.tokenImage,
      tokens,
      ownership: totalSupply > 0 ? (tokens / totalSupply) * 100 : 0,
      tokenBaseUnits: candidate.amount.toString(),
      tokenDecimals: candidate.decimals,
    } satisfies CouncilCheckpointMember;
  });

  await (client || { query }).query("update missions set council_json = $2 where id = $1", [mission.id, JSON.stringify(council)]);
  for (const member of council) {
    await (client || { query }).query(
      `
        insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status)
        values ($1, $2, $3, 'registered')
        on conflict (mission_id, owner_wallet) do update set
          latest_checkpoint_balance = excluded.latest_checkpoint_balance,
          status = 'registered'
      `,
      [mission.id, member.address, member.tokenBaseUnits],
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

async function performanceFromPricePoints(missionId: string, currentPrice: number, client?: Queryable): Promise<Mission["performance"]> {
  const result = await (client || { query }).query<PricePointRow>(
    `
      select timestamp, price_usdc
      from price_points
      where mission_id = $1 and timestamp >= now() - interval '31 days'
      order by timestamp asc
    `,
    [missionId],
  );
  const points = result.rows.map((row) => ({ timestamp: new Date(row.timestamp).getTime(), price: num(row.price_usdc) })).filter((point) => point.price > 0);
  const now = Date.now();

  return Object.fromEntries(
    Object.entries(performanceFrames).map(([key, frame]) => {
      const cutoff = now - frame.ms;
      const baseline = [...points].reverse().find((point) => point.timestamp <= cutoff)?.price || points[0]?.price || currentPrice || 1;
      const value = baseline > 0 ? (currentPrice / baseline) * 100 : 100;
      return [
        key,
        {
          label: frame.label,
          agoLabel: frame.agoLabel,
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
        mission_id, token_price_usdc, holders, liquidity_usdc, treasury_usdc, treasury_tokens, volume_usdc, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, 0, now())
      on conflict (mission_id) do update set
        token_price_usdc = excluded.token_price_usdc,
        holders = excluded.holders,
        liquidity_usdc = excluded.liquidity_usdc,
        treasury_usdc = excluded.treasury_usdc,
        treasury_tokens = excluded.treasury_tokens,
        updated_at = now()
    `,
    [missionId, snapshot.currentPrice, holders, snapshot.liquidityUsd, snapshot.treasuryUsdc, snapshot.treasuryTokens],
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

  const performance = await performanceFromPricePoints(missionId, snapshot.currentPrice, client);
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

  const result = await (client || { query }).query<FundingRequestRow>(
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
  const byMission = new Map<string, FundingRequest[]>();

  for (const row of result.rows) {
    const list = byMission.get(row.mission_id) || [];
    list.push(rowToRequest(row));
    byMission.set(row.mission_id, list);
  }

  return byMission;
}

export async function listMissionsFromPostgres(options: { q?: string; sort?: MissionSort }) {
  const values: unknown[] = [];
  const where: string[] = [];
  const queryText = options.q?.trim();

  if (queryText) {
    values.push(`%${queryText}%`);
    where.push("(m.statement ilike $1 or m.description ilike $1 or m.token_symbol ilike $1)");
  }

  const orderBy =
    options.sort === "most-holders"
      ? "coalesce(mm.holders, 0) desc"
      : options.sort === "newest"
        ? "m.created_at desc"
        : "coalesce(mm.liquidity_usdc, 0) desc";

  const result = await query<MissionRow>(
    `
      select m.*, mm.token_price_usdc, mm.holders, mm.liquidity_usdc, mm.treasury_usdc, mm.treasury_tokens
      from missions m
      left join mission_metrics mm on mm.mission_id = m.id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by ${orderBy}
    `,
    values,
  );
  const requestsByMission = await requestRows(result.rows.map((row) => row.id));
  const candidatesByMission = await councilCandidateRows(result.rows.map((row) => row.id));

  return result.rows.map((row) =>
    rowToMission(
      {
        ...row,
        council_json: candidateRowsToCouncil(row, candidatesByMission.get(row.id) || []),
      },
      requestsByMission.get(row.id) || [],
    ),
  );
}

export async function getMissionByIdFromPostgres(missionId: string, client?: Queryable) {
  const result = await (client || { query }).query<MissionRow>(
    `
      select m.*, mm.token_price_usdc, mm.holders, mm.liquidity_usdc, mm.treasury_usdc, mm.treasury_tokens
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
  return rowToMission(
    {
      ...row,
      council_json: candidateRowsToCouncil(row, candidatesByMission.get(missionId) || []),
    },
    requestsByMission.get(missionId) || [],
  );
}

export async function getProfileFromPostgres(address: string) {
  const normalizedAddress = address === "me" ? currentUser.address : address;
  const result = await query<ProfileRow>("select * from profiles where wallet_address = $1 limit 1", [normalizedAddress]);
  const row = result.rows[0];
  const allMissions = await listMissionsFromPostgres({ sort: "highest-liquidity" });
  const balances = await walletBalances(normalizedAddress, allMissions);

  if (!row) {
    return { ...emptyProfile(normalizedAddress), ...balances };
  }

  const tokenBalances = balances.tokenBalances.map((entry) => ({
    ...entry,
    mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const createdMissions = row.created_missions.map((entry) => ({
    ...entry,
    mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const councilMissionIds = new Set(balances.tokenBalances.filter((entry) => entry.council).map((entry) => entry.missionId));
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
}) {
  const statement = input.statement?.trim();
  const description = input.description?.trim();
  const tokenSymbol = input.tokenSymbol?.trim().toUpperCase();
  if (!statement || statement.length > 96) throw new Error("Mission statement is required and must be 96 characters or fewer.");
  if (!description || description.length > 1200) throw new Error("Mission description is required and must be 1200 characters or fewer.");
  if (!tokenSymbol || !/^[A-Z0-9]{2,8}$/.test(tokenSymbol)) throw new Error("Token symbol must be 2-8 uppercase letters or numbers.");

  const idBase = slugify(statement);
  const id = `${idBase}-${randomBytes(2).toString("hex")}`;
  const seed = fixtureMissions[0];
  const metadata = {
    name: statement,
    symbol: tokenSymbol,
    description,
    image: input.missionImage,
    properties: { category: "mission-token", platform: "Singularity" },
  };
  const metadataHash = contentHash(metadata);
  const metadataUri = `db://metadata/${metadataHash}.json`;
  const launchConfig = resolveMeteoraDbcLaunchConfig({
    totalSupply: DEFAULT_DBC_TOTAL_SUPPLY,
    initialPurchaseUsdc: input.initialPurchaseUsdc,
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
    tokenName: statement,
    tokenSymbol,
    totalSupply: launchConfig.totalSupply,
    initialPurchaseUsdc: launchConfig.initialPurchaseUsdc,
    initialMarketCap: launchConfig.initialMarketCap,
    migrationMarketCap: launchConfig.migrationMarketCap,
  });
  const launchAccounts = "accounts" in launchTransaction ? launchTransaction.accounts || {} : {};
  const mission: Mission = {
    id,
    missionPda: launchAccounts.mission || null,
    statement,
    description,
    image: input.missionImage || seed.image,
    tokenImage: input.tokenImage || seed.tokenImage,
    tokenSymbol,
    tokenMint: launchAccounts.tokenMint || null,
    dbcPool: launchAccounts.dbcPool || null,
    treasuryVault: launchAccounts.treasuryVault || null,
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
      `
        insert into pending_mission_launches (
          id, creator_wallet, metadata_hash, metadata_uri, statement, description,
          image_url, token_image_url, token_symbol, total_supply, treasury_supply_percent,
          initial_purchase_usdc, launch_accounts
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 20, $11, $12)
      `,
      [
        id,
        input.creatorWallet || currentUser.address,
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

export async function confirmMissionLaunchInPostgres(input: { launchId?: string; signature?: string; wallet?: string }) {
  if (!input.launchId) throw new Error("launchId is required.");
  if (!input.signature) throw new Error("signature is required.");
  if (!input.wallet) throw new Error("wallet is required.");

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
          performance_json, council_json
        )
        values ($1, $2, $3, $4, $5, $6, 'bonding', $7, $8, $9, $10, $11, $12, $13, $14, $15, '[]'::jsonb)
      `,
      [
        pending.id,
        accounts.mission || null,
        pending.creator_wallet,
        accounts.tokenMint || null,
        accounts.dbcPool || null,
        accounts.treasuryVault || null,
        pending.metadata_hash,
        pending.statement,
        pending.description,
        pending.image_url,
        pending.token_image_url,
        pending.token_symbol,
        pending.total_supply,
        pending.treasury_supply_percent,
        JSON.stringify(launchPerformance),
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

export async function quoteMissionTradeFromPostgres(missionId: string, input: { side?: string; amount?: number; wallet?: string; slippageBps?: number }) {
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  const amount = Math.max(Number(input.amount) || 0, 0);
  const side = input.side === "sell" ? "sell" : "buy";
  const isBondingDbc = mission.lifecycle === "bonding" && Boolean(mission.dbcPool) && !mission.dammPool;
  const chainQuote = isBondingDbc
    ? await prepareMeteoraDbcTradeTransaction({
        wallet: input.wallet,
        side,
        amount,
        dbcPool: mission.dbcPool,
        slippageBps: input.slippageBps,
      })
    : await prepareJupiterTradeTransaction({
        wallet: input.wallet,
        side,
        amount,
        tokenMint: mission.tokenMint,
        slippageBps: input.slippageBps,
        referencePrice: mission.tokenPrice,
      });

  return {
    missionId,
    side,
    route: "route" in chainQuote ? chainQuote.route : mission.lifecycle === "graduated" ? "amm" : "bonding-curve",
    inputAmount: "inputAmount" in chainQuote ? chainQuote.inputAmount : amount,
    requestedInputAmount: "requestedInputAmount" in chainQuote ? chainQuote.requestedInputAmount : undefined,
    partialFill: "partialFill" in chainQuote ? chainQuote.partialFill : undefined,
    willGraduate: "willGraduate" in chainQuote ? chainQuote.willGraduate : undefined,
    estimatedOutput: "estimatedOutput" in chainQuote ? chainQuote.estimatedOutput : 0,
    minimumAmountOut: "minimumAmountOut" in chainQuote ? chainQuote.minimumAmountOut : null,
    priceImpactPercent: "priceImpactPercent" in chainQuote ? chainQuote.priceImpactPercent : null,
    currentPrice: "currentPrice" in chainQuote ? chainQuote.currentPrice : mission.tokenPrice,
    market: {
      lifecycle: mission.lifecycle || "draft",
      tokenMint: mission.tokenMint || null,
      dbcPool: mission.dbcPool || null,
      dammPool: mission.dammPool || null,
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

export async function distributeMissionFeesInPostgres(input: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(input.limit || 50, 100));
  const result = await query<{
    id: string;
    creator_wallet: string;
    token_mint: string;
    dbc_pool: string;
    treasury_vault: string;
  }>(
    `
      select id, creator_wallet, token_mint, dbc_pool, treasury_vault
      from missions
      where lifecycle_state = 'bonding'
        and token_mint is not null
        and dbc_pool is not null
        and treasury_vault is not null
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
        tokenMint: mission.token_mint,
        dbcPool: mission.dbc_pool,
        treasuryVault: mission.treasury_vault,
      });
      if (distribution.distributionSignature) {
        await query(
          "insert into transactions (signature, wallet, mission_id, type, status) values ($1, $2, $3, 'mission-fee-distribution', 'confirmed') on conflict (signature) do nothing",
          [distribution.distributionSignature, process.env.SINGULARITY_FEE_DISTRIBUTOR_PUBKEY || "backend-fee-distributor", mission.id],
        );
      }
      results.push(distribution);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mission fee distribution failed.";
      console.error("Mission fee distribution failed", { missionId: mission.id, error: message });
      results.push({ status: "failed" as const, missionId: mission.id, error: message });
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
  const epoch = 1;
  const escrowAmounts = councilEscrowAmounts(council);
  const autoFinalized = await ensureEpochCouncilFinalizedOnChain({ mission, epoch, candidates: council, escrowAmounts });
  if (autoFinalized) {
    await recordEpochCouncilInPostgres({ missionId: mission.id, epoch, candidates: council, escrowAmounts });
  }

  const tokenAmount = amountUsd / mission.tokenPrice;
  const id = `${mission.id}-r-${randomBytes(4).toString("hex")}`;
  const requesterWallet = input.requesterWallet || currentUser.address;
  const metadataHash = contentHash({ name, description, tokenAmount, amountUsd, requesterWallet });

  const result = await query<FundingRequestRow>(
    `
      insert into funding_requests (
        id, mission_id, requester_wallet, recipient_wallet, mission_token_amount,
        derived_usd_estimate, status, metadata_hash, title, description
      )
      values ($1, $2, $3, $3, $4, $5, 'active', $6, $7, $8)
      returning *, 0::bigint as approvals, 0::bigint as rejections
    `,
    [id, mission.id, requesterWallet, tokenAmount, amountUsd, metadataHash, name, description],
  );

  return {
    request: rowToRequest(result.rows[0]),
    metadataHash,
    transaction: await prepareFundingRequestTransaction({
      requesterWallet,
      missionId: mission.id,
      requestId: id,
      metadataHash,
      recipientWallet: requesterWallet,
      tokenAmount: tokenAmount * 1_000_000,
    }),
  };
}

export async function voteFundingRequestInPostgres(requestId: string, input: { wallet?: string; vote?: "approve" | "reject" }) {
  const wallet = input.wallet || currentUser.address;
  if (input.vote !== "approve" && input.vote !== "reject") throw new Error("Choose approve or reject before submitting your vote.");
  const vote = input.vote;

  return transaction(async (client) => {
    const existing = await client.query<{ request_status: RequestStatus; existing_vote: "approve" | "reject" | null }>(
      `
        select fr.status as request_status, frv.vote as existing_vote
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

    await client.query(
      "insert into funding_request_votes (request_id, voter_wallet, vote) values ($1, $2, $3)",
      [requestId, wallet, vote],
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

    return {
      request: rowToRequest(result.rows[0]),
      transaction: await prepareCouncilVoteTransaction({
        wallet,
        missionId: result.rows[0].mission_id,
        requestId,
        vote,
      }),
    };
  });
}

export async function executeFundingRequestInPostgres(
  requestId: string,
  input: {
    wallet?: string;
    requestAccount?: string;
    treasuryVault?: string;
    recipientTokenAccount?: string;
    mint?: string;
  } = {},
) {
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
  const row = result.rows[0];
  if (!row) throw new Error(`Funding request not found: ${requestId}`);
  if (row.status !== "accepted") throw new Error("Only accepted requests can be executed.");

  return {
    request: rowToRequest(row),
    transaction: await prepareCouncilExecuteTransaction({
      wallet: input.wallet || currentUser.address,
      missionId: row.mission_id,
      requestId,
      requestAccount: input.requestAccount,
      treasuryVault: input.treasuryVault,
      recipientTokenAccount: input.recipientTokenAccount,
      mint: input.mint,
    }),
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

  await query(
    `
      insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance)
      values ($1, $2, 0)
      on conflict (mission_id, owner_wallet) do update set status = 'registered'
    `,
    [input.missionId, wallet],
  );

  return {
    missionId: input.missionId,
    wallet,
    tokenAccounts: input.tokenAccounts || [],
    transaction: await prepareCandidateRegistrationTransaction({ wallet, missionId: input.missionId }),
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
