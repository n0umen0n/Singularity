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

const councilNames = ["Ren", "Kai", "Elio", "Tess", "Wren", "Noor"];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function performance(base) {
  const point = (label, agoLabel, multiplier) => {
    const value = Number((base * multiplier).toFixed(2));
    return { label, agoLabel, value, change: value - 100 };
  };
  return {
    "1H": point("1 hour", "1 hour ago", 1.009),
    "4H": point("4 hours", "4 hours ago", 1.031),
    "1D": point("1 day", "1 day ago", 1.08),
    "1W": point("1 week", "1 week ago", 1.22),
    "1M": point("1 month", "1 month ago", 1.54),
    "6M": point("6 months", "6 months ago", 2.1),
    "1Y": point("1 year", "1 year ago", 2.95),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `St${index}Co${symbol}${index}7xQa${index}52R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((760000 - index * 81000) * multiplier),
    ownership: Number((6.4 - index * 0.62).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

const startupMissions = [
  {
    id: "lumen-health-sleep-wearable-f4a1",
    statement: "Bring clinical-grade sleep apnea detection into every home with Lumen Health",
    description:
      "Austin-based startup building a soft-form wearable that detects apnea events at home. Capital covers pilot manufacturing, FDA pathway work, and clinician onboarding ahead of its direct-to-consumer launch.",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "LUMN",
    lifecycle: "graduated",
    marketCapUsd: 356000,
    liquidityUsd: 472000,
    holders: 621,
    councilMultiplier: 1.08,
    perfBase: 106,
    daysAgo: 3,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund 500-unit pilot manufacturing run",
        description: "Covers PCB assembly, soft-band tooling, and packaging for the first clinical pilot cohort and early preorder backers.",
        requester: "Lumen Health Ops",
        amountUsd: 22400,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 11,
      },
      {
        idSuffix: "r2",
        title: "Clinical validation study with sleep lab partners",
        description: "Three-site study comparing Lumen signal quality against in-lab polysomnography before the Q4 consumer rollout.",
        requester: "Dr. Amira Solis",
        amountUsd: 15800,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 88,
      },
      {
        idSuffix: "r3",
        title: "Celebrity ambassador campaign",
        description: "Influencer spend without tied product milestones or post-market surveillance budget.",
        requester: "Northwind Media",
        amountUsd: 32000,
        status: "rejected",
        approvals: 1,
        rejections: 4,
        hoursAgo: 150,
      },
    ],
  },
  {
    id: "parcel-robotics-campus-delivery-a8c2",
    statement: "Replace campus delivery vans with Parcel Robotics sidewalk bots",
    description:
      "Seed-stage company deploying weatherproof sidewalk bots for universities and corporate parks. This raise finances ten pilot units, fleet dispatch software, and operator training across three live sites.",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1596495578065-6e0763fa1178?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "PARC",
    lifecycle: "bonding",
    marketCapUsd: 189000,
    liquidityUsd: 157000,
    holders: 473,
    councilMultiplier: 0.86,
    perfBase: 99,
    daysAgo: 5,
    requests: [
      {
        idSuffix: "r1",
        title: "Deploy ten robots at Riverside University",
        description: "Hardware shipment, on-site mapping, charging dock install, and a four-week operator handoff for the first campus contract.",
        requester: "Parcel Robotics",
        amountUsd: 13200,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 9,
      },
      {
        idSuffix: "r2",
        title: "Build fleet health dashboard v1",
        description: "Real-time battery, route exception, and maintenance alerts for campus facilities teams and Parcel dispatch.",
        requester: "Morgan Lee",
        amountUsd: 7800,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 64,
      },
    ],
  },
  {
    id: "kova-kitchen-smart-appliance-b1d3",
    statement: "Make balanced weeknight meals effortless with Kova Kitchen's counter-top system",
    description:
      "Brooklyn hardware startup building a compact appliance that portions, cooks, and logs macros for busy households. Funds go toward injection tooling, safety certification, and the first 500 preorder units.",
    image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1497440001374-f26997328c1b?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "KOVA",
    lifecycle: "bonding",
    marketCapUsd: 92000,
    liquidityUsd: 9500,
    holders: 341,
    councilMultiplier: 0.58,
    perfBase: 94,
    daysAgo: 7,
    requests: [
      {
        idSuffix: "r1",
        title: "Injection mold tooling for production shell",
        description: "Tooling deposit and first article inspection for the heat-resistant exterior and sealed cooking chamber.",
        requester: "Kova Kitchen",
        amountUsd: 11400,
        status: "active",
        approvals: 2,
        rejections: 2,
        hoursAgo: 16,
      },
      {
        idSuffix: "r2",
        title: "UL and kitchen safety certification sprint",
        description: "Third-party lab testing, documentation, and rework budget to clear retail and marketplace requirements.",
        requester: "Priya Nair",
        amountUsd: 6900,
        status: "accepted",
        approvals: 4,
        rejections: 1,
        hoursAgo: 110,
      },
    ],
  },
  {
    id: "northline-battery-ebike-pack-c6e4",
    statement: "Power urban e-bikes with Northline Battery's lighter, swappable solid-state packs",
    description:
      "Vancouver cleantech company commercializing a lighter solid-state pack with swappable mounts. Capital supports line setup, safety testing, and distributor partnerships across North America.",
    image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "NRLN",
    lifecycle: "graduated",
    marketCapUsd: 267000,
    liquidityUsd: 548000,
    holders: 698,
    councilMultiplier: 0.98,
    perfBase: 111,
    daysAgo: 2,
    requests: [
      {
        idSuffix: "r1",
        title: "Calibrate automated assembly line",
        description: "Equipment tuning, QA fixtures, and yield monitoring for the first 2,000-pack production batch.",
        requester: "Northline Manufacturing",
        amountUsd: 17600,
        status: "active",
        approvals: 4,
        rejections: 0,
        hoursAgo: 7,
      },
      {
        idSuffix: "r2",
        title: "UL 2271 and UN38.3 compliance testing",
        description: "Certification lab fees, sample builds, and redesign buffer before shipping to bike OEM partners.",
        requester: "Elena Voss",
        amountUsd: 12100,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 52,
      },
      {
        idSuffix: "r3",
        title: "Brand refresh and trade show booth",
        description: "Marketing-heavy ask without a tied shipment milestone or distributor onboarding plan.",
        requester: "Brightline Creative",
        amountUsd: 18500,
        status: "rejected",
        approvals: 0,
        rejections: 5,
        hoursAgo: 130,
      },
    ],
  },
  {
    id: "studio-forma-ai-staging-d2f5",
    statement: "Help property managers turn empty rentals into furnished listings with Studio Forma",
    description:
      "Design-tech startup that generates furnished listing photos in minutes. This round funds model training, MLS integrations, and a paid pilot with three regional property managers.",
    image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FORMA",
    lifecycle: "bonding",
    marketCapUsd: 145000,
    liquidityUsd: 63000,
    holders: 512,
    councilMultiplier: 0.74,
    perfBase: 101,
    daysAgo: 4,
    requests: [
      {
        idSuffix: "r1",
        title: "Integrate with three regional MLS feeds",
        description: "API adapters, listing sync jobs, and broker onboarding flows for the Denver, Phoenix, and Austin pilots.",
        requester: "Studio Forma",
        amountUsd: 9800,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 13,
      },
      {
        idSuffix: "r2",
        title: "GPU render farm credits for launch quarter",
        description: "Cloud compute budget to keep turnaround under five minutes during the first 1,000 staged listings.",
        requester: "James Okonkwo",
        amountUsd: 5400,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 76,
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
      `
        insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status)
        values ($1, $2, $3, 'registered')
      `,
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
      `
        insert into price_points (mission_id, timestamp, price_usdc, volume_usdc, source)
        values ($1, $2, $3, $4, 'seed')
      `,
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
      await client.query(
        `insert into funding_request_votes (request_id, voter_wallet, vote) values ($1, $2, $3)`,
        [requestId, voters[i].address, vote],
      );
    }
  }

  console.log(
    `Inserted ${mission.tokenSymbol}: ${mission.holders} holders, ~$${Math.round(mission.marketCapUsd / 1000)}k cap, ${mission.requests.length} requests`,
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
