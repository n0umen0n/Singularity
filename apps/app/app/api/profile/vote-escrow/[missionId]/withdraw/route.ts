import { fail, ok } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { prepareVoteEscrowWithdrawal } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const session = requireSession(request);
    const { missionId } = await params;
    return ok(await prepareVoteEscrowWithdrawal(missionId, { wallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
