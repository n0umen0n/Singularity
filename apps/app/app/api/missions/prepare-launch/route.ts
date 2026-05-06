import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { prepareMissionLaunch } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof prepareMissionLaunch>[0]>(request);
    return ok(await prepareMissionLaunch({ ...input, creatorWallet: session.address }), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
