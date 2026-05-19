import { Connection } from "@solana/web3.js";
import { missingIndexerEnv, runIndexerBatch } from "@singularity/indexer-core";
import { fail, ok } from "@/lib/backend/http";
import { getPool } from "@/lib/backend/db";
import { isProductionRuntime, requireServerEnv } from "@/lib/backend/env";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = isProductionRuntime() ? requireServerEnv("CRON_SECRET") : process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function numericParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: Request) {
  try {
    if (!authorize(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const missing = missingIndexerEnv(process.env);
    if (missing.length > 0) {
      return Response.json({ error: `Missing indexer env: ${missing.join(", ")}` }, { status: 500 });
    }

    const url = new URL(request.url);
    const result = await runIndexerBatch({
      connection: new Connection(process.env.SOLANA_RPC_URL!, "confirmed"),
      pool: getPool(),
      env: process.env,
      batchSize: numericParam(url, "batchSize", 50),
      maxPages: numericParam(url, "maxPages", 4),
    });

    console.log("Indexer batch complete", JSON.stringify(result));
    return ok(result);
  } catch (error) {
    console.error("Indexer batch failed", error);
    return fail(error, 500);
  }
}
