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
    "1H": point("1 hour", "1 hour ago", 1.01),
    "4H": point("4 hours", "4 hours ago", 1.028),
    "1D": point("1 day", "1 day ago", 1.07),
    "1W": point("1 week", "1 week ago", 1.19),
    "1M": point("1 month", "1 month ago", 1.48),
    "6M": point("6 months", "6 months ago", 2.02),
    "1Y": point("1 year", "1 year ago", 2.88),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `Nx${index}Mi${symbol}${index}3xQa${index}61R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((780000 - index * 83000) * multiplier),
    ownership: Number((6.5 - index * 0.64).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

const mixedMissions = [
  {
    id: "tile-solar-roof-shingles-e1a2",
    type: "product",
    statement: "Make every rooftop a quiet power plant with integrated solar shingles",
    description:
      "Product mission backing UL-rated shingle prototypes, installer training, and pilot deployments on suburban blocks where bulky panel racks are not an option.",
    image: "https://images.unsplash.com/photo-1771479755055-6a305f50845e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1724041875467-3576f20170dc?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "TILE",
    lifecycle: "graduated",
    marketCapUsd: 318000,
    liquidityUsd: 720000,
    holders: 604,
    councilMultiplier: 1.04,
    perfBase: 106,
    daysAgo: 2,
    requests: [
      {
        idSuffix: "r1",
        title: "Pilot install on twenty homes in Mesa Ridge",
        description: "Hardware, permitting support, and performance monitoring for the first suburban retrofit cohort.",
        requester: "Tile Energy",
        amountUsd: 16800,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 8,
      },
      {
        idSuffix: "r2",
        title: "Installer certification workshop series",
        description: "Hands-on training, safety checklist, and warranty workflow for regional roofing partners.",
        requester: "Megan Cho",
        amountUsd: 7400,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 62,
      },
    ],
  },
  {
    id: "amyl-early-alzheimer-biomarkers-f2b3",
    type: "research goal",
    statement: "Find blood-based biomarkers for Alzheimer's before symptoms appear",
    description:
      "Research mission funding longitudinal sampling, proteomics analysis, and open dataset releases to accelerate early intervention trials.",
    image: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "AMYL",
    lifecycle: "graduated",
    marketCapUsd: 274000,
    liquidityUsd: 598000,
    holders: 566,
    councilMultiplier: 0.97,
    perfBase: 104,
    daysAgo: 4,
    requests: [
      {
        idSuffix: "r1",
        title: "Expand 5-year patient cohort sampling",
        description: "Quarterly blood draws, imaging alignment, and anonymized record linkage across two partner clinics.",
        requester: "Dr. Priya Menon",
        amountUsd: 19200,
        status: "active",
        approvals: 5,
        rejections: 0,
        hoursAgo: 10,
      },
      {
        idSuffix: "r2",
        title: "Publish open biomarker benchmark dataset",
        description: "Curated proteomics panel, documentation, and baseline models for external research teams.",
        requester: "OpenNeuro Lab",
        amountUsd: 8600,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 84,
      },
    ],
  },
  {
    id: "seed-urban-community-gardens-g3c4",
    type: "community",
    statement: "Turn vacant lots into shared gardens that feed the block",
    description:
      "Community mission financing soil remediation, irrigation kits, and steward stipends for neighborhood plots managed by resident cooperatives.",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "SEED",
    lifecycle: "bonding",
    marketCapUsd: 86000,
    liquidityUsd: 21000,
    holders: 319,
    councilMultiplier: 0.57,
    perfBase: 93,
    daysAgo: 9,
    requests: [
      {
        idSuffix: "r1",
        title: "Convert three vacant parcels into garden hubs",
        description: "Raised beds, compost systems, tool sheds, and bilingual onboarding for first-season stewards.",
        requester: "Southside Garden Co-op",
        amountUsd: 5900,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 16,
      },
    ],
  },
  {
    id: "remit-open-cross-border-payments-h4d5",
    type: "protocol",
    statement: "Move remittances on open rails with transparent settlement proofs",
    description:
      "Protocol mission building audited smart-contract corridors, mobile SDKs, and compliance tooling for low-cost cross-border transfers.",
    image: "https://images.unsplash.com/photo-1533234944761-2f5337579079?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1738806399423-52dd345d2232?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "REMIT",
    lifecycle: "graduated",
    marketCapUsd: 242000,
    liquidityUsd: 476000,
    holders: 638,
    councilMultiplier: 0.93,
    perfBase: 103,
    daysAgo: 3,
    requests: [
      {
        idSuffix: "r1",
        title: "Launch Mexico-US settlement corridor beta",
        description: "Liquidity partners, proof-of-reserve dashboard, and fraud monitoring for the first live corridor.",
        requester: "Remit Protocol",
        amountUsd: 14100,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 7,
      },
      {
        idSuffix: "r2",
        title: "Mobile wallet SDK audit",
        description: "Security review of signing flows, key custody, and merchant callback handling before public release.",
        requester: "LedgerSafe",
        amountUsd: 9800,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 55,
      },
    ],
  },
  {
    id: "ling-vanishing-languages-documentary-i5e6",
    type: "creative project",
    statement: "Document the last fluent speakers of vanishing mountain languages",
    description:
      "Creative mission supporting field recording trips, subtitle archives, and a feature documentary releasing under community ownership terms.",
    image: "https://images.unsplash.com/photo-1593367192847-3b8e27fe9373?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1643300788512-64b38ad876c6?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "LING",
    lifecycle: "bonding",
    marketCapUsd: 118000,
    liquidityUsd: 98000,
    holders: 391,
    councilMultiplier: 0.73,
    perfBase: 98,
    daysAgo: 6,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund final filming trip to the high valleys",
        description: "Travel, elder honoraria, archival recording gear, and transcription support for three remaining dialects.",
        requester: "Ling Films",
        amountUsd: 8200,
        status: "active",
        approvals: 3,
        rejections: 2,
        hoursAgo: 12,
      },
      {
        idSuffix: "r2",
        title: "Build searchable subtitle and audio archive",
        description: "Web archive with timestamped clips, community annotations, and download packages for educators.",
        requester: "Tara Mbatha",
        amountUsd: 5100,
        status: "accepted",
        approvals: 4,
        rejections: 1,
        hoursAgo: 78,
      },
    ],
  },
  {
    id: "just-tenant-legal-aid-chatbot-j6f7",
    type: "public good",
    statement: "Give every tenant free guided help navigating eviction and repair law",
    description:
      "Public-good mission powering a multilingual chatbot, local ordinance database, and volunteer lawyer escalation for housing disputes.",
    image: "https://images.unsplash.com/photo-1625916623871-d543b00f6180?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1774898988393-5c752e4d55e9?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "JUST",
    lifecycle: "bonding",
    marketCapUsd: 148000,
    liquidityUsd: 172000,
    holders: 427,
    councilMultiplier: 0.8,
    perfBase: 100,
    daysAgo: 8,
    requests: [
      {
        idSuffix: "r1",
        title: "Expand legal aid chatbot to four new cities",
        description: "Ordinance ingestion, localized response templates, and volunteer lawyer handoff routing.",
        requester: "Just Shelter",
        amountUsd: 9300,
        status: "active",
        approvals: 4,
        rejections: 0,
        hoursAgo: 9,
      },
    ],
  },
  {
    id: "grid-neighborhood-microgrid-k7g8",
    type: "ambitious outcome",
    statement: "Wire an entire city block to run on a resilient neighborhood microgrid",
    description:
      "Ambitious outcome mission coordinating battery hubs, rooftop exports, and island-mode failover so one block stays powered through outages.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "GRID",
    lifecycle: "graduated",
    marketCapUsd: 364000,
    liquidityUsd: 384000,
    holders: 724,
    councilMultiplier: 1.12,
    perfBase: 110,
    daysAgo: 1,
    requests: [
      {
        idSuffix: "r1",
        title: "Install block-scale battery and control hub",
        description: "Containerized storage, switchgear, telemetry, and safety commissioning for the pilot microgrid.",
        requester: "Grid Block Lab",
        amountUsd: 21400,
        status: "active",
        approvals: 5,
        rejections: 0,
        hoursAgo: 4,
      },
      {
        idSuffix: "r2",
        title: "Island-mode failover drill with residents",
        description: "Simulation week, resident briefing materials, and utility coordination for outage response.",
        requester: "Elena Park",
        amountUsd: 11200,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 44,
      },
      {
        idSuffix: "r3",
        title: "Branded block party launch event",
        description: "Festival spend without a tied grid milestone or resident safety training plan.",
        requester: "Spark Events",
        amountUsd: 16000,
        status: "rejected",
        approvals: 1,
        rejections: 4,
        hoursAgo: 96,
      },
    ],
  },
  {
    id: "sniff-portable-allergy-scanner-l8h9",
    type: "product",
    statement: "Put a pocket allergen scanner in every school nurse's office",
    description:
      "Product mission developing a handheld device that detects common food allergens in minutes, with capital for clinical validation and school pilot kits.",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "SNIFF",
    lifecycle: "bonding",
    marketCapUsd: 196000,
    liquidityUsd: 226000,
    holders: 489,
    councilMultiplier: 0.88,
    perfBase: 102,
    daysAgo: 5,
    requests: [
      {
        idSuffix: "r1",
        title: "Clinical validation with pediatric allergy clinics",
        description: "Blinded sample testing, sensitivity reporting, and protocol documentation for FDA pre-submission.",
        requester: "Sniff Health",
        amountUsd: 12400,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 11,
      },
      {
        idSuffix: "r2",
        title: "Build fifty school nurse pilot kits",
        description: "Devices, swab supplies, training videos, and incident logging app for district rollout.",
        requester: "Dr. Sam Okoro",
        amountUsd: 8700,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 68,
      },
    ],
  },
  {
    id: "core-antarctic-ice-archive-m9i0",
    type: "research goal",
    statement: "Preserve Antarctic ice cores as an open climate memory for future generations",
    description:
      "Research mission funding deep-core extraction, cryogenic storage, and a public archive of isotope records spanning 800,000 years of atmosphere.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "CORE",
    lifecycle: "bonding",
    marketCapUsd: 168000,
    liquidityUsd: 296000,
    holders: 456,
    councilMultiplier: 0.84,
    perfBase: 101,
    daysAgo: 7,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund second-season ice core drilling leg",
        description: "Field camp logistics, core handling, and air-isotope analysis for the eastern shelf transect.",
        requester: "Polar Memory Project",
        amountUsd: 14800,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 13,
      },
    ],
  },
  {
    id: "stem-youth-makerspace-network-n0j1",
    type: "community",
    statement: "Open youth makerspaces where every kid can build something real",
    description:
      "Community mission stocking 3D printers, soldering benches, and mentor hours across neighborhood STEM labs serving underserved middle schools.",
    image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "STEM",
    lifecycle: "bonding",
    marketCapUsd: 102000,
    liquidityUsd: 56000,
    holders: 358,
    councilMultiplier: 0.66,
    perfBase: 96,
    daysAgo: 10,
    requests: [
      {
        idSuffix: "r1",
        title: "Equip two new after-school maker labs",
        description: "Printers, tool walls, safety gear, and starter project kits for sixty students per site.",
        requester: "STEM Commons",
        amountUsd: 7800,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 15,
      },
      {
        idSuffix: "r2",
        title: "Summer mentor stipend pool",
        description: "Twelve weeks of paid mentor shifts covering electronics, carpentry, and design feedback sessions.",
        requester: "Jordan Ellis",
        amountUsd: 5400,
        status: "accepted",
        approvals: 4,
        rejections: 1,
        hoursAgo: 92,
      },
    ],
  },
];

function votingEndsAtFromCreatedAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

function photoId(url) {
  return url.match(/photo-([^?]+)/)?.[1] ?? url;
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
    { daysAgo: 30, factor: 0.85 },
    { daysAgo: 14, factor: 0.92 },
    { daysAgo: 7, factor: 0.97 },
    { daysAgo: 1, factor: 0.993 },
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
    `[${mission.type}] ${mission.tokenSymbol}: ${mission.holders} holders, ~$${Math.round(mission.marketCapUsd / 1000)}k cap, $${Math.round(mission.liquidityUsd / 1000)}k liq`,
  );
  return true;
}

async function main() {
  const batchImages = mixedMissions.flatMap((mission) => [mission.image, mission.tokenImage]);
  const unique = new Set(batchImages.map(photoId));
  if (unique.size !== batchImages.length) {
    throw new Error("Batch contains duplicate images.");
  }

  const existing = await pool.query("select image_url, token_image_url from missions");
  const used = new Set(existing.rows.flatMap((row) => [row.image_url, row.token_image_url]).map(photoId));
  for (const url of batchImages) {
    if (used.has(photoId(url))) {
      throw new Error(`Image already used in production: ${photoId(url)}`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    let inserted = 0;
    for (const mission of mixedMissions) {
      if (await insertMission(client, mission)) inserted += 1;
    }
    await client.query("commit");
    console.log(`Done. Added ${inserted} missions (${mixedMissions.length - inserted} skipped).`);
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
