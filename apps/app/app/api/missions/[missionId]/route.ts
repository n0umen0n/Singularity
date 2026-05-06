import { fail, ok } from "@/lib/backend/http";
import { getMissionById, refreshMissionMarketData } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const { missionId } = await params;
    const mission = (await refreshMissionMarketData(missionId)) || (await getMissionById(missionId));
    if (!mission) return fail(new Error("Mission not found"), 404);

    return ok({ mission });
  } catch (error) {
    return fail(error, 500);
  }
}
