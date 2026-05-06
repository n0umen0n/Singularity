import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export type StoredObject = {
  hash: string;
  uri: string;
  contentType: string;
  size: number;
  storage: "vercel-blob" | "local";
};

export type StoreObjectInput = {
  keyPrefix: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export async function storeObject(input: StoreObjectInput): Promise<StoredObject> {
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `${input.keyPrefix.replace(/^\/|\/$/g, "")}/${hash}-${safeName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const body = Buffer.from(input.bytes);
    const blob = await put(key, body, {
      access: "public",
      contentType: input.contentType,
    });

    return {
      hash,
      uri: blob.url,
      contentType: input.contentType,
      size: input.bytes.byteLength,
      storage: "vercel-blob",
    };
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for production object storage.");
  }

  const root = process.env.SINGULARITY_OBJECT_STORAGE_PATH || path.join(process.cwd(), ".singularity", "objects");
  const filePath = path.join(root, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.bytes);

  return {
    hash,
    uri: `local-object://${key}`,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    storage: "local",
  };
}
