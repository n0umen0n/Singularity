import { Connection, PublicKey, type ConfirmedSignatureInfo, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { fetchMeteoraDammV2MarketSnapshot, fetchMeteoraDbcMarketSnapshot } from "@singularity/solana";
import type pg from "pg";

const defaultSource = "singularity-mainnet";
const defaultBatchSize = 50;
const defaultMaxPages = 4;

export type IndexerProgram = {
  id: string;
  kind: "registry" | "council" | "meteora-dbc" | "custom";
};

export type IndexerBatchResult = {
  ok: true;
  source: string;
  platformMetrics: PlatformMetricSnapshot;
  programs: Array<{
    programId: string;
    kind: IndexerProgram["kind"];
    signaturesSeen: number;
    transactionsIndexed: number;
    migrationJobsQueued: number;
    lastSlot: number;
  }>;
};

export type PlatformMetricSnapshot = {
  id: string;
  collected_at: string;
  source: string;
  total_value_locked_usdc: string;
  bonding_value_locked_usdc: string;
  graduated_value_locked_usdc: string;
  treasury_value_usdc: string;
  total_mission_token_volume_usdc: string;
  total_mission_token_market_value_usdc: string;
  circulating_mission_token_market_value_usdc: string;
  funding_requested_value_usdc: string;
  missions_count: string;
  launched_missions_count: string;
  bonding_missions_count: string;
  graduated_missions_count: string;
  dbc_pools_count: string;
  damm_pools_count: string;
  funding_requests_count: string;
  active_funding_requests_count: string;
  accepted_funding_requests_count: string;
  rejected_funding_requests_count: string;
  expired_funding_requests_count: string;
  registered_councillors_count: string;
  unique_councillor_wallets_count: string;
  price_points_count: string;
  raw_chain_events_count: string;
  indexed_transactions_count: string;
  metadata: Record<string, unknown>;
};

export function configuredPrograms(env: NodeJS.ProcessEnv): IndexerProgram[] {
  const programs: IndexerProgram[] = [];
  if (env.SINGULARITY_REGISTRY_PROGRAM_ID) programs.push({ id: env.SINGULARITY_REGISTRY_PROGRAM_ID, kind: "registry" });
  if (env.SINGULARITY_COUNCIL_PROGRAM_ID) programs.push({ id: env.SINGULARITY_COUNCIL_PROGRAM_ID, kind: "council" });
  if (env.SINGULARITY_METEORA_DBC_PROGRAM_ID) programs.push({ id: env.SINGULARITY_METEORA_DBC_PROGRAM_ID, kind: "meteora-dbc" });
  return programs;
}

export function missingIndexerEnv(env: NodeJS.ProcessEnv) {
  return ["SOLANA_RPC_URL", "DATABASE_URL"].filter((key) => !env[key]);
}

export async function runIndexerBatch(input: {
  connection: Connection;
  pool: pg.Pool;
  env: NodeJS.ProcessEnv;
  source?: string;
  batchSize?: number;
  maxPages?: number;
  programs?: IndexerProgram[];
}): Promise<IndexerBatchResult> {
  const source = input.source || defaultSource;
  const batchSize = input.batchSize || defaultBatchSize;
  const maxPages = input.maxPages || defaultMaxPages;
  const programs = input.programs || configuredPrograms(input.env);

  if (programs.length === 0) {
    throw new Error("No indexer programs configured.");
  }

  const results = [];
  for (const program of programs) {
    results.push(await indexProgram({ ...input, source, batchSize, maxPages, program }));
  }
  await syncMissionMarketMetrics(input);
  const platformMetrics = await collectPlatformMetrics(input.pool, source);

  return { ok: true, source, platformMetrics, programs: results };
}

async function syncMissionMarketMetrics(input: { connection: Connection; pool: pg.Pool; env: NodeJS.ProcessEnv }) {
  if (!input.env.SOLANA_RPC_URL) return;

  const missions = await input.pool.query<{
    id: string;
    token_mint: string | null;
    dbc_pool: string | null;
    damm_pool: string | null;
    lifecycle_state: string | null;
    treasury_vault: string | null;
    treasury_supply_percent: string;
    total_supply: string;
    holders: number | null;
  }>(
    `
      select m.id, m.token_mint, m.dbc_pool, m.damm_pool, m.lifecycle_state, m.treasury_vault, m.treasury_supply_percent, m.total_supply, mm.holders
      from missions m
      left join mission_metrics mm on mm.mission_id = m.id
      where (lifecycle_state = 'bonding' and dbc_pool is not null)
         or (lifecycle_state = 'graduated' and damm_pool is not null and token_mint is not null)
    `,
  );

  for (const mission of missions.rows) {
    const snapshot =
      mission.lifecycle_state === "graduated" && mission.damm_pool && mission.token_mint
        ? await fetchMeteoraDammV2MarketSnapshot({
            rpcUrl: input.env.SOLANA_RPC_URL,
            dammPool: mission.damm_pool,
            tokenMint: mission.token_mint,
            treasuryVault: mission.treasury_vault,
            treasurySupplyPercent: Number(mission.treasury_supply_percent || 0),
            totalSupply: Number(mission.total_supply || 0),
          }).catch(() => null)
        : await fetchMeteoraDbcMarketSnapshot({
            rpcUrl: input.env.SOLANA_RPC_URL,
            pool: mission.dbc_pool!,
            tokenMint: mission.token_mint,
            treasuryVault: mission.treasury_vault,
            treasurySupplyPercent: Number(mission.treasury_supply_percent || 0),
            totalSupply: Number(mission.total_supply || 0),
          }).catch(() => null);
    if (!snapshot) continue;

    await input.pool.query(
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
      [mission.id, snapshot.currentPrice, snapshot.holders || mission.holders || 1, snapshot.liquidityUsd, snapshot.treasuryUsdc, snapshot.treasuryTokens],
    );
    await input.pool.query(
      `
        insert into price_points (mission_id, timestamp, price_usdc, volume_usdc, source)
        select $1, now(), $2, 0, $3
        where not exists (
          select 1 from price_points where mission_id = $1 and source = $3 and timestamp > now() - interval '5 minutes'
        )
      `,
      [mission.id, snapshot.currentPrice, `${snapshot.route}-indexer`],
    );
  }
}

async function collectPlatformMetrics(pool: pg.Pool, source: string) {
  const result = await pool.query<PlatformMetricSnapshot>(
    `
      with mission_stats as (
        select
          count(*) as missions_count,
          count(*) filter (
            where m.lifecycle_state <> 'draft' or m.token_mint is not null or m.dbc_pool is not null or m.damm_pool is not null
          ) as launched_missions_count,
          count(*) filter (where m.lifecycle_state = 'bonding') as bonding_missions_count,
          count(*) filter (where m.lifecycle_state = 'graduated') as graduated_missions_count,
          count(*) filter (where m.dbc_pool is not null) as dbc_pools_count,
          count(*) filter (where m.damm_pool is not null) as damm_pools_count,
          coalesce(sum(mm.liquidity_usdc) filter (where m.dbc_pool is not null or m.damm_pool is not null), 0) as total_value_locked_usdc,
          coalesce(sum(mm.liquidity_usdc) filter (where m.lifecycle_state = 'bonding' and m.dbc_pool is not null), 0) as bonding_value_locked_usdc,
          coalesce(sum(mm.liquidity_usdc) filter (where m.lifecycle_state = 'graduated' and m.damm_pool is not null), 0) as graduated_value_locked_usdc,
          coalesce(sum(mm.treasury_usdc), 0) as treasury_value_usdc,
          coalesce(sum(mm.volume_usdc), 0) as total_mission_token_volume_usdc,
          coalesce(sum(coalesce(mm.token_price_usdc, 0) * coalesce(m.total_supply, 0)), 0) as total_mission_token_market_value_usdc,
          coalesce(sum(coalesce(mm.token_price_usdc, 0) * greatest(coalesce(m.total_supply, 0) - coalesce(mm.treasury_tokens, 0), 0)), 0) as circulating_mission_token_market_value_usdc
        from missions m
        left join mission_metrics mm on mm.mission_id = m.id
      ),
      funding_stats as (
        select
          count(*) as funding_requests_count,
          count(*) filter (where status = 'active') as active_funding_requests_count,
          count(*) filter (where status = 'accepted') as accepted_funding_requests_count,
          count(*) filter (where status = 'rejected') as rejected_funding_requests_count,
          count(*) filter (where status = 'expired') as expired_funding_requests_count,
          coalesce(sum(derived_usd_estimate), 0) as funding_requested_value_usdc
        from funding_requests
      ),
      council_stats as (
        select
          count(*) filter (where status = 'registered') as registered_councillors_count,
          count(distinct owner_wallet) filter (where status = 'registered') as unique_councillor_wallets_count
        from council_candidates
      ),
      activity_stats as (
        select
          (select count(*) from price_points) as price_points_count,
          (select count(*) from raw_chain_events) as raw_chain_events_count,
          (select count(distinct signature) from raw_chain_events) as indexed_transactions_count
      )
      insert into platform_metric_snapshots (
        source,
        total_value_locked_usdc,
        bonding_value_locked_usdc,
        graduated_value_locked_usdc,
        treasury_value_usdc,
        total_mission_token_volume_usdc,
        total_mission_token_market_value_usdc,
        circulating_mission_token_market_value_usdc,
        funding_requested_value_usdc,
        missions_count,
        launched_missions_count,
        bonding_missions_count,
        graduated_missions_count,
        dbc_pools_count,
        damm_pools_count,
        funding_requests_count,
        active_funding_requests_count,
        accepted_funding_requests_count,
        rejected_funding_requests_count,
        expired_funding_requests_count,
        registered_councillors_count,
        unique_councillor_wallets_count,
        price_points_count,
        raw_chain_events_count,
        indexed_transactions_count,
        metadata
      )
      select
        $1,
        ms.total_value_locked_usdc,
        ms.bonding_value_locked_usdc,
        ms.graduated_value_locked_usdc,
        ms.treasury_value_usdc,
        ms.total_mission_token_volume_usdc,
        ms.total_mission_token_market_value_usdc,
        ms.circulating_mission_token_market_value_usdc,
        fs.funding_requested_value_usdc,
        ms.missions_count,
        ms.launched_missions_count,
        ms.bonding_missions_count,
        ms.graduated_missions_count,
        ms.dbc_pools_count,
        ms.damm_pools_count,
        fs.funding_requests_count,
        fs.active_funding_requests_count,
        fs.accepted_funding_requests_count,
        fs.rejected_funding_requests_count,
        fs.expired_funding_requests_count,
        cs.registered_councillors_count,
        cs.unique_councillor_wallets_count,
        ast.price_points_count,
        ast.raw_chain_events_count,
        ast.indexed_transactions_count,
        jsonb_build_object(
          'tvlSource', 'mission_metrics.liquidity_usdc',
          'missionTokenVolumeSource', 'mission_metrics.volume_usdc',
          'missionTokenMarketValueSource', 'mission_metrics.token_price_usdc * missions.total_supply',
          'fundingValueSource', 'funding_requests.derived_usd_estimate',
          'collectedAfterMarketSync', true
        )
      from mission_stats ms
      cross join funding_stats fs
      cross join council_stats cs
      cross join activity_stats ast
      returning *
    `,
    [source],
  );

  return result.rows[0];
}

async function indexProgram(input: {
  connection: Connection;
  pool: pg.Pool;
  env: NodeJS.ProcessEnv;
  source: string;
  batchSize: number;
  maxPages: number;
  program: IndexerProgram;
}) {
  await ensureState(input.pool, input.source, input.program.id);
  const indexerSource = programSource(input.source, input.program.id);
  const state = await input.pool.query<{ last_slot: string }>("select last_slot from indexer_state where source = $1", [indexerSource]);
  const startingSlot = Number(state.rows[0]?.last_slot || 0);
  let before: string | undefined;
  let signaturesSeen = 0;
  let transactionsIndexed = 0;
  let migrationJobsQueued = 0;
  let lastSlot = startingSlot;

  for (let page = 0; page < input.maxPages; page += 1) {
    const signatures = await input.connection.getSignaturesForAddress(new PublicKey(input.program.id), { limit: input.batchSize, before }, "confirmed");
    if (signatures.length === 0) break;

    const fresh = signatures.filter((signature) => !signature.err && signature.slot > startingSlot);
    signaturesSeen += signatures.length;
    for (const signatureInfo of fresh.reverse()) {
      const indexed = await indexSignature({ ...input, signatureInfo, indexerSource });
      if (!indexed) continue;
      transactionsIndexed += 1;
      migrationJobsQueued += indexed.migrationJobsQueued;
      lastSlot = Math.max(lastSlot, indexed.slot);
    }

    if (fresh.length < signatures.length) break;
    before = signatures.at(-1)?.signature;
    if (!before) break;
  }

  return {
    programId: input.program.id,
    kind: input.program.kind,
    signaturesSeen,
    transactionsIndexed,
    migrationJobsQueued,
    lastSlot,
  };
}

async function indexSignature(input: {
  connection: Connection;
  pool: pg.Pool;
  env: NodeJS.ProcessEnv;
  source: string;
  program: IndexerProgram;
  indexerSource: string;
  signatureInfo: ConfirmedSignatureInfo;
}) {
  const transaction = await input.connection.getParsedTransaction(input.signatureInfo.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction?.slot) return null;

  const payload = transactionPayload(transaction);
  await input.pool.query(
    `
      insert into raw_chain_events (source, signature, slot, program_id, instruction_index, payload)
      values ($1, $2, $3, $4, 0, $5)
      on conflict (signature, instruction_index) do nothing
    `,
    [input.indexerSource, input.signatureInfo.signature, transaction.slot, input.program.id, payload],
  );
  await input.pool.query("update indexer_state set last_slot = greatest(last_slot, $2), updated_at = now() where source = $1", [
    input.indexerSource,
    transaction.slot,
  ]);

  const migrationJobsQueued = input.program.kind === "meteora-dbc" ? await syncKnownMeteoraMigration({ ...input, transaction, payload }) : 0;

  return { slot: transaction.slot, migrationJobsQueued };
}

async function syncKnownMeteoraMigration(input: {
  pool: pg.Pool;
  source: string;
  program: IndexerProgram;
  signatureInfo: ConfirmedSignatureInfo;
  transaction: ParsedTransactionWithMeta;
  payload: string;
}) {
  await input.pool.query(
    `
      insert into raw_chain_events (source, signature, slot, program_id, instruction_index, payload)
      values ($1, $2, $3, $4, 1, $5)
      on conflict (signature, instruction_index) do nothing
    `,
    [`${input.source}:meteora-graduation-candidate`, input.signatureInfo.signature, input.transaction.slot, input.program.id, input.payload],
  );

  const missions = await input.pool.query<{ id: string; dbc_pool: string }>("select id, dbc_pool from missions where dbc_pool is not null");
  let queued = 0;

  for (const mission of missions.rows) {
    if (!input.payload.includes(mission.dbc_pool)) continue;

    await input.pool.query(
      `
        insert into migration_reconciliation_jobs (mission_id, dbc_pool, signature, slot, status)
        values ($1, $2, $3, $4, 'pending')
        on conflict (dbc_pool, signature) do update set
          slot = excluded.slot,
          updated_at = now()
      `,
      [mission.id, mission.dbc_pool, input.signatureInfo.signature, input.transaction.slot],
    );
    queued += 1;
  }

  return queued;
}

async function ensureState(pool: pg.Pool, source: string, programId: string) {
  await pool.query(
    `
      insert into indexer_state (source, last_slot)
      values ($1, 0)
      on conflict (source) do nothing
    `,
    [programSource(source, programId)],
  );
}

function programSource(source: string, programId: string) {
  return `${source}:${programId}`;
}

function transactionPayload(transaction: ParsedTransactionWithMeta) {
  return JSON.stringify({
    blockTime: transaction.blockTime,
    meta: transaction.meta,
    transaction: transaction.transaction,
  });
}
