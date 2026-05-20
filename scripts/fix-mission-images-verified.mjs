import fs from "node:fs";
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

const hero = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=85`;
const token = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=80`;
const heroPexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
const tokenPexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=400`;

/** Missions to fix: id, symbol, search queries for hero + token */
const missions = [
  { id: "velo-electric-cargo-bike-a1", symbol: "VELO", heroQ: "electric cargo bike delivery courier", tokenQ: "cargo bicycle delivery box" },
  { id: "pen-smart-insulin-delivery-b2", symbol: "PEN", heroQ: "medical laboratory microscope research", tokenQ: "insulin syringe medical" },
  { id: "hypo-vertical-hydroponic-tower-c3", symbol: "HYPO", heroQ: "hydroponic vertical garden indoor plants", tokenQ: "microgreens hydroponic sprouts" },
  { id: "hear-open-hearing-aid-firmware-d4", symbol: "HEAR", heroQ: "hearing aid ear medical device", tokenQ: "headphones audio hearing" },
  { id: "mri-portable-rural-clinics-e5", symbol: "MRI", heroQ: "mri machine hospital scanner", tokenQ: "medical imaging brain scan" },
  { id: "gene-crispr-sickle-cell-trial-f6", symbol: "GENE", heroQ: "dna laboratory genetics research", tokenQ: "dna helix biotechnology" },
  { id: "magma-volcano-sensor-network-g7", symbol: "MAGMA", heroQ: "volcano eruption lava", tokenQ: "volcano smoke crater" },
  { id: "vault-climate-resilient-seed-bank-h8", symbol: "VAULT", heroQ: "seed bank agriculture seeds jars", tokenQ: "seeds grains agriculture" },
  { id: "dark-matter-detector-calibration-i9", symbol: "DARK", heroQ: "galaxy stars space astronomy", tokenQ: "observatory telescope night sky" },
  { id: "fridge-community-food-network-j0", symbol: "FRIDGE", heroQ: "community fridge free food pantry", tokenQ: "refrigerator fresh vegetables food" },
  { id: "bridge-refugee-skills-exchange-k1", symbol: "BRIDGE", heroQ: "diverse community people together", tokenQ: "people collaboration workshop skills" },
  { id: "mesh-neighborhood-broadband-coop-l2", symbol: "MESH", heroQ: "network cables server room", tokenQ: "ethernet cables network switch" },
  { id: "safe-night-walk-collective-m3", symbol: "SAFE", heroQ: "city street night lights safe", tokenQ: "street lamp night urban" },
  { id: "print-decentralized-science-publishing-n4", symbol: "PRINT", heroQ: "scientific research laboratory papers", tokenQ: "open science journal research" },
  { id: "trace-supply-chain-provenance-o5", symbol: "TRACE", heroQ: "warehouse logistics shipping boxes", tokenQ: "barcode scanner inventory logistics" },
  { id: "satcom-open-satellite-telemetry-p6", symbol: "SATCOM", heroQ: "satellite dish space communication", tokenQ: "satellite orbit earth space" },
  { id: "craft-vr-lost-crafts-museum-q7", symbol: "CRAFT", heroQ: "pottery artisan craft hands", tokenQ: "virtual reality headset museum" },
  { id: "jazz-independent-album-series-r8", symbol: "JAZZ", heroQ: "jazz concert live music saxophone", tokenQ: "saxophone jazz musician" },
  { id: "mural-public-art-festival-s9", symbol: "MURAL", heroQ: "street mural colorful wall art", tokenQ: "spray paint street art mural" },
  { id: "flood-village-early-warning-t0", symbol: "FLOOD", heroQ: "flood river village water", tokenQ: "flood warning water gauge river" },
  { id: "book-open-textbook-library-u1", symbol: "BOOK", heroQ: "library textbooks students studying", tokenQ: "stack of books education" },
  { id: "wild-wildlife-crossing-corridor-v2", symbol: "WILD", heroQ: "wildlife bridge forest animals", tokenQ: "deer forest wildlife nature" },
  { id: "tether-orbital-elevator-test-w3", symbol: "TETHER", heroQ: "rocket launch space", tokenQ: "international space station orbit" },
  { id: "river-dam-removal-restoration-x4", symbol: "RIVER", heroQ: "river flowing nature free", tokenQ: "dam water river hydro" },
  { id: "compost-citywide-digester-network-y5", symbol: "COMPOST", heroQ: "compost organic waste recycling", tokenQ: "compost soil gardening earth" },
  { id: "fixit-neighborhood-tool-library-c5d3", symbol: "FIXIT", heroQ: "tool workshop repair hardware", tokenQ: "hand tools wrench repair" },
  { id: "airly-city-air-quality-network-e7f5", symbol: "AIRLY", heroQ: "air pollution city smog sky", tokenQ: "air quality sensor environment" },
  { id: "deep-sea-microbiome-catalog-b1c8", symbol: "DEEP", heroQ: "deep ocean underwater blue", tokenQ: "jellyfish deep sea marine" },
  { id: "ride-rural-mutual-aid-network-c2d9", symbol: "RIDE", heroQ: "rural road car countryside", tokenQ: "carpool ride share community car" },
  { id: "tile-solar-roof-shingles-e1a2", symbol: "TILE", heroQ: "solar panels rooftop house", tokenQ: "solar panel close up energy" },
  { id: "remit-open-cross-border-payments-h4d5", symbol: "REMIT", heroQ: "mobile payment phone money transfer", tokenQ: "international remittance finance app" },
  { id: "ling-vanishing-languages-documentary-i5e6", symbol: "LING", heroQ: "ancient manuscript language writing", tokenQ: "old book handwritten text" },
  { id: "just-tenant-legal-aid-chatbot-j6f7", symbol: "JUST", heroQ: "apartment building tenant housing", tokenQ: "law books legal justice gavel" },
];

const seedFiles = [
  "scripts/seed-mixed-missions.mjs",
  "scripts/seed-mixed-missions-batch2.mjs",
  "scripts/seed-mixed-missions-batch3.mjs",
];

function imageKey(url) {
  const unsplash = url.match(/photo-([^?]+)/)?.[1];
  if (unsplash) return `u:${unsplash}`;
  const pexels = url.match(/pexels-photo-(\d+)/)?.[1];
  if (pexels) return `p:${pexels}`;
  return url;
}

async function searchPhotoId(query, perPage = 30) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results ?? [])
    .map((result) => result.urls?.raw?.match(/photo-([0-9]+-[a-f0-9]+)/)?.[1])
    .filter(Boolean);
}

async function urlWorks(url) {
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  const type = response.headers.get("content-type") ?? "";
  return response.status === 200 && type.includes("image");
}

async function pickUrl(ids, used, buildUrl) {
  for (const id of ids) {
    const key = `u:${id}`;
    if (used.has(key)) continue;
    const url = buildUrl(id);
    if (await urlWorks(url)) {
      used.add(key);
      return url;
    }
  }
  return null;
}

async function resolveOne(mission, used, kind) {
  const queries = kind === "hero" ? [mission.heroQ, mission.tokenQ, mission.symbol] : [mission.tokenQ, mission.heroQ, mission.symbol];
  const build = kind === "hero" ? hero : token;
  for (const query of queries) {
    const ids = await searchPhotoId(query);
    const url = await pickUrl(ids, used, build);
    if (url) return url;
  }
  return null;
}

async function resolveImages(used) {
  const resolved = [];
  for (const mission of missions) {
    const image = await resolveOne(mission, used, "hero");
    const tokenImage = await resolveOne(mission, used, "token");
    if (!image || !tokenImage) {
      throw new Error(`Could not resolve images for ${mission.symbol} (hero=${Boolean(image)} token=${Boolean(tokenImage)})`);
    }
    resolved.push({ ...mission, image, tokenImage });
    console.log(`${mission.symbol.padEnd(7)} hero: ${imageKey(image)} token: ${imageKey(tokenImage)}`);
  }
  return resolved;
}

function patchSeedFiles(resolved) {
  const byId = Object.fromEntries(resolved.map((entry) => [entry.id, entry]));
  for (const file of seedFiles) {
    let src = fs.readFileSync(file, "utf8");
    let count = 0;
    for (const entry of Object.values(byId)) {
      const pattern = new RegExp(
        `(id: "${entry.id}"[\\s\\S]*?image: )"[^"]+"(\\s*,\\s*\\n\\s*tokenImage: )"[^"]+"`,
      );
      if (!pattern.test(src)) continue;
      src = src.replace(pattern, `$1"${entry.image}"$2"${entry.tokenImage}"`);
      count++;
    }
    fs.writeFileSync(file, src);
    console.log(`Patched ${file}: ${count} missions`);
  }
}

async function applyToDatabase(resolved) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const entry of resolved) {
      const result = await client.query(
        `update missions set image_url = $2, token_image_url = $3 where id = $1`,
        [entry.id, entry.image, entry.tokenImage],
      );
      if (result.rowCount === 0) throw new Error(`Mission not found: ${entry.id}`);
    }
    await client.query("commit");
    console.log(`Database updated: ${resolved.length} missions`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const client = await pool.connect();
  const existing = await client.query("select id, image_url, token_image_url from missions");
  client.release();

  const fixIds = new Set(missions.map((m) => m.id));
  const used = new Set(
    existing.rows
      .filter((row) => !fixIds.has(row.id))
      .flatMap((row) => [row.image_url, row.token_image_url])
      .map(imageKey),
  );

  console.log(`Reserving ${used.size} image keys from other missions...`);
  const resolved = await resolveImages(used);
  patchSeedFiles(resolved);
  await applyToDatabase(resolved);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
