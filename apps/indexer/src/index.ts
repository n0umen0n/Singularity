import { Connection, PublicKey } from "@solana/web3.js";
import pg from "pg";

const { Pool } = pg;
const requiredEnv = ["SOLANA_RPC_URL", "DATABASE_URL", "SINGULARITY_REGISTRY_PROGRAM_ID", "SINGULARITY_COUNCIL_PROGRAM_ID"];
const source = "singularity-mainnet";
const batchSize = 50;

async function main() {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.log(`Singularity indexer is configured but not running. Configure ${missing.join(", ")} before live indexing.`);
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
  const programs = [
    process.env.SINGULARITY_REGISTRY_PROGRAM_ID!,
    process.env.SINGULARITY_COUNCIL_PROGRAM_ID!,
    process.env.SINGULARITY_METEORA_DBC_PROGRAM_ID,
  ].filter((programId): programId is string => Boolean(programId));

  console.log("Singularity indexer starting...");

  try {
    for (const programId of programs) {
      await indexProgram({ connection, pool, programId });
    }
  } finally {
    await pool.end();
  }
}

function programSource(programId: string) {
  return `${source}:${programId}`;
}

async function ensureState(pool: pg.Pool, programId: string) {
  await pool.query(
    `
      insert into indexer_state (source, last_slot)
      values ($1, 0)
      on conflict (source) do nothing
    `,
    [programSource(programId)],
  );
}

async function indexProgram(input: { connection: Connection; pool: pg.Pool; programId: string }) {
  await ensureState(input.pool, input.programId);
  const indexerSource = programSource(input.programId);
  const state = await input.pool.query<{ last_slot: string }>("select last_slot from indexer_state where source = $1", [indexerSource]);
  const lastSlot = Number(state.rows[0]?.last_slot || 0);
  const program = new PublicKey(input.programId);
  const signatures = await input.connection.getSignaturesForAddress(program, { limit: batchSize }, "confirmed");

  for (const signatureInfo of signatures.reverse()) {
    if (signatureInfo.err) continue;
    if (signatureInfo.slot <= lastSlot) continue;

    const transaction = await input.connection.getParsedTransaction(signatureInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction?.slot) continue;

    await input.pool.query(
      `
        insert into raw_chain_events (source, signature, slot, program_id, instruction_index, payload)
        values ($1, $2, $3, $4, 0, $5)
        on conflict (signature, instruction_index) do nothing
      `,
      [
        indexerSource,
        signatureInfo.signature,
        transaction.slot,
        input.programId,
        JSON.stringify({
          blockTime: transaction.blockTime,
          meta: transaction.meta,
          transaction: transaction.transaction,
        }),
      ],
    );
    await input.pool.query("update indexer_state set last_slot = greatest(last_slot, $2), updated_at = now() where source = $1", [
      indexerSource,
      transaction.slot,
    ]);
    await syncKnownMeteoraMigration({
      pool: input.pool,
      programId: input.programId,
      signature: signatureInfo.signature,
      payload: transaction,
    });
  }
}

async function syncKnownMeteoraMigration(input: {
  pool: pg.Pool;
  programId: string;
  signature: string;
  payload: NonNullable<Awaited<ReturnType<Connection["getParsedTransaction"]>>>;
}) {
  const meteoraProgramId = process.env.SINGULARITY_METEORA_DBC_PROGRAM_ID;
  if (!meteoraProgramId || input.programId !== meteoraProgramId) return;

  const fullPayload = JSON.stringify({
    blockTime: input.payload.blockTime,
    meta: input.payload.meta,
    transaction: input.payload.transaction,
  });
  // Full DBC event decoding belongs here once the production pool config is fixed.
  // Until then, preserve full raw transactions and enqueue jobs for known DBC pools
  // so a graduation worker can submit mark_graduated after resolving the DAMM pool.
  await input.pool.query(
    `
      insert into raw_chain_events (source, signature, slot, program_id, instruction_index, payload)
      values ($1, $2, $3, $4, 1, $5)
      on conflict (signature, instruction_index) do nothing
    `,
    [
      `${source}:meteora-graduation-candidate`,
      input.signature,
      input.payload.slot,
      input.programId,
      fullPayload,
    ],
  );
  const missions = await input.pool.query<{ id: string; dbc_pool: string }>("select id, dbc_pool from missions where dbc_pool is not null");

  for (const mission of missions.rows) {
    if (!fullPayload.includes(mission.dbc_pool)) continue;

    await input.pool.query(
      `
        insert into migration_reconciliation_jobs (mission_id, dbc_pool, signature, slot, status)
        values ($1, $2, $3, $4, 'pending')
        on conflict (dbc_pool, signature) do update set
          slot = excluded.slot,
          updated_at = now()
      `,
      [mission.id, mission.dbc_pool, input.signature, input.payload.slot],
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
