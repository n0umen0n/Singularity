import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import type { FundingRequest, Mission } from "@/lib/mock-data";
import { currentUser, missions as fixtureMissions, type RequestStatus } from "@/lib/mock-data";
import { authMessage, verifySolanaSignature } from "@/lib/backend/auth";
import { query, transaction } from "@/lib/backend/db";
import {
  prepareCandidateRegistrationTransaction,
  prepareCouncilExecuteTransaction,
  prepareFinalizeEpochCouncilTransaction,
  fetchMeteoraDbcMissionSnapshot,
  prepareJupiterTradeTransaction,
  prepareCouncilVoteTransaction,
  prepareFundingRequestTransaction,
  prepareLaunchTransaction,
  prepareMeteoraDbcTradeTransaction,
  prepareMissionGraduationTransaction,
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

const performanceFrames = {
  "1H": { label: "1 hour", agoLabel: "1 hour ago", ms: 60 * 60 * 1000 },
  "4H": { label: "4 hours", agoLabel: "4 hours ago", ms: 4 * 60 * 60 * 1000 },
  "1D": { label: "1 day", agoLabel: "1 day ago", ms: 24 * 60 * 60 * 1000 },
  "1W": { label: "1 week", agoLabel: "1 week ago", ms: 7 * 24 * 60 * 60 * 1000 },
  "1M": { label: "1 month", agoLabel: "1 month ago", ms: 30 * 24 * 60 * 60 * 1000 },
} as const satisfies Record<keyof Mission["performance"], { label: string; agoLabel: string; ms: number }>;

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

export async function refreshMissionMarketDataInPostgres(missionId: string, client?: Queryable) {
  const mission = await getMissionByIdFromPostgres(missionId, client);
  if (!mission) return null;
  if (mission.lifecycle !== "bonding" || !mission.dbcPool) return mission;

  const snapshot = await fetchMeteoraDbcMissionSnapshot({
    dbcPool: mission.dbcPool,
    tokenMint: mission.tokenMint,
    treasuryVault: mission.treasuryVault,
    totalSupply: mission.totalSupply,
  });
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
      "insert into price_points (mission_id, timestamp, price_usdc, volume_usdc, source) values ($1, now(), $2, 0, 'meteora-dbc')",
      [missionId, snapshot.currentPrice],
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
        poolProgressPercent: snapshot.poolProgressPercent,
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

  return result.rows.map((row) => rowToMission(row, requestsByMission.get(row.id) || []));
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
  return rowToMission(row, requestsByMission.get(missionId) || []);
}

export async function getProfileFromPostgres(address: string) {
  const normalizedAddress = address === "me" ? currentUser.address : address;
  const result = await query<ProfileRow>("select * from profiles where wallet_address = $1 limit 1", [normalizedAddress]);
  const row = result.rows[0];

  if (!row) {
    return {
      ...currentUser,
      address: normalizedAddress,
      tokenBalances: [],
      createdMissions: [],
      submittedRequests: [],
      councilRequests: [],
    };
  }

  const allMissions = await listMissionsFromPostgres({ sort: "highest-liquidity" });
  const tokenBalances = row.token_balances.map((entry) => ({
    ...entry,
    mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const createdMissions = row.created_missions.map((entry) => ({
    ...entry,
    mission: allMissions.find((mission) => mission.id === entry.missionId) ?? null,
  }));
  const councilMissionIds = new Set(row.token_balances.filter((entry) => entry.council).map((entry) => entry.missionId));
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
    avatar: row.avatar_url || currentUser.avatar,
    description: row.bio || "",
    socials: row.socials || [],
    balances: row.balances || currentUser.balances,
    tokenBalances,
    createdMissions,
    submittedRequests,
    councilRequests,
  };
}

export async function updateProfileInPostgres(input: { address: string; name?: string; description?: string; avatar?: string; socials?: string[] }) {
  const result = await query<ProfileRow>(
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
    [input.address, input.name || input.address, input.avatar || null, input.description || null, JSON.stringify(input.socials || [])],
  );

  return result.rows[0];
}

export async function prepareMissionLaunchInPostgres(input: {
  creatorWallet?: string;
  statement?: string;
  description?: string;
  tokenSymbol?: string;
  missionImage?: string;
  tokenImage?: string;
  initialPurchaseUsdc?: number;
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
  const totalSupply = 50_000_000;
  const launchTransaction = await prepareLaunchTransaction({
    creatorWallet: input.creatorWallet,
    missionId: id,
    metadataHash,
    metadataUri,
    tokenName: statement,
    tokenSymbol,
    totalSupply,
    initialPurchaseUsdc: input.initialPurchaseUsdc,
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
    tokenPrice: 0.01,
    holders: 1,
    liquidity: Number(input.initialPurchaseUsdc || 0),
    treasuryUsdc: 0,
    treasuryTokens: 10_000_000,
    treasurySupplyPercent: 20,
    totalSupply,
    performance: seed.performance,
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
        totalSupply,
        Number(input.initialPurchaseUsdc || 0),
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

  return transaction(async (client) => {
    const pendingResult = await client.query<PendingMissionLaunchRow>(
      "select * from pending_mission_launches where id = $1 and creator_wallet = $2 and status = 'prepared' for update",
      [input.launchId, input.wallet],
    );
    const pending = pendingResult.rows[0];
    if (!pending) throw new Error("Pending mission launch not found.");

    const seed = fixtureMissions[0];
    const accounts = pending.launch_accounts || {};
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
        JSON.stringify(seed.performance),
      ],
    );
    await client.query(
      `
        insert into mission_metrics (mission_id, token_price_usdc, holders, liquidity_usdc, treasury_usdc, treasury_tokens)
        values ($1, 0.01, 1, $2, 0, 10000000)
      `,
      [pending.id, Number(pending.initial_purchase_usdc || 0)],
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
}

export async function quoteMissionTradeFromPostgres(missionId: string, input: { side?: string; amount?: number; wallet?: string; slippageBps?: number }) {
  const mission = await getMissionByIdFromPostgres(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  const amount = Math.max(Number(input.amount) || 0, 0);
  const side = input.side === "sell" ? "sell" : "buy";
  const isBondingDbc = mission.lifecycle === "bonding" && Boolean(mission.dbcPool);
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
      });

  return {
    missionId,
    side,
    route: "route" in chainQuote ? chainQuote.route : mission.lifecycle === "graduated" ? "amm" : "bonding-curve",
    inputAmount: amount,
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
    transaction: await prepareFundingRequestTransaction({ requesterWallet, missionId: mission.id, requestId: id, metadataHash }),
  };
}

export async function voteFundingRequestInPostgres(requestId: string, input: { wallet?: string; vote?: "approve" | "reject" }) {
  const wallet = input.wallet || currentUser.address;
  if (input.vote !== "approve" && input.vote !== "reject") throw new Error("vote must be approve or reject.");
  const vote = input.vote;

  return transaction(async (client) => {
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

function councilEscrowAmounts(candidates: Array<{ tokens: number }>) {
  return candidates.slice(0, 6).map((candidate) => Math.max(Math.floor(candidate.tokens), 1));
}

export async function prepareCouncilCheckpointInPostgres(input: { missionId?: string; epoch?: number; authorityWallet?: string }) {
  if (!input.missionId) throw new Error("missionId is required.");
  const mission = await getMissionByIdFromPostgres(input.missionId);
  if (!mission) throw new Error(`Mission not found: ${input.missionId}`);
  const epoch = input.epoch ?? 1;
  const candidates = mission.council.slice(0, 6);
  const escrowAmounts = councilEscrowAmounts(candidates);
  const metadataHash = contentHash({ missionId: mission.id, epoch, candidates, escrowAmounts });

  await query(
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
      mission.id,
      epoch,
      JSON.stringify(candidates.map((candidate) => candidate.address)),
      JSON.stringify(candidates.map((candidate) => candidate.tokens)),
      JSON.stringify(escrowAmounts),
    ],
  );

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
