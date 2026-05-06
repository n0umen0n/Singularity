import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { prepareCouncilCheckpoint } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof prepareCouncilCheckpoint>[0]>(request);
    return ok(await prepareCouncilCheckpoint({ ...input, authorityWallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
