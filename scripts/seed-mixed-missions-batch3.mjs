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
  "https://api.dicebear.com/7.x/personas/png?seed=Astra",
  "https://api.dicebear.com/7.x/personas/png?seed=Vector",
  "https://api.dicebear.com/7.x/personas/png?seed=Mira",
  "https://api.dicebear.com/7.x/personas/png?seed=Halden",
  "https://api.dicebear.com/7.x/personas/png?seed=Nyx",
  "https://api.dicebear.com/7.x/personas/png?seed=Sable",
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
    "1H": point("1 hour", "1 hour ago", 1.009),
    "4H": point("4 hours", "4 hours ago", 1.026),
    "1D": point("1 day", "1 day ago", 1.065),
    "1W": point("1 week", "1 week ago", 1.16),
    "1M": point("1 month", "1 month ago", 1.42),
    "6M": point("6 months", "6 months ago", 1.95),
    "1Y": point("1 year", "1 year ago", 2.72),
  };
}

function council(missionId, symbol, multiplier) {
  return councilNames.map((name, index) => ({
    id: `${missionId}-${name.toLowerCase()}`,
    name,
    address: `Bx${index}Mi${symbol}${index}4xQa${index}71R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((770000 - index * 82000) * multiplier),
    ownership: Number((6.4 - index * 0.63).toFixed(2)),
  }));
}

const mixedMissions = [
  {
    id: "velo-electric-cargo-bike-a1",
    type: "product",
    statement: "Replace delivery vans with electric cargo bikes across dense neighborhoods",
    description: "Product mission funding a modular cargo e-bike platform with swappable battery packs, fleet software, and pilot deployments with local couriers.",
    image: "https://images.unsplash.com/photo-1642440724438-3c77b976255e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1776182869745-53d3535de2d1?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "VELO",
    lifecycle: "graduated",
    marketCapUsd: 342000,
    liquidityUsd: 2400000,
    holders: 712,
    councilMultiplier: 1.1,
    perfBase: 109,
    daysAgo: 1,
    requests: [
      { idSuffix: "r1", title: "Deploy fifty cargo bikes with courier partners", description: "Hardware, fleet onboarding, and maintenance kits for the first urban pilot corridor.", requester: "Velo Mobility", amountUsd: 19800, status: "active", approvals: 5, rejections: 0, hoursAgo: 5 },
    ],
  },
  {
    id: "pen-smart-insulin-delivery-b2",
    type: "product",
    statement: "Make dose logging effortless with a connected smart insulin pen",
    description: "Product mission backing Bluetooth-enabled pen hardware, companion app development, and clinic validation for safer daily dosing routines.",
    image: "https://images.unsplash.com/photo-1774277602359-d5dfed73aa98?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1651493706899-72a59df915ac?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "PEN",
    lifecycle: "graduated",
    marketCapUsd: 298000,
    liquidityUsd: 2180000,
    holders: 648,
    councilMultiplier: 1.02,
    perfBase: 106,
    daysAgo: 2,
    requests: [
      { idSuffix: "r1", title: "Clinical usability study with endocrinology clinics", description: "Three-site trial measuring dose logging accuracy and patient adherence over twelve weeks.", requester: "Pen Health", amountUsd: 16400, status: "active", approvals: 4, rejections: 1, hoursAgo: 9 },
      { idSuffix: "r2", title: "Manufacturing run for beta pen units", description: "Two thousand pens with QC testing, packaging, and shipment to trial participants.", requester: "Dr. Luis Ortega", amountUsd: 11200, status: "accepted", approvals: 5, rejections: 0, hoursAgo: 72 },
    ],
  },
  {
    id: "hypo-vertical-hydroponic-tower-c3",
    type: "product",
    statement: "Grow fresh produce in apartments with a modular hydroponic tower",
    description: "Product mission developing stackable indoor growing towers, nutrient automation, and open firmware for community urban agriculture projects.",
    image: "https://images.unsplash.com/photo-1562828421-b21b7855568d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1743148509752-9ea6072ea35f?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "HYPO",
    lifecycle: "bonding",
    marketCapUsd: 118000,
    liquidityUsd: 1920000,
    holders: 402,
    councilMultiplier: 0.74,
    perfBase: 98,
    daysAgo: 4,
    requests: [
      { idSuffix: "r1", title: "Ship one hundred tower kits to pilot households", description: "Injection-molded bases, LED grow modules, and starter seed bundles for the first cohort.", requester: "Hypo Farms", amountUsd: 8600, status: "active", approvals: 3, rejections: 1, hoursAgo: 14 },
    ],
  },
  {
    id: "hear-open-hearing-aid-firmware-d4",
    type: "product",
    statement: "Bring affordable hearing support to anyone through open firmware",
    description: "Product mission funding open hearing-aid firmware, reference hardware designs, and audiologist tooling for community-fit hearing assistance.",
    image: "https://images.unsplash.com/photo-1772442163940-5b0ccc6d8232?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1622409680990-336e0b67d7a2?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "HEAR",
    lifecycle: "bonding",
    marketCapUsd: 164000,
    liquidityUsd: 1650000,
    holders: 467,
    councilMultiplier: 0.86,
    perfBase: 101,
    daysAgo: 3,
    requests: [
      { idSuffix: "r1", title: "Release open firmware v1 with fitting wizard", description: "DSP presets, audiogram import, and documentation for community hardware builders.", requester: "Hear Open", amountUsd: 9800, status: "active", approvals: 4, rejections: 1, hoursAgo: 11 },
    ],
  },
  {
    id: "mri-portable-rural-clinics-e5",
    type: "product",
    statement: "Put portable MRI diagnostics within reach of rural clinics",
    description: "Product mission backing compact MRI prototype refinement, safety certification, and deployment with three rural health partners.",
    image: "https://images.unsplash.com/photo-1706065638524-eb52e7165abf?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1758691462667-f2fb90a067ff?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "MRI",
    lifecycle: "graduated",
    marketCapUsd: 386000,
    liquidityUsd: 1420000,
    holders: 756,
    councilMultiplier: 1.14,
    perfBase: 111,
    daysAgo: 2,
    requests: [
      { idSuffix: "r1", title: "Field trial at three rural clinic sites", description: "Transport crates, technician training, and imaging workflow integration for remote diagnostics.", requester: "FieldMRI Co.", amountUsd: 22400, status: "active", approvals: 5, rejections: 0, hoursAgo: 6 },
      { idSuffix: "r2", title: "Safety certification and shielding validation", description: "Third-party testing, documentation, and redesign buffer before wider clinic rollout.", requester: "Rural Health Alliance", amountUsd: 15600, status: "accepted", approvals: 6, rejections: 0, hoursAgo: 58 },
    ],
  },
  {
    id: "gene-crispr-sickle-cell-trial-f6",
    type: "research goal",
    statement: "Advance CRISPR therapies for sickle cell toward accessible clinical trials",
    description: "Research mission supporting lab validation, patient cohort planning, and open protocol documentation for community-governed therapeutic development.",
    image: "https://images.unsplash.com/photo-1579154204845-5d7f8d4dc785?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1637929476734-bd7f5f78e40a?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "GENE",
    lifecycle: "graduated",
    marketCapUsd: 328000,
    liquidityUsd: 1180000,
    holders: 612,
    councilMultiplier: 1.0,
    perfBase: 107,
    daysAgo: 5,
    requests: [
      { idSuffix: "r1", title: "Preclinical validation of edited hematopoietic lines", description: "Assay battery, replication runs, and open publication of edited cell line benchmarks.", requester: "Gene Commons Lab", amountUsd: 18200, status: "active", approvals: 4, rejections: 1, hoursAgo: 10 },
    ],
  },
  {
    id: "magma-volcano-sensor-network-g7",
    type: "research goal",
    statement: "Detect volcanic unrest earlier with an open sensor network",
    description: "Research mission deploying low-cost seismometers, gas sniffers, and public dashboards so communities near active volcanoes get earlier warnings.",
    image: "https://images.unsplash.com/photo-1623059570754-5462839e76a7?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1712570952276-8f43c9f987f1?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "MAGMA",
    lifecycle: "bonding",
    marketCapUsd: 212000,
    liquidityUsd: 980000,
    holders: 528,
    councilMultiplier: 0.92,
    perfBase: 104,
    daysAgo: 6,
    requests: [
      { idSuffix: "r1", title: "Install sensor array on Mount Selene slopes", description: "Twenty nodes, satellite uplink, and local alert integration with municipal emergency services.", requester: "Magma Watch", amountUsd: 13400, status: "active", approvals: 4, rejections: 0, hoursAgo: 12 },
    ],
  },
  {
    id: "vault-climate-resilient-seed-bank-h8",
    type: "research goal",
    statement: "Preserve climate-resilient crop genetics in an open seed vault",
    description: "Research mission curating drought-tolerant varietals, cryostorage infrastructure, and a public catalog for farmers adapting to shifting growing seasons.",
    image: "https://images.unsplash.com/photo-1509043183980-23be96ae4109?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1768729339998-909158957162?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "VAULT",
    lifecycle: "bonding",
    marketCapUsd: 186000,
    liquidityUsd: 820000,
    holders: 491,
    councilMultiplier: 0.88,
    perfBase: 102,
    daysAgo: 7,
    requests: [
      { idSuffix: "r1", title: "Expand cold-storage vault capacity", description: "Climate-controlled shelving, backup power, and catalog digitization for five hundred new accessions.", requester: "Seed Vault Collective", amountUsd: 11800, status: "accepted", approvals: 5, rejections: 0, hoursAgo: 80 },
    ],
  },
  {
    id: "dark-matter-detector-calibration-i9",
    type: "research goal",
    statement: "Calibrate next-generation detectors searching for dark matter signals",
    description: "Research mission funding cryogenic testbed upgrades, noise modeling, and open datasets from underground detector calibration runs.",
    image: "https://images.unsplash.com/photo-1698689168798-531b17ecfda9?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1727034393564-dc7b0275686d?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "DARK",
    lifecycle: "graduated",
    marketCapUsd: 412000,
    liquidityUsd: 710000,
    holders: 689,
    councilMultiplier: 1.16,
    perfBase: 112,
    daysAgo: 3,
    requests: [
      { idSuffix: "r1", title: "Cryostat upgrade for low-threshold calibration runs", description: "Hardware, installation, and two-month calibration campaign with published noise benchmarks.", requester: "Dark Signal Lab", amountUsd: 24600, status: "active", approvals: 5, rejections: 1, hoursAgo: 8 },
    ],
  },
  {
    id: "fridge-community-food-network-j0",
    type: "community",
    statement: "Keep community fridges stocked and dignified in every neighborhood",
    description: "Community mission maintaining public fridges, volunteer stocking routes, and food-rescue partnerships that redirect surplus meals to neighbors in need.",
    image: "https://images.unsplash.com/photo-1660581837552-5a8a72ea973e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1606859191214-25806e8e2423?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FRIDGE",
    lifecycle: "bonding",
    marketCapUsd: 78000,
    liquidityUsd: 580000,
    holders: 334,
    councilMultiplier: 0.56,
    perfBase: 94,
    daysAgo: 9,
    requests: [
      { idSuffix: "r1", title: "Install eight new community fridge sites", description: "Fridges, shelters, hygiene supplies, and volunteer onboarding for weekly stocking shifts.", requester: "Fridge Network", amountUsd: 6200, status: "active", approvals: 3, rejections: 1, hoursAgo: 18 },
    ],
  },
  {
    id: "bridge-refugee-skills-exchange-k1",
    type: "community",
    statement: "Connect newcomers with neighbors through a refugee skills exchange",
    description: "Community mission building a marketplace where resettled families offer language, craft, and trade skills while accessing local mentorship and paid gigs.",
    image: "https://images.unsplash.com/photo-1761957374132-a5137e99f26c?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1563457039413-0c39b8e8963d?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "BRIDGE",
    lifecycle: "bonding",
    marketCapUsd: 96000,
    liquidityUsd: 460000,
    holders: 361,
    councilMultiplier: 0.62,
    perfBase: 95,
    daysAgo: 8,
    requests: [
      { idSuffix: "r1", title: "Launch skills marketplace in two cities", description: "Platform localization, mentor onboarding, and stipends for first fifty exchange sessions.", requester: "Bridge Collective", amountUsd: 7400, status: "active", approvals: 2, rejections: 2, hoursAgo: 16 },
    ],
  },
  {
    id: "mesh-neighborhood-broadband-coop-l2",
    type: "community",
    statement: "Build a neighborhood-owned mesh broadband network",
    description: "Community mission financing rooftop relays, open firmware routers, and member-owned infrastructure that delivers affordable internet block by block.",
    image: "https://images.unsplash.com/photo-1691435828932-911a7801adfb?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1750711158632-5273ec9b9b86?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "MESH",
    lifecycle: "bonding",
    marketCapUsd: 142000,
    liquidityUsd: 365000,
    holders: 418,
    councilMultiplier: 0.79,
    perfBase: 100,
    daysAgo: 6,
    requests: [
      { idSuffix: "r1", title: "Deploy mesh backbone across twelve rooftops", description: "Antennas, weatherproof enclosures, and member training for the first cooperative coverage zone.", requester: "Mesh Co-op", amountUsd: 9100, status: "accepted", approvals: 4, rejections: 1, hoursAgo: 90 },
    ],
  },
  {
    id: "safe-night-walk-collective-m3",
    type: "community",
    statement: "Make late-night walks safer through community escort routes",
    description: "Community mission coordinating trained volunteer walkers, route apps, and neighborhood partnerships so residents feel safe getting home after dark.",
    image: "https://images.unsplash.com/photo-1765110970359-01cb63d307a5?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1643159099326-2dbd72e4f307?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "SAFE",
    lifecycle: "bonding",
    marketCapUsd: 68000,
    liquidityUsd: 278000,
    holders: 302,
    councilMultiplier: 0.54,
    perfBase: 93,
    daysAgo: 11,
    requests: [
      { idSuffix: "r1", title: "Train volunteer walk leaders and launch routes", description: "Background checks, safety training, reflective gear, and route mapping for three districts.", requester: "SafeWalk Network", amountUsd: 4800, status: "active", approvals: 2, rejections: 1, hoursAgo: 20 },
    ],
  },
  {
    id: "print-decentralized-science-publishing-n4",
    type: "protocol",
    statement: "Publish science on open rails with transparent peer review proofs",
    description: "Protocol mission building signed preprint registries, reviewer reputation graphs, and tooling so research outputs stay citable and tamper-evident.",
    image: "https://images.unsplash.com/photo-1758685848208-e108b6af94cc?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1669184006549-d3fd8a16e58c?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "PRINT",
    lifecycle: "graduated",
    marketCapUsd: 256000,
    liquidityUsd: 205000,
    holders: 574,
    councilMultiplier: 0.98,
    perfBase: 105,
    daysAgo: 4,
    requests: [
      { idSuffix: "r1", title: "Ship preprint registry smart contracts v2", description: "On-chain versioning, DOI bridge, and audit fixes before the public migration window.", requester: "Print Protocol", amountUsd: 12800, status: "active", approvals: 4, rejections: 0, hoursAgo: 7 },
    ],
  },
  {
    id: "trace-supply-chain-provenance-o5",
    type: "protocol",
    statement: "Trace products from factory to shelf with open provenance proofs",
    description: "Protocol mission standardizing attestations, QR verification flows, and SDKs so brands and consumers can audit supply chain claims independently.",
    image: "https://images.unsplash.com/photo-1763752194641-3c5638aec65e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1758543102397-e14b5dfdd8bd?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "TRACE",
    lifecycle: "bonding",
    marketCapUsd: 224000,
    liquidityUsd: 152000,
    holders: 536,
    councilMultiplier: 0.94,
    perfBase: 103,
    daysAgo: 5,
    requests: [
      { idSuffix: "r1", title: "Pilot traceability with two apparel manufacturers", description: "Tagging line integration, verifier app, and public provenance dashboard for a spring collection.", requester: "Trace Labs", amountUsd: 11200, status: "active", approvals: 3, rejections: 1, hoursAgo: 13 },
    ],
  },
  {
    id: "satcom-open-satellite-telemetry-p6",
    type: "protocol",
    statement: "Open satellite telemetry so anyone can build on orbital data streams",
    description: "Protocol mission funding ground-station software, packet schemas, and reference APIs for community access to low-earth orbit sensor feeds.",
    image: "https://images.unsplash.com/photo-1776625332913-dea4d2916419?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1770370419338-f9a813302baa?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "SATCOM",
    lifecycle: "graduated",
    marketCapUsd: 368000,
    liquidityUsd: 112000,
    holders: 702,
    councilMultiplier: 1.08,
    perfBase: 108,
    daysAgo: 3,
    requests: [
      { idSuffix: "r1", title: "Launch public telemetry API for CubeSat fleet", description: "Ground station upgrades, schema docs, and rate-limited public access for builder accounts.", requester: "Satcom Open", amountUsd: 17600, status: "accepted", approvals: 5, rejections: 0, hoursAgo: 64 },
    ],
  },
  {
    id: "craft-vr-lost-crafts-museum-q7",
    type: "creative project",
    statement: "Preserve disappearing crafts inside an immersive VR museum",
    description: "Creative mission capturing master artisans in volumetric video, building interactive exhibits, and releasing tours under community cultural licenses.",
    image: "https://images.unsplash.com/photo-1767476106330-4e5a0b4dcf94?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1538388149542-5e24932d11a8?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "CRAFT",
    lifecycle: "bonding",
    marketCapUsd: 132000,
    liquidityUsd: 78000,
    holders: 389,
    councilMultiplier: 0.72,
    perfBase: 97,
    daysAgo: 7,
    requests: [
      { idSuffix: "r1", title: "Capture three master artisan volumetric sessions", description: "Travel, scanning crew, and post-production for pottery, weaving, and wood joinery exhibits.", requester: "Craft VR Studio", amountUsd: 8400, status: "active", approvals: 3, rejections: 1, hoursAgo: 15 },
    ],
  },
  {
    id: "jazz-independent-album-series-r8",
    type: "creative project",
    statement: "Fund an independent jazz album series owned by its listeners",
    description: "Creative mission backing studio time, musician residencies, and vinyl presses for a listener-co-owned catalog of contemporary jazz recordings.",
    image: "https://images.unsplash.com/photo-1770399883774-4a5ca3e32a7d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1613412140788-9ed674d57c41?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "JAZZ",
    lifecycle: "bonding",
    marketCapUsd: 108000,
    liquidityUsd: 52000,
    holders: 356,
    councilMultiplier: 0.68,
    perfBase: 96,
    daysAgo: 8,
    requests: [
      { idSuffix: "r1", title: "Record and mix the debut quartet album", description: "Studio block, session musicians, mastering, and artwork for the first community release.", requester: "Blue Room Collective", amountUsd: 6900, status: "accepted", approvals: 4, rejections: 1, hoursAgo: 88 },
    ],
  },
  {
    id: "mural-public-art-festival-s9",
    type: "creative project",
    statement: "Transform blank walls into a citywide mural festival",
    description: "Creative mission commissioning local artists, supplying lift equipment, and publishing open documentation so neighborhoods keep curating their own public art.",
    image: "https://images.unsplash.com/photo-1769613758100-a5d12762b1ce?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1769690094063-72afcb6c1c7a?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "MURAL",
    lifecycle: "bonding",
    marketCapUsd: 94000,
    liquidityUsd: 36000,
    holders: 328,
    councilMultiplier: 0.6,
    perfBase: 95,
    daysAgo: 10,
    requests: [
      { idSuffix: "r1", title: "Fund twelve mural walls for spring festival", description: "Artist stipends, paint supplies, lift rentals, and community unveiling events.", requester: "Mural City", amountUsd: 5800, status: "active", approvals: 2, rejections: 2, hoursAgo: 17 },
    ],
  },
  {
    id: "flood-village-early-warning-t0",
    type: "public good",
    statement: "Warn downstream villages before floods arrive with open alerts",
    description: "Public-good mission deploying river gauge SMS alerts, volunteer relay networks, and evacuation maps for communities without reliable internet.",
    image: "https://images.unsplash.com/photo-1655857072503-01e4fdd00e90?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1772945858747-21726f64cd56?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "FLOOD",
    lifecycle: "bonding",
    marketCapUsd: 156000,
    liquidityUsd: 24000,
    holders: 441,
    councilMultiplier: 0.83,
    perfBase: 101,
    daysAgo: 6,
    requests: [
      { idSuffix: "r1", title: "Install river gauges across four tributaries", description: "Sensors, solar power, SMS gateway, and training for village flood coordinators.", requester: "Flood Alert Network", amountUsd: 10200, status: "active", approvals: 4, rejections: 0, hoursAgo: 9 },
    ],
  },
  {
    id: "book-open-textbook-library-u1",
    type: "public good",
    statement: "Give every student access to high-quality open textbooks",
    description: "Public-good mission funding textbook authoring sprints, translation teams, and print-on-demand hubs so learners can access free course materials.",
    image: "https://images.unsplash.com/photo-1770235621081-030607a06cee?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1778689247254-fea80373b516?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "BOOK",
    lifecycle: "bonding",
    marketCapUsd: 124000,
    liquidityUsd: 18000,
    holders: 397,
    councilMultiplier: 0.75,
    perfBase: 98,
    daysAgo: 9,
    requests: [
      { idSuffix: "r1", title: "Publish open calculus and physics textbook set", description: "Author stipends, copy editing, diagram licensing, and campus print partnerships.", requester: "Open Textbook Lab", amountUsd: 7600, status: "accepted", approvals: 5, rejections: 0, hoursAgo: 96 },
    ],
  },
  {
    id: "wild-wildlife-crossing-corridor-v2",
    type: "public good",
    statement: "Fund wildlife crossings that reconnect fragmented habitats",
    description: "Public-good mission supporting overpass engineering studies, wildlife camera networks, and community advocacy for safe animal migration routes.",
    image: "https://images.unsplash.com/photo-1640634121868-ff5b77dbf177?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1757858849087-7095a55a0550?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "WILD",
    lifecycle: "bonding",
    marketCapUsd: 178000,
    liquidityUsd: 12000,
    holders: 453,
    councilMultiplier: 0.87,
    perfBase: 102,
    daysAgo: 7,
    requests: [
      { idSuffix: "r1", title: "Complete wildlife corridor feasibility study", description: "Ecology surveys, crossing design drafts, and public comment sessions with state agencies.", requester: "Wild Corridor Project", amountUsd: 11400, status: "active", approvals: 3, rejections: 1, hoursAgo: 12 },
    ],
  },
  {
    id: "tether-orbital-elevator-test-w3",
    type: "ambitious outcome",
    statement: "Test the first kilometer-scale tether for an orbital elevator prototype",
    description: "Ambitious outcome mission funding materials research, vacuum chamber tests, and a high-altitude tether demonstration to validate lift cable survivability.",
    image: "https://images.unsplash.com/photo-1720214658819-2676e74b4c69?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1614314007212-0257d6e2f7d8?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "TETHER",
    lifecycle: "graduated",
    marketCapUsd: 468000,
    liquidityUsd: 8500,
    holders: 798,
    councilMultiplier: 1.2,
    perfBase: 113,
    daysAgo: 2,
    requests: [
      { idSuffix: "r1", title: "Build vacuum chamber tether stress rig", description: "Composite samples, cyclic loading instrumentation, and published failure mode datasets.", requester: "Tether Lab", amountUsd: 28400, status: "active", approvals: 5, rejections: 0, hoursAgo: 4 },
      { idSuffix: "r2", title: "High-altitude balloon tether demonstration", description: "One-kilometer spool deployment, telemetry, and recovery operations with aviation coordination.", requester: "Dr. Kenji Watanabe", amountUsd: 19800, status: "accepted", approvals: 6, rejections: 0, hoursAgo: 48 },
    ],
  },
  {
    id: "river-dam-removal-restoration-x4",
    type: "ambitious outcome",
    statement: "Restore a free-flowing river by removing an obsolete dam",
    description: "Ambitious outcome mission coordinating sediment studies, fish passage design, and deconstruction so a blocked river can reconnect cold-water habitat.",
    image: "https://images.unsplash.com/photo-1654184488785-5596b11f4aca?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1775232786059-25699cd2e1de?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "RIVER",
    lifecycle: "graduated",
    marketCapUsd: 392000,
    liquidityUsd: 5000,
    holders: 731,
    councilMultiplier: 1.11,
    perfBase: 110,
    daysAgo: 3,
    requests: [
      { idSuffix: "r1", title: "Fund dam deconstruction engineering phase", description: "Hydrology modeling, sediment management plan, and contractor bids for staged removal.", requester: "River Restore Coalition", amountUsd: 21200, status: "active", approvals: 4, rejections: 1, hoursAgo: 7 },
    ],
  },
  {
    id: "compost-citywide-digester-network-y5",
    type: "ambitious outcome",
    statement: "Compost an entire district's food waste with neighborhood digesters",
    description: "Ambitious outcome mission building modular biodigesters, collection routes, and soil partnerships so one district sends zero food waste to landfill.",
    image: "https://images.unsplash.com/photo-1733053037404-9f9750f79f94?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1569880153113-76e33fc52d5f?auto=format&fit=crop&w=400&q=80",
    tokenSymbol: "COMPOST",
    lifecycle: "bonding",
    marketCapUsd: 204000,
    liquidityUsd: 3200,
    holders: 512,
    councilMultiplier: 0.91,
    perfBase: 103,
    daysAgo: 5,
    requests: [
      { idSuffix: "r1", title: "Install four neighborhood biodigester units", description: "Digesters, odor controls, hauling contracts, and soil lab testing for output quality.", requester: "Compost District", amountUsd: 13800, status: "active", approvals: 3, rejections: 1, hoursAgo: 11 },
      { idSuffix: "r2", title: "Launch resident composting onboarding program", description: "Bin distribution, pickup schedules, and block captain training across the pilot district.", requester: "Green Blocks", amountUsd: 6200, status: "accepted", approvals: 5, rejections: 0, hoursAgo: 70 },
    ],
  },
];

function imageKey(url) {
  if (url.includes("unsplash.com/photo-")) return url.match(/photo-([^?]+)/)?.[1] ?? url;
  if (url.includes("pexels.com/photos/")) return `pexels-${url.match(/photos\/(\d+)/)?.[1] ?? url}`;
  return url;
}

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
    { daysAgo: 30, factor: 0.86 },
    { daysAgo: 14, factor: 0.93 },
    { daysAgo: 7, factor: 0.97 },
    { daysAgo: 1, factor: 0.994 },
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
      if (approveIndex < request.approvals) approveIndex += 1;
      else if (rejectIndex < request.rejections) {
        vote = "reject";
        rejectIndex += 1;
      } else break;
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
  const existing = await pool.query("select image_url, token_image_url from missions");
  const used = new Set(existing.rows.flatMap((row) => [row.image_url, row.token_image_url]).map(imageKey));

  const batchImages = mixedMissions.flatMap((mission) => [mission.image, mission.tokenImage]);
  const batchKeys = batchImages.map(imageKey);
  const uniqueBatch = new Set(batchKeys);
  if (uniqueBatch.size !== batchImages.length) {
    throw new Error("Batch contains duplicate images.");
  }
  for (const key of batchKeys) {
    if (used.has(key)) throw new Error(`Image already used in production: ${key}`);
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
