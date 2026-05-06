import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { registerCouncilCandidate } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof registerCouncilCandidate>[0]>(request);
    return ok(await registerCouncilCandidate({ ...input, wallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
