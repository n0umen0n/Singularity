import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { refreshMissionLaunchTransaction } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<{ launchId?: string; sponsorFees?: boolean }>(request);
    return ok(
      await refreshMissionLaunchTransaction({
        launchId: input.launchId,
        wallet: session.address,
        sponsorFees: input.sponsorFees,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
