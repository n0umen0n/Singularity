import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmVoteEscrowWithdrawal } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const session = requireSession(request);
    const { missionId } = await params;
    const input = await readJson<{ signature?: string }>(request);
    return ok(await confirmVoteEscrowWithdrawal(missionId, { ...input, wallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
