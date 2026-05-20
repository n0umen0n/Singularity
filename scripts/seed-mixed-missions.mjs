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

const councilNames = ["Astra", "Vector", "Mira", "Halden", "Nyx", "Sable"];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function performance(base) {
  const point = (label, agoLabel, multiplier) => {
    const value = Number((base * multiplier).toFixed(2));
    return { label, agoLabel, value, change: value - 100 };
  };
  return {
    "1H": point("1 hour", "1 hour ago", 1.011),
    "4H": point("4 hours", "4 hours ago", 1.035),
    "1D": point("1 day", "1 day ago", 1.09),
    "1W": point("1 week", "1 week ago", 1.28),
    "1M": point("1 month", "1 month ago", 1.65),
    "6M": point("6 months", "6 months ago", 2.35),
    "1Y": point("1 year", "1 year ago", 3.4),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `Mx${index}Mi${symbol}${index}8xQa${index}41R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((800000 - index * 85000) * multiplier),
    ownership: Number((6.7 - index * 0.65).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

const mixedMissions = [
  {
    id: "decode-rare-enzyme-pathways-a3b1",
    type: "research goal",
    statement: "Decode rare enzyme pathways to unlock patient-specific treatments",
    description:
      "A translational research mission funding wet-lab screening, open assay datasets, and clinician partnerships focused on ultra-rare metabolic disorders.",
    image: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "ENZY",
    lifecycle: "graduated",
    marketCapUsd: 312000,
    liquidityUsd: 395000,
    holders: 589,
    councilMultiplier: 1.02,
    perfBase: 107,
    daysAgo: 6,
    requests: [
      {
        idSuffix: "r1",
        title: "High-throughput enzyme variant screen",
        description: "Run 240 candidate variants through the shared assay pipeline and publish raw readouts for downstream modeling teams.",
        requester: "Dr. Lina Cho",
        amountUsd: 16400,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 12,
      },
      {
        idSuffix: "r2",
        title: "Patient registry data harmonization sprint",
        description: "Normalize phenotype records from three partner clinics into the mission's open research schema.",
        requester: "RarePath Lab",
        amountUsd: 9200,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 90,
      },
    ],
  },
  {
    id: "verid-identity-proof-protocol-b4c2",
    type: "protocol",
    statement: "Build a privacy-preserving identity proof layer developers can trust",
    description:
      "Protocol mission backing zero-knowledge credential proofs, reference SDKs, and audited verifier contracts for apps that need identity without surveillance.",
    image: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "VERID",
    lifecycle: "graduated",
    marketCapUsd: 248000,
    liquidityUsd: 328000,
    holders: 651,
    councilMultiplier: 0.96,
    perfBase: 104,
    daysAgo: 8,
    requests: [
      {
        idSuffix: "r1",
        title: "Ship Verid verifier SDK v0.9",
        description: "TypeScript and Rust SDKs with test vectors, replay protection, and wallet integration examples.",
        requester: "Verid Core Team",
        amountUsd: 11800,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 10,
      },
      {
        idSuffix: "r2",
        title: "Independent circuit audit",
        description: "Third-party review of the credential nullifier and age-proof circuits before mainnet deployment.",
        requester: "OpenProof Security",
        amountUsd: 14500,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 70,
      },
    ],
  },
  {
    id: "fixit-neighborhood-tool-library-c5d3",
    type: "community",
    statement: "Keep neighborhood tools circulating through a shared repair collective",
    description:
      "Community mission stocking lending libraries, hosting monthly repair nights, and training volunteers to fix appliances instead of sending them to landfill.",
    image: "https://images.unsplash.com/photo-1759200165738-6366977a73c6?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1774645215883-14d1553f3fa0?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FIXIT",
    lifecycle: "bonding",
    marketCapUsd: 74000,
    liquidityUsd: 2800,
    holders: 298,
    councilMultiplier: 0.55,
    perfBase: 93,
    daysAgo: 11,
    requests: [
      {
        idSuffix: "r1",
        title: "Open a second tool library branch",
        description: "Lease, shelving, checkout system, and starter inventory for power tools and sewing machines in the east district.",
        requester: "Fixit Collective",
        amountUsd: 6800,
        status: "active",
        approvals: 2,
        rejections: 1,
        hoursAgo: 20,
      },
    ],
  },
  {
    id: "orbit-independent-sci-fi-film-d6e4",
    type: "creative project",
    statement: "Finish an independent animated sci-fi short about a drifting archive ship",
    description:
      "Creative mission financing storyboarding, voice production, and render farm time for a 22-minute animated film releasing under a Creative Commons license.",
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "ORBIT",
    lifecycle: "bonding",
    marketCapUsd: 112000,
    liquidityUsd: 17000,
    holders: 367,
    councilMultiplier: 0.71,
    perfBase: 98,
    daysAgo: 9,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund final animation render pass",
        description: "Cloud render credits and compositing for the last three sequences of the archive-ship third act.",
        requester: "Orbit Studio",
        amountUsd: 8900,
        status: "active",
        approvals: 3,
        rejections: 2,
        hoursAgo: 15,
      },
      {
        idSuffix: "r2",
        title: "Original score recording sessions",
        description: "Studio time, musicians, and mixing for the film's main theme and ambient cues.",
        requester: "Mira Tanaka",
        amountUsd: 5200,
        status: "accepted",
        approvals: 4,
        rejections: 1,
        hoursAgo: 82,
      },
    ],
  },
  {
    id: "airly-city-air-quality-network-e7f5",
    type: "public good",
    statement: "Give every city block open access to real-time air quality readings",
    description:
      "Public-good mission deploying low-cost particulate sensors, publishing open APIs, and training residents to interpret local pollution spikes.",
    image: "https://images.unsplash.com/photo-1761530376307-bf87d053a1c7?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1747224317356-d4a8c380b028?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "AIRLY",
    lifecycle: "bonding",
    marketCapUsd: 176000,
    liquidityUsd: 118000,
    holders: 445,
    councilMultiplier: 0.82,
    perfBase: 100,
    daysAgo: 10,
    requests: [
      {
        idSuffix: "r1",
        title: "Deploy 120 sensors across two boroughs",
        description: "Hardware, mounting kits, calibration, and a public dashboard with hourly PM2.5 and ozone readings.",
        requester: "Airly Civic Lab",
        amountUsd: 10400,
        status: "active",
        approvals: 4,
        rejections: 0,
        hoursAgo: 8,
      },
      {
        idSuffix: "r2",
        title: "Community air literacy workshops",
        description: "Ten neighborhood sessions teaching residents how to read sensor data and advocate for clean-air policy.",
        requester: "Eastside Parents Union",
        amountUsd: 4600,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 95,
      },
    ],
  },
  {
    id: "aqua-field-water-purifier-f8a6",
    type: "product",
    statement: "Put a field-ready water purifier in the hands of disaster response teams",
    description:
      "Product mission developing a compact solar-powered purifier that clears turbidity and pathogens within minutes, built for rapid deployment after floods and outages.",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "AQUA",
    lifecycle: "graduated",
    marketCapUsd: 228000,
    liquidityUsd: 261000,
    holders: 521,
    councilMultiplier: 0.91,
    perfBase: 105,
    daysAgo: 7,
    requests: [
      {
        idSuffix: "r1",
        title: "Build 200 pre-positioned response units",
        description: "Manufacturing run, crate packaging, and warehouse staging for regional emergency coordinators.",
        requester: "Aqua Response",
        amountUsd: 15200,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 6,
      },
      {
        idSuffix: "r2",
        title: "Field validation in flood-affected counties",
        description: "Pilot deployment with two NGOs, water sample logging, and technician training materials.",
        requester: "Relief Forward",
        amountUsd: 8700,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 58,
      },
    ],
  },
  {
    id: "luna-greenhouse-growth-cycle-a9b7",
    type: "ambitious outcome",
    statement: "Prove plants can complete a full growth cycle in lunar greenhouse conditions",
    description:
      "Ambitious outcome mission funding regolith simulant trials, closed-loop life-support tests, and open telemetry from a long-duration lunar habitat experiment.",
    image: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "LUNA",
    lifecycle: "graduated",
    marketCapUsd: 388000,
    liquidityUsd: 682000,
    holders: 812,
    councilMultiplier: 1.18,
    perfBase: 112,
    daysAgo: 4,
    requests: [
      {
        idSuffix: "r1",
        title: "Run 90-day closed-loop greenhouse trial",
        description: "Simulated lunar lighting, nutrient recycling, and full seed-to-harvest telemetry published as open data.",
        requester: "Luna Habitat Lab",
        amountUsd: 24800,
        status: "active",
        approvals: 5,
        rejections: 0,
        hoursAgo: 5,
      },
      {
        idSuffix: "r2",
        title: "Regolith nutrient substrate research sprint",
        description: "Compare three substrate mixes for root development and water retention under reduced gravity stress models.",
        requester: "Dr. Omar Haddad",
        amountUsd: 13600,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 48,
      },
      {
        idSuffix: "r3",
        title: "Merchandise pre-sale campaign",
        description: "T-shirt and poster drop without a linked experiment milestone or lab reporting schedule.",
        requester: "Moonbrand Co.",
        amountUsd: 19000,
        status: "rejected",
        approvals: 0,
        rejections: 5,
        hoursAgo: 120,
      },
    ],
  },
  {
    id: "deep-sea-microbiome-catalog-b1c8",
    type: "research goal",
    statement: "Catalog deep-sea microbial communities before they're lost to warming oceans",
    description:
      "Research mission supporting expedition sample collection, DNA sequencing, and a public atlas of deep-ocean microbiomes for climate and biotech researchers.",
    image: "https://images.unsplash.com/photo-1543083356-ee85ba172c9e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1767145097475-0d16ec184a8c?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "DEEP",
    lifecycle: "bonding",
    marketCapUsd: 156000,
    liquidityUsd: 89000,
    holders: 402,
    councilMultiplier: 0.79,
    perfBase: 97,
    daysAgo: 12,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund mid-Atlantic expedition sampling leg",
        description: "ROV time, core extractions, cold-chain shipping, and initial sequencing for 80 deep-sea sites.",
        requester: "Deep Atlas Project",
        amountUsd: 12800,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 17,
      },
    ],
  },
  {
    id: "ride-rural-mutual-aid-network-c2d9",
    type: "community",
    statement: "Connect rural counties with a volunteer mutual-aid ride network",
    description:
      "Community mission coordinating volunteer drivers, shared dispatch tools, and fuel stipends so residents without transit can reach clinics and jobs.",
    image: "https://images.unsplash.com/photo-1624953505056-54a09f315022?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1685984351000-d238549d4ce9?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "RIDE",
    lifecycle: "bonding",
    marketCapUsd: 88000,
    liquidityUsd: 5200,
    holders: 334,
    councilMultiplier: 0.61,
    perfBase: 95,
    daysAgo: 13,
    requests: [
      {
        idSuffix: "r1",
        title: "Launch dispatch app for three counties",
        description: "Driver onboarding, route matching, SMS fallback, and moderator tooling for overnight ride requests.",
        requester: "Ridge County Mutual Aid",
        amountUsd: 7200,
        status: "active",
        approvals: 2,
        rejections: 2,
        hoursAgo: 19,
      },
      {
        idSuffix: "r2",
        title: "Fuel stipend pool for winter coverage",
        description: "Three-month stipend reserve so volunteers can cover long clinic runs during the snow season.",
        requester: "Helena Marsh",
        amountUsd: 4800,
        status: "accepted",
        approvals: 4,
        rejections: 1,
        hoursAgo: 100,
      },
    ],
  },
  {
    id: "folk-open-world-music-game-d3e0",
    type: "creative project",
    statement: "Ship an open-world folk music game rooted in living oral traditions",
    description:
      "Creative mission backing art direction, instrument recording sessions, and narrative design for a exploration game where players revive songs across fictional valleys.",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FOLK",
    lifecycle: "bonding",
    marketCapUsd: 134000,
    liquidityUsd: 41000,
    holders: 478,
    councilMultiplier: 0.76,
    perfBase: 99,
    daysAgo: 5,
    requests: [
      {
        idSuffix: "r1",
        title: "Record regional instrument library",
        description: "Field recordings, sampling sessions, and adaptive music middleware for in-game village performances.",
        requester: "Folk Studio",
        amountUsd: 9600,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 14,
      },
      {
        idSuffix: "r2",
        title: "Vertical slice demo for festival showcase",
        description: "Playable 20-minute build with two valleys, three songs, and controller-friendly UI polish.",
        requester: "Anya Volkov",
        amountUsd: 6100,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 66,
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
    { daysAgo: 30, factor: 0.83 },
    { daysAgo: 14, factor: 0.91 },
    { daysAgo: 7, factor: 0.96 },
    { daysAgo: 1, factor: 0.992 },
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
    `[${mission.type}] ${mission.tokenSymbol}: ${mission.holders} holders, ~$${Math.round(mission.marketCapUsd / 1000)}k cap, ${mission.requests.length} requests`,
  );
  return true;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    let inserted = 0;
    for (const mission of mixedMissions) {
      if (await insertMission(client, mission)) inserted += 1;
    }
    await client.query("commit");
    console.log(`Done. Added ${inserted} mixed missions (${mixedMissions.length - inserted} skipped).`);
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
