import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { storeObject, type StoredObject } from "@singularity/storage";

export type MissionTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  properties: {
    category: "mission-token";
    platform: "Singularity";
  };
};

export function buildMissionTokenMetadata(input: {
  tokenSymbol: string;
  description: string;
  tokenImage?: string;
  missionImage?: string;
}): MissionTokenMetadata {
  const image = input.tokenImage?.trim() || input.missionImage?.trim();
  return {
    name: input.tokenSymbol,
    symbol: input.tokenSymbol,
    description: input.description,
    ...(image ? { image } : {}),
    properties: { category: "mission-token", platform: "Singularity" },
  };
}

export function missionTokenMetadataHash(metadata: MissionTokenMetadata) {
  return createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
}

function publicAppBaseUrl() {
  const configured = process.env.SINGULARITY_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function missionTokenMetadataUri(stored: StoredObject, hash: string) {
  if (stored.storage === "vercel-blob") return stored.uri;
  return `${publicAppBaseUrl()}/api/metadata/${hash}.json`;
}

export async function publishMissionTokenMetadata(input: {
  creatorWallet: string;
  tokenSymbol: string;
  description: string;
  tokenImage?: string;
  missionImage?: string;
}) {
  const metadata = buildMissionTokenMetadata(input);
  const hash = missionTokenMetadataHash(metadata);
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  const stored = await storeObject({
    keyPrefix: `metadata/${input.creatorWallet}`,
    filename: `${hash}.json`,
    contentType: "application/json",
    bytes,
  });

  return {
    metadata,
    hash,
    uri: missionTokenMetadataUri(stored, hash),
    stored,
  };
}

export async function readMissionTokenMetadataByHash(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;

  const root = process.env.SINGULARITY_OBJECT_STORAGE_PATH || path.join(process.cwd(), ".singularity", "objects");
  const metadataRoot = path.join(root, "metadata");

  try {
    const owners = await readdir(metadataRoot, { withFileTypes: true });
    for (const owner of owners) {
      if (!owner.isDirectory()) continue;
      const files = await readdir(path.join(metadataRoot, owner.name));
      const match = files.find((file) => file.startsWith(`${hash}-`));
      if (!match) continue;
      const bytes = await readFile(path.join(metadataRoot, owner.name, match));
      return { contentType: "application/json", bytes };
    }
  } catch {
    return null;
  }

  return null;
}
