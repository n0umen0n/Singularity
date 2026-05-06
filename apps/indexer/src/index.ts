import { Connection } from "@solana/web3.js";
import pg from "pg";
import { configuredPrograms, missingIndexerEnv, runIndexerBatch } from "@singularity/indexer-core";

const { Pool } = pg;

async function main() {
  const missing = missingIndexerEnv(process.env);

  if (missing.length > 0) {
    console.log(`Singularity indexer is configured but not running. Configure ${missing.join(", ")} before live indexing.`);
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
  const programs = configuredPrograms(process.env);

  console.log("Singularity indexer starting...");

  try {
    const result = await runIndexerBatch({ connection, pool, env: process.env, programs });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
