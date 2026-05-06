import { fail, ok } from "@/lib/backend/http";
import { listMissions, type MissionSort } from "@/lib/backend/store";

export const runtime = "nodejs";

function parseSort(value: string | null): MissionSort {
  if (value === "most-holders" || value === "newest") return value;
  return "highest-liquidity";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const missions = await listMissions({
      q: url.searchParams.get("q") || undefined,
      sort: parseSort(url.searchParams.get("sort")),
    });

    return ok({ missions });
  } catch (error) {
    return fail(error, 500);
  }
}
