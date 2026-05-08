import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmMissionTreasuryAllocationClaim } from "@/lib/backend/store";

export const runtime = "nodejs";

type ConfirmTreasuryAllocationClaimInput = {
  signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const session = requireSession(request);
    const { missionId } = await params;
    const input = await readJson<ConfirmTreasuryAllocationClaimInput>(request);
    return ok(await confirmMissionTreasuryAllocationClaim(missionId, { ...input, wallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
