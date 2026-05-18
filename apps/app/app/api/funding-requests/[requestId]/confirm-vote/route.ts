import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmFundingRequestVote } from "@/lib/backend/store";

export const runtime = "nodejs";

type ConfirmFundingRequestVoteInput = {
  vote?: "approve" | "reject";
  signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const session = requireSession(request);
    const { requestId } = await params;
    const input = await readJson<ConfirmFundingRequestVoteInput>(request);
    return ok(await confirmFundingRequestVote(requestId, { ...input, wallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
