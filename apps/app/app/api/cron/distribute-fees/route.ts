import { fail, ok } from "@/lib/backend/http";
import { isProductionRuntime, requireServerEnv } from "@/lib/backend/env";
import { distributeMissionFeesInPostgres } from "@/lib/backend/postgres-store";

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
    const url = new URL(request.url);
    return ok(await distributeMissionFeesInPostgres({ limit: numericParam(url, "limit", 50) }));
  } catch (error) {
    console.error("Mission fee distribution cron failed", error);
    return fail(error, 500);
  }
}
