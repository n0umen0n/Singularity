import { fail, ok } from "@/lib/backend/http";
import { listMissions, type MissionSort } from "@/lib/backend/store";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

function parseSort(value: string | null): MissionSort {
  if (value === "most-holders" || value === "newest") return value;
  return "highest-liquidity";
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parsePositiveInt(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const offset = Math.max(parsePositiveInt(url.searchParams.get("offset"), 0), 0);
    const missions = await listMissions({
      q: url.searchParams.get("q") || undefined,
      sort: parseSort(url.searchParams.get("sort")),
      limit: limit + 1,
      offset,
    });
    const hasMore = missions.length > limit;

    return ok({ missions: missions.slice(0, limit), pagination: { limit, offset, hasMore } });
  } catch (error) {
    return fail(error, 500);
  }
}
