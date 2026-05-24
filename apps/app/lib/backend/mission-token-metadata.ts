import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { storeObject, type StoredObject } from "@singularity/storage";

export type MissionTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  external_url?: string;
  properties: {
    category: "mission-token";
    platform: "Singularity";
  };
};

export function buildMissionTokenMetadata(input: {
  missionId: string;
  statement: string;
  tokenSymbol: string;
  description: string;
  tokenImage?: string;
  missionImage?: string;
}): MissionTokenMetadata {
  const image = input.tokenImage?.trim() || input.missionImage?.trim();
  return {
    name: input.statement.trim(),
    symbol: input.tokenSymbol,
    description: input.description,
    external_url: `${publicAppBaseUrl()}/missions/${input.missionId}`,
    ...(image ? { image } : {}),
    properties: { category: "mission-token", platform: "Singularity" },
  };
}

export function missionTokenMetadataHash(metadata: MissionTokenMetadata) {
  return createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
}

export function publicAppBaseUrl() {
  const configured = process.env.SINGULARITY_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return "https://app.singularity.diy";
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function missionTokenOnChainUri(hash: string) {
  // Keep on-chain URIs short so Meteora launch fits in one Solana transaction.
  return `${publicAppBaseUrl()}/api/metadata/${hash}.json`;
}

async function readBytesFromStorageUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/api/metadata/")) return null;

  if (trimmed.startsWith("local-object://")) {
    const key = trimmed.slice("local-object://".length);
    const root = process.env.SINGULARITY_OBJECT_STORAGE_PATH || path.join(process.cwd(), ".singularity", "objects");
    try {
      const bytes = await readFile(path.join(root, key));
      return { contentType: "application/json", bytes };
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith("http")) return null;

  const response = await fetch(trimmed);
  if (!response.ok) return null;

  return {
    contentType: response.headers.get("content-type") || "application/json",
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

export async function publishMissionTokenMetadata(input: {
  creatorWallet: string;
  missionId: string;
  statement: string;
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
    storageUri: stored.uri,
    onChainUri: missionTokenOnChainUri(hash),
    stored,
  };
}

async function readMissionTokenMetadataFromDatabase(hash: string) {
  if (!process.env.DATABASE_URL) return null;

  try {
    const { query } = await import("@/lib/backend/db");
    const result = await query<{ uri: string }>("select uri from metadata_uploads where hash = $1 limit 1", [hash]);
    const uri = result.rows[0]?.uri?.trim();
    if (!uri) return null;
    return readBytesFromStorageUri(uri);
  } catch {
    return null;
  }
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
    // Fall through to database-backed blob metadata.
  }

  return readMissionTokenMetadataFromDatabase(hash);
}

/** @deprecated Use missionTokenOnChainUri instead. */
export function missionTokenMetadataUri(_stored: StoredObject, hash: string) {
  return missionTokenOnChainUri(hash);
}
