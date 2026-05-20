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
    "1H": point("1 hour", "1 hour ago", 1.012),
    "4H": point("4 hours", "4 hours ago", 1.038),
    "1D": point("1 day", "1 day ago", 1.11),
    "1W": point("1 week", "1 week ago", 1.34),
    "1M": point("1 month", "1 month ago", 1.72),
    "6M": point("6 months", "6 months ago", 2.48),
    "1Y": point("1 year", "1 year ago", 3.6),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `So${index}La${symbol}${index}9xQa${index}38R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((820000 - index * 88000) * multiplier),
    ownership: Number((6.9 - index * 0.68).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

const missions = [
  {
    id: "helix-decentralized-storage-protocol-a1f2",
    statement: "Ship the open-source Helix decentralized storage protocol",
    description:
      "Funding core protocol development, reference nodes, and a permissively licensed SDK so builders can store app data without renting closed cloud buckets.",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "HELIX",
    lifecycle: "graduated",
    marketCapUsd: 285000,
    liquidityUsd: 615000,
    holders: 742,
    councilMultiplier: 1.05,
    perfBase: 108,
    requests: [
      {
        idSuffix: "r1",
        title: "Fund Helix reference node fleet",
        description: "Deploy and operate 12 public reference nodes with uptime monitoring, docs, and a starter CLI for developers.",
        requester: "Maya Chen",
        requesterAvatar: avatars[1],
        amountUsd: 14200,
        status: "active",
        approvals: 4,
        rejections: 1,
        hoursAgo: 14,
      },
      {
        idSuffix: "r2",
        title: "Audit the replication consensus module",
        description: "Independent security review of chunk replication, erasure coding, and peer selection before mainnet beta.",
        requester: "Open Systems Lab",
        requesterAvatar: avatars[3],
        amountUsd: 9800,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 120,
      },
      {
        idSuffix: "r3",
        title: "Sponsor Helix documentation sprint",
        description: "Two-week docs push covering SDK guides, architecture diagrams, and migration examples from S3-compatible APIs.",
        requester: "Jonah Reed",
        requesterAvatar: avatars[5],
        amountUsd: 6200,
        status: "rejected",
        approvals: 1,
        rejections: 4,
        hoursAgo: 200,
      },
    ],
  },
  {
    id: "prism-spatial-audio-sdk-b3c8",
    statement: "Build an open spatial audio SDK for indie game developers",
    description:
      "A mission market backing cross-platform 3D audio tooling, Unity and Godot plugins, and sample projects anyone can fork.",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "PRISM",
    lifecycle: "bonding",
    marketCapUsd: 124000,
    liquidityUsd: 28000,
    holders: 418,
    councilMultiplier: 0.78,
    perfBase: 96,
    requests: [
      {
        idSuffix: "r1",
        title: "Ship Godot spatial audio plugin",
        description: "Production-ready plugin with HRTF presets, occlusion helpers, and a demo scene for third-person games.",
        requester: "Lena Ortiz",
        requesterAvatar: avatars[0],
        amountUsd: 7600,
        status: "active",
        approvals: 3,
        rejections: 2,
        hoursAgo: 8,
      },
      {
        idSuffix: "r2",
        title: "Commission accessibility-focused sound pack",
        description: "Open-licensed UI and ambience pack tuned for low-hearing-loss profiles and mono-downmix testing.",
        requester: "Field Audio Co.",
        requesterAvatar: avatars[4],
        amountUsd: 4100,
        status: "accepted",
        approvals: 5,
        rejections: 0,
        hoursAgo: 96,
      },
    ],
  },
  {
    id: "carbon-ledger-attribution-registry-c5d1",
    statement: "Launch a public climate attribution registry anyone can audit",
    description:
      "Community capital for open schemas, verification tooling, and a transparent ledger mapping emissions claims to evidence bundles.",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1593720213428-28a5b9e94613?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "CLGR",
    lifecycle: "bonding",
    marketCapUsd: 68000,
    liquidityUsd: 1000,
    holders: 287,
    councilMultiplier: 0.52,
    perfBase: 91,
    requests: [
      {
        idSuffix: "r1",
        title: "Build open verification dashboard",
        description: "Public UI to inspect claim lineage, source documents, and reviewer notes for each registry entry.",
        requester: "Arun Patel",
        requesterAvatar: avatars[2],
        amountUsd: 5400,
        status: "active",
        approvals: 2,
        rejections: 1,
        hoursAgo: 22,
      },
    ],
  },
  {
    id: "forge-open-robotics-arm-d7e4",
    statement: "Open-hardware modular robot arm for community makerspaces",
    description:
      "Financing BOM releases, control firmware, and workshop kits so local labs can assemble affordable 6-axis arms from documented parts.",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FORGE",
    lifecycle: "graduated",
    marketCapUsd: 412000,
    liquidityUsd: 740000,
    holders: 863,
    councilMultiplier: 1.22,
    perfBase: 114,
    requests: [
      {
        idSuffix: "r1",
        title: "Prototype makerspace workshop kit",
        description: "Ten complete kits with printed brackets, motor controllers, calibration jigs, and facilitator guides.",
        requester: "Nova Labs",
        requesterAvatar: avatars[4],
        amountUsd: 18600,
        status: "active",
        approvals: 4,
        rejections: 0,
        hoursAgo: 6,
      },
      {
        idSuffix: "r2",
        title: "Release ROS2 driver and sim models",
        description: "Open-source driver package, Gazebo models, and CI tests so teams can iterate without hardware on day one.",
        requester: "Kira Solis",
        requesterAvatar: avatars[1],
        amountUsd: 11200,
        status: "accepted",
        approvals: 6,
        rejections: 0,
        hoursAgo: 72,
      },
      {
        idSuffix: "r3",
        title: "Global reseller marketing push",
        description: "Paid ads campaign without a clear build milestone or parts sourcing plan for community labs.",
        requester: "Growth Partners LLC",
        requesterAvatar: avatars[3],
        amountUsd: 24000,
        status: "rejected",
        approvals: 0,
        rejections: 5,
        hoursAgo: 160,
      },
    ],
  },
  {
    id: "atlas-marine-biodiversity-commons-e9f6",
    statement: "Fund a community-owned marine biodiversity research database",
    description:
      "Capital for specimen metadata tooling, open APIs, and contributor bounties so coastal communities can publish observations as shared public science.",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "ATLAS",
    lifecycle: "graduated",
    marketCapUsd: 198000,
    liquidityUsd: 204000,
    holders: 534,
    councilMultiplier: 0.94,
    perfBase: 102,
    requests: [
      {
        idSuffix: "r1",
        title: "Expand reef observation upload pipeline",
        description: "Mobile-friendly uploader, geotag validation, and moderation queue for community reef photo submissions.",
        requester: "Tide Collective",
        requesterAvatar: avatars[0],
        amountUsd: 8900,
        status: "active",
        approvals: 3,
        rejections: 1,
        hoursAgo: 18,
      },
      {
        idSuffix: "r2",
        title: "Publish Atlas API v2 specification",
        description: "Versioned schema, reference server, and migration notes for institutions syncing legacy marine datasets.",
        requester: "Dr. Elias Nouri",
        requesterAvatar: avatars[2],
        amountUsd: 6700,
        status: "accepted",
        approvals: 5,
        rejections: 1,
        hoursAgo: 140,
      },
    ],
  },
];

async function deleteAllMissions(client) {
  const existing = await client.query("select id from missions");
  const ids = existing.rows.map((row) => row.id);
  if (ids.length === 0) {
    console.log("No existing missions to delete.");
    return;
  }

  console.log(`Deleting ${ids.length} existing mission(s)...`);

  await client.query(
    `
      delete from funding_request_votes
      where request_id in (select id from funding_requests where mission_id = any($1::text[]))
    `,
    [ids],
  );
  await client.query("delete from funding_requests where mission_id = any($1::text[])", [ids]);
  await client.query("delete from council_candidates where mission_id = any($1::text[])", [ids]);
  await client.query("delete from epoch_councils where mission_id = any($1::text[])", [ids]);
  await client.query("delete from price_points where mission_id = any($1::text[])", [ids]);
  await client.query("delete from reward_epochs where mission_id = any($1::text[])", [ids]);
  await client.query("delete from mission_damm_fee_positions where mission_id = any($1::text[])", [ids]);
  await client.query("delete from migration_reconciliation_jobs where mission_id = any($1::text[])", [ids]);
  await client.query("delete from transactions where mission_id = any($1::text[])", [ids]);
  await client.query("delete from mission_metrics where mission_id = any($1::text[])", [ids]);
  await client.query("delete from pending_mission_launches where id = any($1::text[])", [ids]);
  await client.query("delete from missions where id = any($1::text[])", [ids]);
}

function votingEndsAtFromCreatedAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

async function insertMission(client, mission, index) {
  const councilMembers = council(mission.id, mission.tokenSymbol, mission.councilMultiplier);
  const metrics = metricsFromLiquidity(mission.liquidityUsd, mission.holders, { missionId: mission.id });
  const metadataHash = hash({ id: mission.id, statement: mission.statement, symbol: mission.tokenSymbol });
  const perf = performance(mission.perfBase);
  const createdAt = new Date(Date.now() - (index + 2) * 7 * 24 * 60 * 60 * 1000).toISOString();

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
  const pricePoints = [
    { daysAgo: 30, factor: 0.82 },
    { daysAgo: 14, factor: 0.91 },
    { daysAgo: 7, factor: 0.96 },
    { daysAgo: 1, factor: 0.99 },
    { daysAgo: 0, factor: 1 },
  ];
  for (const point of pricePoints) {
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
        `
          insert into funding_request_votes (request_id, voter_wallet, vote)
          values ($1, $2, $3)
        `,
        [requestId, voters[i].address, vote],
      );
    }
  }

  console.log(
    `Inserted ${mission.tokenSymbol}: ${mission.holders} holders, ~$${Math.round(mission.marketCapUsd / 1000)}k cap, ${mission.requests.length} requests`,
  );
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await deleteAllMissions(client);
    for (const [index, mission] of missions.entries()) {
      await insertMission(client, mission, index);
    }
    await client.query("commit");
    console.log(`Done. Seeded ${missions.length} demo missions.`);
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
