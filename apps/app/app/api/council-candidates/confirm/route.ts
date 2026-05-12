import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { confirmCouncilCandidateRegistration } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof confirmCouncilCandidateRegistration>[0]>(request);
    return ok(await confirmCouncilCandidateRegistration({ ...input, wallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
