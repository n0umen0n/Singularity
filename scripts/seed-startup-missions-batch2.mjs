import { createHash } from "node:crypto";
import pg from "pg";
import { metricsFromLiquidity } from "./lib/demo-mission-metrics.mjs";

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

const TOTAL_SUPPLY = 50_000_000;
const TREASURY_TOKENS = 10_000_000;
const CREATOR_WALLET = "DemoSingularityCreator1111111111111111111111";

const avatars = [
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80",
];

const councilNames = ["Iris", "Milo", "Sage", "Theo", "Vera", "Zane"];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function performance(base) {
  const point = (label, agoLabel, multiplier) => {
    const value = Number((base * multiplier).toFixed(2));
    return { label, agoLabel, value, change: value - 100 };
  };
  return {
    "1H": point("1 hour", "1 hour ago", 1.012),
    "4H": point("4 hours", "4 hours ago", 1.038),
    "1D": point("1 day", "1 day ago", 1.095),
    "1W": point("1 week", "1 week ago", 1.31),
    "1M": point("1 month", "1 month ago", 1.72),
    "6M": point("6 months", "6 months ago", 2.48),
    "1Y": point("1 year", "1 year ago", 3.6),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `St2${index}Co${symbol}${index}9xQa${index}63R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((820000 - index * 88000) * multiplier),
    ownership: Number((6.8 - index * 0.68).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

const startupMissions = [
  {
    id: "pulse-cardiac-ai-wearable-c7f2",
    statement: "Catch arrhythmias early with Pulse, a continuous cardiac AI wearable",
    description:
      "San Francisco startup building a medical-grade chest patch that streams ECG context to clinicians and flags arrhythmia risk before ER visits. Capital funds FDA pathway work, pilot manufacturing, and cardiology clinic onboarding.",
    image: "https://images.unsplash.com/photo-1776761916500-f639da084b7b?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1690787628851-d36e285c29b0?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "PULSE",
    lifecycle: "graduated",
    marketCapUsd: 724000,
    liquidityUsd: 2650000,
    holders: 22100,
    councilMultiplier: 1.14,
    perfBase: 112,
    daysAgo: 1,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund 1,000-unit clinical pilot manufacturing run",
        description: "Patch assembly, adhesive biocompatibility testing, and packaging for the first multi-site cardiology pilot.",
        requester: "Pulse Health Ops",
        amountUsd: 24800,
        status: "active",
        approvals: 5,
        rejections: 0,
        hoursAgo: 6,
      },
      {
        idSuffix: "r2",
        title: "Prospective arrhythmia detection study",
        description: "Six-month cohort comparing Pulse alerts against Holter reference standards across three hospital partners.",
        requester: "Dr. Naomi Park",
        amountUsd: 17200,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 54,
      },
    ],
  },
  {
    id: "volt-residential-battery-wall-d8a3",
    statement: "Power homes through outages with Volt's apartment-scale battery wall",
    description:
      "Berlin cleantech startup shipping a slim 10 kWh wall unit with grid-forming inverter firmware for European apartments. Funds cover certification, first 800-unit production run, and installer partner rollout.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "VOLT",
    lifecycle: "graduated",
    marketCapUsd: 612000,
    liquidityUsd: 2100000,
    holders: 18600,
    councilMultiplier: 1.1,
    perfBase: 109,
    daysAgo: 2,
    requests: [
      {
        idSuffix: "r1",
        title: "CE and grid-interconnect certification sprint",
        description: "Lab fees, firmware hardening, and documentation for VDE and utility interconnect approvals.",
        requester: "Volt Energy",
        amountUsd: 19600,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 8,
      },
      {
        idSuffix: "r2",
        title: "Installer training and first 800-unit production batch",
        description: "Line setup, QA fixtures, and partner onboarding for Munich and Amsterdam pilot cities.",
        requester: "Elena Brandt",
        amountUsd: 13800,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 72,
      },
    ],
  },
];

function votingEndsAtFromCreatedAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

async function insertMission(client, mission) {
  const existing = await client.query("select id from missions where id = $1", [mission.id]);
  if (existing.rows.length > 0) {
    console.log(`Skipping ${mission.tokenSymbol}: already exists.`);
    return false;
  }

  const councilMembers = council(mission.id, mission.tokenSymbol, mission.councilMultiplier);
  const metrics = metricsFromLiquidity(mission.liquidityUsd, mission.holders, { missionId: mission.id });
  const metadataHash = hash({ id: mission.id, statement: mission.statement, symbol: mission.tokenSymbol });
  const perf = performance(mission.perfBase);
  const createdAt = new Date(Date.now() - mission.daysAgo * 24 * 60 * 60 * 1000).toISOString();

  await client.query(
    `
      insert into missions (
        id, creator_wallet, lifecycle_state, metadata_hash, statement, description,
        image_url, token_image_url, token_symbol, total_supply, treasury_supply_percent,
        performance_json, council_json, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 20, $11, $12, $13)
    `,
    [
      mission.id,
      CREATOR_WALLET,
      mission.lifecycle,
      metadataHash,
      mission.statement,
      mission.description,
      mission.image,
      mission.tokenImage,
      mission.tokenSymbol,
      TOTAL_SUPPLY,
      JSON.stringify(perf),
      JSON.stringify(councilMembers),
      createdAt,
    ],
  );

  await client.query(
    `
      insert into mission_metrics (
        mission_id, token_price_usdc, holders, liquidity_usdc, treasury_usdc, treasury_tokens,
        market_tokens, circulating_tokens, pool_progress_percent, volume_usdc, market_data_updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    `,
    [
      mission.id,
      metrics.tokenPrice,
      metrics.holders,
      metrics.liquidity,
      metrics.treasuryUsdc,
      TREASURY_TOKENS,
      metrics.marketTokens,
      metrics.circulatingTokens,
      mission.lifecycle === "graduated" ? 100 : 72.5,
      metrics.volumeUsdc,
    ],
  );

  for (const member of councilMembers) {
    await client.query(
      `insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status) values ($1, $2, $3, 'registered')`,
      [mission.id, member.address, Math.round(member.tokens * 1_000_000)],
    );
  }

  await client.query(
    `
      insert into epoch_councils (mission_id, epoch_number, member_wallets, checkpoint_balances, escrow_amounts)
      values ($1, 1, $2, $3, $4)
    `,
    [
      mission.id,
      JSON.stringify(councilMembers.map((member) => member.address)),
      JSON.stringify(councilMembers.map((member) => member.tokens)),
      JSON.stringify(councilMembers.map(() => "0")),
    ],
  );

  const priceNow = metrics.tokenPrice;
  for (const point of [
    { daysAgo: 30, factor: 0.84 },
    { daysAgo: 14, factor: 0.92 },
    { daysAgo: 7, factor: 0.97 },
    { daysAgo: 1, factor: 0.995 },
    { daysAgo: 0, factor: 1 },
  ]) {
    await client.query(
      `insert into price_points (mission_id, timestamp, price_usdc, volume_usdc, source) values ($1, $2, $3, $4, 'seed')`,
      [mission.id, new Date(Date.now() - point.daysAgo * 24 * 60 * 60 * 1000).toISOString(), priceNow * point.factor, metrics.volumeUsdc * 0.2],
    );
  }

  for (const request of mission.requests) {
    const requestId = `${mission.id}-${request.idSuffix}`;
    const createdAtRequest = new Date(Date.now() - request.hoursAgo * 60 * 60 * 1000).toISOString();
    const tokenAmount = request.amountUsd / metrics.tokenPrice;
    const requesterWallet = `Req${request.idSuffix}${mission.tokenSymbol}${requestId.length}WalletDemo111111111`;
    const requestMetadataHash = hash({ requestId, title: request.title });

    await client.query(
      `
        insert into funding_requests (
          id, mission_id, requester_wallet, recipient_wallet, mission_token_amount,
          derived_usd_estimate, status, metadata_hash, title, description,
          epoch_number, voting_starts_at, voting_ends_at, created_at
        )
        values ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, $10)
      `,
      [
        requestId,
        mission.id,
        requesterWallet,
        tokenAmount,
        request.amountUsd,
        request.status,
        requestMetadataHash,
        request.title,
        request.description,
        createdAtRequest,
        votingEndsAtFromCreatedAt(createdAtRequest),
      ],
    );

    const voters = councilMembers.slice(0, Math.max(request.approvals + request.rejections, 1));
    let approveIndex = 0;
    let rejectIndex = 0;
    for (let i = 0; i < voters.length; i += 1) {
      let vote = "approve";
      if (approveIndex < request.approvals) {
        approveIndex += 1;
      } else if (rejectIndex < request.rejections) {
        vote = "reject";
        rejectIndex += 1;
      } else {
        break;
      }
      await client.query(`insert into funding_request_votes (request_id, voter_wallet, vote) values ($1, $2, $3)`, [
        requestId,
        voters[i].address,
        vote,
      ]);
    }
  }

  console.log(
    `Inserted ${mission.tokenSymbol}: ${mission.holders} holders, ~$${Math.round(mission.marketCapUsd / 1000)}k cap, $${(mission.liquidityUsd / 1_000_000).toFixed(1)}M liq`,
  );
  return true;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    let inserted = 0;
    for (const mission of startupMissions) {
      if (await insertMission(client, mission)) inserted += 1;
    }
    await client.query("commit");
    console.log(`Done. Added ${inserted} startup missions (${startupMissions.length - inserted} skipped).`);
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
