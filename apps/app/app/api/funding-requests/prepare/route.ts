import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { prepareFundingRequest } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof prepareFundingRequest>[0]>(request);
    return ok(await prepareFundingRequest({ ...input, requesterWallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
