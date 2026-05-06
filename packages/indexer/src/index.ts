import { Connection, PublicKey, type ConfirmedSignatureInfo, type ParsedTransactionWithMeta } from "@solana/web3.js";
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
  programs: Array<{
    programId: string;
    kind: IndexerProgram["kind"];
    signaturesSeen: number;
    transactionsIndexed: number;
    migrationJobsQueued: number;
    lastSlot: number;
  }>;
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

  return { ok: true, source, programs: results };
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
