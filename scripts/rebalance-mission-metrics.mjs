/**
 * Realign demo mission market cap and treasury with existing liquidity.
 * Only updates missions seeded with DEMO_CREATOR_WALLET (no on-chain pools).
 */
import pg from "pg";
import {
  DEMO_CREATOR_WALLET,
  metricsFromLiquidity,
} from "./lib/demo-mission-metrics.mjs";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
        select
          m.id,
          m.token_symbol,
          coalesce(m.total_supply, 50000000)::float8 as total_supply,
          coalesce(mm.treasury_tokens, 10000000)::float8 as treasury_tokens,
          coalesce(mm.liquidity_usdc, 0)::float8 as liquidity_usdc,
          coalesce(mm.holders, 0)::int as holders
        from missions m
        inner join mission_metrics mm on mm.mission_id = m.id
        where lower(m.creator_wallet) = lower($1)
          and m.dbc_pool is null
          and m.damm_pool is null
          and m.token_mint is null
        order by mm.liquidity_usdc desc nulls last
      `,
      [DEMO_CREATOR_WALLET],
    );

    if (rows.length === 0) {
      console.log("No demo missions found to rebalance.");
      return;
    }

    await client.query("begin");
    let updated = 0;
    for (const row of rows) {
      const metrics = metricsFromLiquidity(row.liquidity_usdc, row.holders, {
        missionId: row.id,
        totalSupply: row.total_supply,
        treasuryTokens: row.treasury_tokens,
      });

      const result = await client.query(
        `
          update mission_metrics
          set
            token_price_usdc = $2,
            treasury_usdc = $3,
            market_tokens = $4,
            circulating_tokens = $5,
            volume_usdc = $6,
            updated_at = now(),
            market_data_updated_at = now()
          where mission_id = $1
        `,
        [
          row.id,
          metrics.tokenPrice,
          metrics.treasuryUsdc,
          metrics.marketTokens,
          metrics.circulatingTokens,
          metrics.volumeUsdc,
        ],
      );

      if (result.rowCount > 0) updated += 1;
    }
    await client.query("commit");

    console.log(`Rebalanced ${updated} demo missions (liquidity unchanged).`);
    console.log("\nTop 8 by liquidity (cap / treasury @ 20%):");
    for (const row of rows.slice(0, 8)) {
      const m = metricsFromLiquidity(row.liquidity_usdc, row.holders, {
        missionId: row.id,
        totalSupply: row.total_supply,
        treasuryTokens: row.treasury_tokens,
      });
      const capM = (m.marketCapUsd / 1_000_000).toFixed(2);
      const treasM = (m.treasuryUsdc / 1_000_000).toFixed(2);
      const liqM = (m.liquidity / 1_000_000).toFixed(2);
      console.log(
        `  ${row.token_symbol.padEnd(6)} $${liqM}M liq → $${capM}M cap, $${treasM}M treasury (${row.holders.toLocaleString()} holders)`,
      );
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
