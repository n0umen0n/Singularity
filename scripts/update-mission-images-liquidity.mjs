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

/** Each background and token image appears exactly once across all missions. */
const updates = [
  {
    symbol: "FORGE",
    id: "forge-open-robotics-arm-d7e4",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=400&q=80",
    liquidity: 740000,
  },
  {
    symbol: "LUNA",
    id: "luna-greenhouse-growth-cycle-a9b7",
    image: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=400&q=80",
    liquidity: 682000,
  },
  {
    symbol: "HELIX",
    id: "helix-decentralized-storage-protocol-a1f2",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=400&q=80",
    liquidity: 615000,
  },
  {
    symbol: "NRLN",
    id: "northline-battery-ebike-pack-c6e4",
    image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=400&q=80",
    liquidity: 548000,
  },
  {
    symbol: "LUMN",
    id: "lumen-health-sleep-wearable-f4a1",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&w=400&q=80",
    liquidity: 472000,
  },
  {
    symbol: "ENZY",
    id: "decode-rare-enzyme-pathways-a3b1",
    image: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=400&q=80",
    liquidity: 395000,
  },
  {
    symbol: "VERID",
    id: "verid-identity-proof-protocol-b4c2",
    image: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=400&q=80",
    liquidity: 328000,
  },
  {
    symbol: "AQUA",
    id: "aqua-field-water-purifier-f8a6",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=400&q=80",
    liquidity: 261000,
  },
  {
    symbol: "ATLAS",
    id: "atlas-marine-biodiversity-commons-e9f6",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1556760544-74068565f05c?auto=format&fit=crop&w=400&q=80",
    liquidity: 204000,
  },
  {
    symbol: "PARC",
    id: "parcel-robotics-campus-delivery-a8c2",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1596495578065-6e0763fa1178?auto=format&fit=crop&w=400&q=80",
    liquidity: 157000,
  },
  {
    symbol: "AIRLY",
    id: "airly-city-air-quality-network-e7f5",
    image: "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=400&q=80",
    liquidity: 118000,
  },
  {
    symbol: "DEEP",
    id: "deep-sea-microbiome-catalog-b1c8",
    image: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=400&q=80",
    liquidity: 89000,
  },
  {
    symbol: "FORMA",
    id: "studio-forma-ai-staging-d2f5",
    image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80",
    liquidity: 63000,
  },
  {
    symbol: "FOLK",
    id: "folk-open-world-music-game-d3e0",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80",
    liquidity: 41000,
  },
  {
    symbol: "PRISM",
    id: "prism-spatial-audio-sdk-b3c8",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=400&q=80",
    liquidity: 28000,
  },
  {
    symbol: "ORBIT",
    id: "orbit-independent-sci-fi-film-d6e4",
    image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=400&q=80",
    liquidity: 17000,
  },
  {
    symbol: "KOVA",
    id: "kova-kitchen-smart-appliance-b1d3",
    image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1497440001374-f26997328c1b?auto=format&fit=crop&w=400&q=80",
    liquidity: 9500,
  },
  {
    symbol: "RIDE",
    id: "ride-rural-mutual-aid-network-c2d9",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=80",
    liquidity: 5200,
  },
  {
    symbol: "FIXIT",
    id: "fixit-neighborhood-tool-library-c5d3",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=400&q=80",
    liquidity: 2800,
  },
  {
    symbol: "CLGR",
    id: "carbon-ledger-attribution-registry-c5d1",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=85",
    tokenImage: "https://images.unsplash.com/photo-1593720213428-28a5b9e94613?auto=format&fit=crop&w=400&q=80",
    liquidity: 1000,
  },
];

function photoId(url) {
  return url.match(/photo-([^?]+)/)?.[1] ?? url;
}

async function main() {
  const allImages = updates.flatMap((entry) => [entry.image, entry.tokenImage]);
  const unique = new Set(allImages.map(photoId));
  if (unique.size !== allImages.length) {
    throw new Error(`Expected ${allImages.length} unique images, found ${unique.size}.`);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const entry of updates) {
      await client.query(
        `
          update missions
          set image_url = $2, token_image_url = $3
          where id = $1
        `,
        [entry.id, entry.image, entry.tokenImage],
      );
      await client.query(
        `
          update mission_metrics
          set liquidity_usdc = $2, updated_at = now()
          where mission_id = $1
        `,
        [entry.id, entry.liquidity],
      );
      console.log(`${entry.symbol.padEnd(6)} $${(entry.liquidity / 1000).toFixed(entry.liquidity >= 10000 ? 0 : 1)}k liquidity`);
    }
    await client.query("commit");
    console.log(`Updated ${updates.length} missions with unique images and liquidity from $1k to $740k.`);
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
