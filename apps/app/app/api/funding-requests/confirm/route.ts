import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmFundingRequest } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof confirmFundingRequest>[0]>(request);
    return ok(await confirmFundingRequest({ ...input, requesterWallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
