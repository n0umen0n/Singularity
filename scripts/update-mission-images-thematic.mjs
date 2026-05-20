/**
 * @deprecated Broken image IDs (404). Use scripts/fix-mission-images-verified.mjs instead.
 */
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

/** Hero + token pairs aligned to mission themes. Each URL is unique across this batch. */
const updates = [
  { symbol: "FIXIT", id: "fixit-neighborhood-tool-library-c5d3", image: hero("1572981772904-9dcf27e7731c"), tokenImage: token("1504147553397-f2377f947f68") },
  { symbol: "AIRLY", id: "airly-city-air-quality-network-e7f5", image: hero("1606107556592-1f77f6089033"), tokenImage: token("1581094797336-zcb412ee569f") },
  { symbol: "DEEP", id: "deep-sea-microbiome-catalog-b1c8", image: hero("1551244072-916a78d7b4a1"), tokenImage: token("1544551763-46a013bb70d5") },
  { symbol: "RIDE", id: "ride-rural-mutual-aid-network-c2d9", image: hero("1449966950483-6ecccd69d82f"), tokenImage: token("1549316268-6175ec8f5546") },
  { symbol: "TILE", id: "tile-solar-roof-shingles-e1a2", image: hero("1497435334941-8c899ee9e8e9"), tokenImage: token("1508514177121-7ef47b417be9") },
  { symbol: "REMIT", id: "remit-open-cross-border-payments-h4d5", image: hero("1601594778535-6246c6f3b9ef"), tokenImage: token("1579621970563-ea39e4d8e2d4") },
  { symbol: "LING", id: "ling-vanishing-languages-documentary-i5e6", image: hero("1526629903603-89fe535b531b"), tokenImage: token("1456514290212-84b1061cb029") },
  { symbol: "JUST", id: "just-tenant-legal-aid-chatbot-j6f7", image: hero("1560518883-c4b4a4ebe0f9"), tokenImage: token("1589821862913-aa012b6c8eca") },
  { symbol: "HYPO", id: "hypo-vertical-hydroponic-tower-c3", image: hero("1530830990172-edd5868f73f4"), tokenImage: token("1416875823615-b682059f322b") },
  { symbol: "MRI", id: "mri-portable-rural-clinics-e5", image: hero("1516549655169-fe775d467f93"), tokenImage: token("1631217868264-b3d4da0d9f94") },
  { symbol: "GENE", id: "gene-crispr-sickle-cell-trial-f6", image: hero("1631815581876-dcecbf743844"), tokenImage: token("1639755491376-de32eba8dbca") },
  { symbol: "MAGMA", id: "magma-volcano-sensor-network-g7", image: hero("1616422286723-4648a0fbf341"), tokenImage: token("1523821746166-d083a4daebea") },
  { symbol: "VAULT", id: "vault-climate-resilient-seed-bank-h8", image: hero("1585320806294-834114b58413"), tokenImage: token("1625246330185-f13958f7bc29") },
  { symbol: "DARK", id: "dark-matter-detector-calibration-i9", image: hero("1446776813273-6c96fcaa6301"), tokenImage: token("1462336625762-9cf55ccb2f8f") },
  { symbol: "FRIDGE", id: "fridge-community-food-network-j0", image: hero("1644364904336-1066db40765c"), tokenImage: token("1574480032282-0b3f8a2e8b2e") },
  { symbol: "BRIDGE", id: "bridge-refugee-skills-exchange-k1", image: hero("1529156069898-25994fb07313"), tokenImage: token("1521737636573-5b1f5d4d8676") },
  { symbol: "MESH", id: "mesh-neighborhood-broadband-coop-l2", image: hero("1591795485480-150cbc252b61"), tokenImage: tokenPexels("2881224") },
  { symbol: "SAFE", id: "safe-night-walk-collective-m3", image: hero("1476231793367-1fdeda0b2d8e"), tokenImage: token("1519502158262-0a7c0b4e1a4a") },
  { symbol: "PRINT", id: "print-decentralized-science-publishing-n4", image: hero("1532017616649-a552ad67716e"), tokenImage: token("1507842695167-4e3b42f42312") },
  { symbol: "TRACE", id: "trace-supply-chain-provenance-o5", image: hero("1586528111929-5c7b9a5e7a0c"), tokenImage: token("1566576911221-d113a933fe2f") },
  { symbol: "SATCOM", id: "satcom-open-satellite-telemetry-p6", image: hero("1446776657-eb367ebf18fbc35"), tokenImage: token("1614724008285-9174e37eaeb2") },
  { symbol: "CRAFT", id: "craft-vr-lost-crafts-museum-q7", image: hero("1578746535647-489780b60727"), tokenImage: token("1626549837504-e621f88fbb8a") },
  { symbol: "JAZZ", id: "jazz-independent-album-series-r8", image: hero("1470225620780-dba8ba36b745"), tokenImage: token("1414927177608-f32401d3daad") },
  { symbol: "MURAL", id: "mural-public-art-festival-s9", image: heroPexels("1108572"), tokenImage: token("1567095076866-7fef5bcaad0f") },
  { symbol: "FLOOD", id: "flood-village-early-warning-t0", image: hero("1542401881129-58444ebd4c77"), tokenImage: token("1527488527937-53536d336987") },
  { symbol: "BOOK", id: "book-open-textbook-library-u1", image: hero("1481627834876-b783cd889750"), tokenImage: token("1497633762273-297ffd6faeb0") },
  { symbol: "WILD", id: "wild-wildlife-crossing-corridor-v2", image: hero("1474515263937-fab25379fed9"), tokenImage: token("1559788798-f0b93b28df0d") },
  { symbol: "TETHER", id: "tether-orbital-elevator-test-w3", image: hero("1457364873753-d12316049995"), tokenImage: token("1446776877081-d6e5a6873680") },
  { symbol: "RIVER", id: "river-dam-removal-restoration-x4", image: hero("1473448916943-aef6efeee8f8"), tokenImage: token("1541873671040-c8b8f5e8a2f0") },
  { symbol: "COMPOST", id: "compost-citywide-digester-network-y5", image: hero("1618574610556-85edbb8480e0"), tokenImage: token("1591195853828-09019a04c962") },
];

function imageKey(url) {
  const unsplash = url.match(/photo-([^?]+)/)?.[1];
  if (unsplash) return `u:${unsplash}`;
  const pexels = url.match(/pexels-photo-(\d+)/)?.[1];
  if (pexels) return `p:${pexels}`;
  return url;
}

async function assertUniqueAgainstDb(client) {
  const batchImages = updates.flatMap((entry) => [entry.image, entry.tokenImage]);
  const batchKeys = batchImages.map(imageKey);
  const uniqueBatch = new Set(batchKeys);
  if (uniqueBatch.size !== batchImages.length) {
    throw new Error(`Batch contains duplicate images (${batchImages.length} urls, ${uniqueBatch.size} unique).`);
  }

  const existing = await client.query("select id, image_url, token_image_url from missions");
  const updateIds = new Set(updates.map((entry) => entry.id));
  const used = new Set(
    existing.rows
      .filter((row) => !updateIds.has(row.id))
      .flatMap((row) => [row.image_url, row.token_image_url])
      .map(imageKey),
  );

  for (const key of batchKeys) {
    if (used.has(key)) {
      throw new Error(`Image already used by another mission: ${key}`);
    }
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await assertUniqueAgainstDb(client);
    await client.query("begin");
    for (const entry of updates) {
      const result = await client.query(
        `
          update missions
          set image_url = $2, token_image_url = $3
          where id = $1
        `,
        [entry.id, entry.image, entry.tokenImage],
      );
      if (result.rowCount === 0) {
        throw new Error(`Mission not found: ${entry.id} (${entry.symbol})`);
      }
      console.log(`${entry.symbol.padEnd(7)} updated`);
    }
    await client.query("commit");
    console.log(`Updated ${updates.length} missions with thematic hero + token images.`);
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
