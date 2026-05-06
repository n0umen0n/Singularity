import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { voteFundingRequest } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const session = requireSession(request);
    const { requestId } = await params;
    const input = await readJson<Parameters<typeof voteFundingRequest>[1]>(request);
    return ok(await voteFundingRequest(requestId, { ...input, wallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
