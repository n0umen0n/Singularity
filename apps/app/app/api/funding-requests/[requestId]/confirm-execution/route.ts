import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmFundingRequestExecution } from "@/lib/backend/store";

export const runtime = "nodejs";

type ConfirmFundingRequestExecutionInput = {
  signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const session = requireSession(request);
    const { requestId } = await params;
    const input = await readJson<ConfirmFundingRequestExecutionInput>(request);
    return ok(await confirmFundingRequestExecution(requestId, { ...input, wallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
