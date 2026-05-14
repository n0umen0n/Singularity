import { fail, ok } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { releaseFundingRequestVoteEscrow } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    requireSession(request);
    const { requestId } = await params;
    return ok(await releaseFundingRequestVoteEscrow(requestId), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
