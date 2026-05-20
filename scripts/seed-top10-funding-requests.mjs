/**
 * Reseed funding requests for the top 10 missions by liquidity with varied
 * active, accepted (passed), and rejected (failed) proposals.
 */
import { createHash } from "node:crypto";
import pg from "pg";

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

const TOP10_MISSION_IDS = [
  "satcom-open-satellite-telemetry-p6",
  "northline-battery-ebike-pack-c6e4",
  "lumen-health-sleep-wearable-f4a1",
  "pulse-cardiac-ai-wearable-c7f2",
  "decode-rare-enzyme-pathways-a3b1",
  "volt-residential-battery-wall-d8a3",
  "kova-kitchen-smart-appliance-b1d3",
  "gene-crispr-sickle-cell-trial-f6",
  "mri-portable-rural-clinics-e5",
  "tile-solar-roof-shingles-e1a2",
];

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function votingEndsAtFromCreatedAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

/** missionId -> request definitions */
const requestSets = {
  "satcom-open-satellite-telemetry-p6": [
    {
      idSuffix: "r1",
      title: "Expand Alaska ground station uplink capacity",
      description: "Second dish installation, RF chain calibration, and 90-day uptime burn-in for the high-latitude pass corridor.",
      requester: "Satcom Open",
      amountUsd: 21400,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 11,
    },
    {
      idSuffix: "r2",
      title: "Public telemetry API rate-limit tier for builders",
      description: "Auth keys, schema versioning, and docs site so external teams can stream CubeSat packets without private contracts.",
      requester: "Orbit Labs",
      amountUsd: 16800,
      status: "active",
      approvals: 2,
      rejections: 2,
      hoursAgo: 18,
    },
    {
      idSuffix: "r3",
      title: "Launch public telemetry API for CubeSat fleet",
      description: "Ground station upgrades, schema docs, and rate-limited public access for builder accounts.",
      requester: "Satcom Open",
      amountUsd: 17600,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 96,
    },
    {
      idSuffix: "r4",
      title: "University CubeSat partner onboarding grants",
      description: "Stipends for three campus labs to publish validated packet captures and maintenance runbooks.",
      requester: "Dr. Mei Chen",
      amountUsd: 12200,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 210,
    },
    {
      idSuffix: "r5",
      title: "Branded launch livestream production",
      description: "Marketing spend without tied ground-station milestones or open API deliverables.",
      requester: "Nova Media",
      amountUsd: 28000,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 340,
    },
  ],
  "northline-battery-ebike-pack-c6e4": [
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
      title: "OEM swap-station pilot with courier fleets",
      description: "Mount adapters, depot training, and telemetry dashboards for fifty cargo e-bikes in Vancouver.",
      requester: "Northline Mobility",
      amountUsd: 14200,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 14,
    },
    {
      idSuffix: "r3",
      title: "UL 2271 and UN38.3 compliance testing",
      description: "Certification lab fees, sample builds, and redesign buffer before shipping to bike OEM partners.",
      requester: "Elena Voss",
      amountUsd: 12100,
      status: "accepted",
      approvals: 6,
      rejections: 0,
      hoursAgo: 88,
    },
    {
      idSuffix: "r4",
      title: "Cold-weather cycle life validation chamber",
      description: "Six-month accelerated aging study for solid-state cells at -20°C with published degradation curves.",
      requester: "Northline R&D",
      amountUsd: 9800,
      status: "accepted",
      approvals: 5,
      rejections: 1,
      hoursAgo: 180,
    },
    {
      idSuffix: "r5",
      title: "Brand refresh and trade show booth",
      description: "Marketing-heavy ask without a tied shipment milestone or distributor onboarding plan.",
      requester: "Brightline Creative",
      amountUsd: 18500,
      status: "rejected",
      approvals: 0,
      rejections: 5,
      hoursAgo: 260,
    },
  ],
  "lumen-health-sleep-wearable-f4a1": [
    {
      idSuffix: "r1",
      title: "Fund 500-unit pilot manufacturing run",
      description: "PCB assembly, soft-band tooling, and packaging for the first clinical pilot cohort and early preorder backers.",
      requester: "Lumen Health Ops",
      amountUsd: 22400,
      status: "active",
      approvals: 4,
      rejections: 1,
      hoursAgo: 11,
    },
    {
      idSuffix: "r2",
      title: "Clinician dashboard for apnea event review",
      description: "HIPAA-aligned web console, alert routing, and EHR export for sleep lab partners.",
      requester: "Dr. Amira Solis",
      amountUsd: 11800,
      status: "active",
      approvals: 2,
      rejections: 2,
      hoursAgo: 22,
    },
    {
      idSuffix: "r3",
      title: "Clinical validation study with sleep lab partners",
      description: "Three-site study comparing Lumen signal quality against in-lab polysomnography before the Q4 consumer rollout.",
      requester: "Dr. Amira Solis",
      amountUsd: 15800,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 120,
    },
    {
      idSuffix: "r4",
      title: "Direct-to-consumer onboarding video series",
      description: "Patient setup guides, troubleshooting clips, and support macros for the first 2,000 home users.",
      requester: "Lumen Care",
      amountUsd: 6400,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 240,
    },
    {
      idSuffix: "r5",
      title: "Celebrity ambassador campaign",
      description: "Influencer spend without tied product milestones or post-market surveillance budget.",
      requester: "Northwind Media",
      amountUsd: 32000,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 400,
    },
  ],
  "pulse-cardiac-ai-wearable-c7f2": [
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
      title: "Arrhythmia alert threshold tuning for elders",
      description: "Cohort-specific models, clinician override flows, and false-positive reduction study across two hospitals.",
      requester: "Dr. Naomi Park",
      amountUsd: 13400,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 16,
    },
    {
      idSuffix: "r3",
      title: "Prospective arrhythmia detection study",
      description: "Six-month cohort comparing Pulse alerts against Holter reference standards across three hospital partners.",
      requester: "Dr. Naomi Park",
      amountUsd: 17200,
      status: "accepted",
      approvals: 6,
      rejections: 0,
      hoursAgo: 72,
    },
    {
      idSuffix: "r4",
      title: "Medicare billing code pathway consultation",
      description: "Reimbursement analysis, coding workshops, and pilot claims support for cardiology practices.",
      requester: "Pulse Reimbursement",
      amountUsd: 8900,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 190,
    },
    {
      idSuffix: "r5",
      title: "Luxury packaging redesign for retail shelves",
      description: "Cosmetic box refresh without clinical endpoints or manufacturing yield targets.",
      requester: "Atelier Brand",
      amountUsd: 19500,
      status: "rejected",
      approvals: 0,
      rejections: 5,
      hoursAgo: 310,
    },
  ],
  "decode-rare-enzyme-pathways-a3b1": [
    {
      idSuffix: "r1",
      title: "High-throughput enzyme variant screen",
      description: "Robotic liquid handling, assay plates, and replication runs for 240 rare metabolic variants.",
      requester: "Enzyme Commons Lab",
      amountUsd: 18200,
      status: "active",
      approvals: 4,
      rejections: 1,
      hoursAgo: 10,
    },
    {
      idSuffix: "r2",
      title: "Open assay dataset publication sprint",
      description: "Curators, schema documentation, and DOI registration for the first public rare-enzyme panel.",
      requester: "OpenNeuro Lab",
      amountUsd: 9600,
      status: "active",
      approvals: 2,
      rejections: 2,
      hoursAgo: 20,
    },
    {
      idSuffix: "r3",
      title: "Patient registry data harmonization sprint",
      description: "Cross-site phenotype alignment, consent updates, and clinician query tooling for the rare disease cohort.",
      requester: "Dr. Priya Menon",
      amountUsd: 14800,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 140,
    },
    {
      idSuffix: "r4",
      title: "Clinician workshop series on variant interpretation",
      description: "Training materials, office hours, and case review sessions for partner hospitals.",
      requester: "Enzyme Commons",
      amountUsd: 7200,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 220,
    },
    {
      idSuffix: "r5",
      title: "Conference sponsorship without data release",
      description: "Booth fees and swag without open dataset milestones or assay replication plan.",
      requester: "BioExpo Events",
      amountUsd: 24000,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 360,
    },
  ],
  "volt-residential-battery-wall-d8a3": [
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
      title: "Apartment installer certification program",
      description: "Hands-on training, safety checklist, and warranty workflow for Munich and Amsterdam partners.",
      requester: "Volt Install",
      amountUsd: 11200,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 15,
    },
    {
      idSuffix: "r3",
      title: "Installer training and first 800-unit production batch",
      description: "Line setup, QA fixtures, and partner onboarding for Munich and Amsterdam pilot cities.",
      requester: "Elena Brandt",
      amountUsd: 13800,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 80,
    },
    {
      idSuffix: "r4",
      title: "Grid outage island-mode firmware validation",
      description: "Black-start drills, telemetry logging, and resident briefing materials for a fifty-home pilot.",
      requester: "Volt Grid Lab",
      amountUsd: 10400,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 200,
    },
    {
      idSuffix: "r5",
      title: "Premium showroom build-out in Berlin",
      description: "Interior design spend without certification deliverables or production shipment milestones.",
      requester: "Studio Volt",
      amountUsd: 22000,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 290,
    },
  ],
  "kova-kitchen-smart-appliance-b1d3": [
    {
      idSuffix: "r1",
      title: "Injection mold tooling for production shell",
      description: "Tooling deposit and first article inspection for the heat-resistant exterior and sealed cooking chamber.",
      requester: "Kova Kitchen",
      amountUsd: 11400,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 16,
    },
    {
      idSuffix: "r2",
      title: "Macro-tracking recipe library v1",
      description: "Nutritionist-authored meal plans, portion presets, and app UX for the first 200 beta households.",
      requester: "Kova Product",
      amountUsd: 7800,
      status: "active",
      approvals: 2,
      rejections: 2,
      hoursAgo: 24,
    },
    {
      idSuffix: "r3",
      title: "UL and kitchen safety certification sprint",
      description: "Third-party lab testing, documentation, and rework budget to clear retail and marketplace requirements.",
      requester: "Priya Nair",
      amountUsd: 6900,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 110,
    },
    {
      idSuffix: "r4",
      title: "First 500 preorder fulfillment run",
      description: "Assembly line time, QC sampling, and logistics for early Brooklyn backers.",
      requester: "Kova Ops",
      amountUsd: 9200,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 175,
    },
    {
      idSuffix: "r5",
      title: "Influencer unboxing tour",
      description: "Paid posts without safety certification linkage or preorder shipment plan.",
      requester: "TasteTok Agency",
      amountUsd: 16000,
      status: "rejected",
      approvals: 0,
      rejections: 4,
      hoursAgo: 250,
    },
  ],
  "gene-crispr-sickle-cell-trial-f6": [
    {
      idSuffix: "r1",
      title: "Preclinical validation of edited hematopoietic lines",
      description: "Assay battery, replication runs, and open publication of edited cell line benchmarks.",
      requester: "Gene Commons Lab",
      amountUsd: 18200,
      status: "active",
      approvals: 4,
      rejections: 1,
      hoursAgo: 9,
    },
    {
      idSuffix: "r2",
      title: "Patient cohort consent and travel stipends",
      description: "Multilingual consent updates, transport support, and coordinator hours for the trial screening window.",
      requester: "Trial Access Coalition",
      amountUsd: 11400,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 19,
    },
    {
      idSuffix: "r3",
      title: "GMP-adjacent cell handling training",
      description: "Cleanroom drills, SOP documentation, and external auditor prep for the editing suite.",
      requester: "Gene Commons Lab",
      amountUsd: 15600,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 130,
    },
    {
      idSuffix: "r4",
      title: "Open protocol preprint and data release",
      description: "Manuscript editing, figure production, and repository hosting for community replication.",
      requester: "Dr. Luis Ortega",
      amountUsd: 6800,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 210,
    },
    {
      idSuffix: "r5",
      title: "Luxury gala fundraising dinner",
      description: "Venue and catering without trial milestones or open protocol deliverables.",
      requester: "Helix Events",
      amountUsd: 35000,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 380,
    },
  ],
  "mri-portable-rural-clinics-e5": [
    {
      idSuffix: "r1",
      title: "Field trial at three rural clinic sites",
      description: "Transport crates, technician training, and imaging workflow integration for remote diagnostics.",
      requester: "FieldMRI Co.",
      amountUsd: 22400,
      status: "active",
      approvals: 5,
      rejections: 0,
      hoursAgo: 6,
    },
    {
      idSuffix: "r2",
      title: "Technician certification for portable scans",
      description: "Curriculum, simulation hours, and proctoring for rural imaging staff across pilot clinics.",
      requester: "Rural Health Alliance",
      amountUsd: 10800,
      status: "active",
      approvals: 3,
      rejections: 1,
      hoursAgo: 13,
    },
    {
      idSuffix: "r3",
      title: "Safety certification and shielding validation",
      description: "Third-party testing, documentation, and redesign buffer before wider clinic rollout.",
      requester: "Rural Health Alliance",
      amountUsd: 15600,
      status: "accepted",
      approvals: 6,
      rejections: 0,
      hoursAgo: 58,
    },
    {
      idSuffix: "r4",
      title: "DICOM bridge for clinic EMR systems",
      description: "Adapter development, test harness, and rollout support for two regional hospital networks.",
      requester: "FieldMRI Co.",
      amountUsd: 12400,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 165,
    },
    {
      idSuffix: "r5",
      title: "Branded clinic lobby installations",
      description: "Decor budget without imaging workflow integration or technician training plan.",
      requester: "Clinic Interiors Co.",
      amountUsd: 21000,
      status: "rejected",
      approvals: 0,
      rejections: 5,
      hoursAgo: 300,
    },
  ],
  "tile-solar-roof-shingles-e1a2": [
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
      title: "Fire-code review with county inspectors",
      description: "Test panels, documentation packets, and inspector walkthroughs for UL-rated shingle installs.",
      requester: "Tile Compliance",
      amountUsd: 9200,
      status: "active",
      approvals: 2,
      rejections: 2,
      hoursAgo: 17,
    },
    {
      idSuffix: "r3",
      title: "Installer certification workshop series",
      description: "Hands-on training, safety checklist, and warranty workflow for regional roofing partners.",
      requester: "Megan Cho",
      amountUsd: 7400,
      status: "accepted",
      approvals: 5,
      rejections: 0,
      hoursAgo: 62,
    },
    {
      idSuffix: "r4",
      title: "Homeowner production monitoring dashboard",
      description: "Per-roof telemetry, alerting, and annual yield reports for the Mesa Ridge pilot block.",
      requester: "Tile Energy",
      amountUsd: 8100,
      status: "accepted",
      approvals: 4,
      rejections: 1,
      hoursAgo: 150,
    },
    {
      idSuffix: "r5",
      title: "Sponsored golf tournament sponsorship",
      description: "Event fees without installer certification or pilot install milestones.",
      requester: "Sunfair Events",
      amountUsd: 17500,
      status: "rejected",
      approvals: 1,
      rejections: 4,
      hoursAgo: 280,
    },
  ],
};

async function insertRequest(client, missionId, tokenSymbol, tokenPrice, councilMembers, request) {
  const requestId = `${missionId}-${request.idSuffix}`;
  const createdAtRequest = new Date(Date.now() - request.hoursAgo * 60 * 60 * 1000).toISOString();
  const tokenAmount = request.amountUsd / tokenPrice;
  const requesterWallet = `Req${request.idSuffix}${tokenSymbol}${requestId.length}WalletDemo111111111`;
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
      missionId,
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

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const missionId of TOP10_MISSION_IDS) {
      const requests = requestSets[missionId];
      if (!requests?.length) {
        console.warn(`No request set for ${missionId}`);
        continue;
      }

      const { rows } = await client.query(
        `
          select m.token_symbol, m.council_json, mm.token_price_usdc
          from missions m
          join mission_metrics mm on mm.mission_id = m.id
          where m.id = $1
        `,
        [missionId],
      );
      if (!rows.length) {
        console.warn(`Mission not found: ${missionId}`);
        continue;
      }

      const { token_symbol: tokenSymbol, council_json: councilJson, token_price_usdc: tokenPriceRaw } = rows[0];
      const tokenPrice = Number(tokenPriceRaw);
      const councilMembers = Array.isArray(councilJson) ? councilJson : [];

      await client.query(
        `delete from funding_request_votes where request_id in (select id from funding_requests where mission_id = $1)`,
        [missionId],
      );
      await client.query(`delete from funding_requests where mission_id = $1`, [missionId]);

      for (const request of requests) {
        await insertRequest(client, missionId, tokenSymbol, tokenPrice, councilMembers, request);
      }

      const counts = requests.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        },
        {},
      );
      console.log(
        `${tokenSymbol}: ${requests.length} requests — active ${counts.active || 0}, accepted ${counts.accepted || 0}, rejected ${counts.rejected || 0}`,
      );
    }

    await client.query("commit");
    console.log("Done seeding varied funding requests for top 10 missions.");
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
