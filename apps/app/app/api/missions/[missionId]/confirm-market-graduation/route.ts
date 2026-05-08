import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmMissionMarketGraduation } from "@/lib/backend/store";

export const runtime = "nodejs";

type ConfirmMarketGraduationInput = {
  signature?: string;
  dammPool?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const session = requireSession(request);
    const { missionId } = await params;
    const input = await readJson<ConfirmMarketGraduationInput>(request);
    return ok(await confirmMissionMarketGraduation(missionId, { ...input, wallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
