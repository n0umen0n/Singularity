import { fail, ok, readJson } from "@/lib/backend/http";
import { assertGasSponsorshipAvailable, recordGasSponsorshipUsage } from "@/lib/backend/gas-sponsorship";
import {
  completeSponsoredCouncilCandidateRegistrationTransaction,
  launchFeeSponsorshipConfigured,
  validateSponsoredCouncilCandidateRegistrationTransaction,
} from "@/lib/backend/launch-sponsorship";
import { requireSession } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!launchFeeSponsorshipConfigured()) {
      throw new Error("Council registration fee sponsorship is not configured on the server.");
    }

    const session = requireSession(request);
    const input = await readJson<{
      missionId?: string;
      transactionBase64?: string;
    }>(request);

    if (!input.missionId) throw new Error("missionId is required.");
    if (!input.transactionBase64?.trim()) throw new Error("transactionBase64 is required.");

    assertGasSponsorshipAvailable(session.address);
    validateSponsoredCouncilCandidateRegistrationTransaction({
      transactionBase64: input.transactionBase64,
      ownerWallet: session.address,
      missionId: input.missionId,
    });

    const signature = await completeSponsoredCouncilCandidateRegistrationTransaction({
      transactionBase64: input.transactionBase64,
      ownerWallet: session.address,
      missionId: input.missionId,
    });
    recordGasSponsorshipUsage(session.address);

    return ok({
      signature,
      missionId: input.missionId,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("sponsor-council-candidate-register failed", error.message);
    }
    return fail(error, error instanceof Error && error.message === "Authentication is required." ? 401 : 400);
  }
}
