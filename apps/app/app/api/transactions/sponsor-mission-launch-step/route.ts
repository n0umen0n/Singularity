import { fail, ok, readJson } from "@/lib/backend/http";
import { assertGasSponsorshipAvailable, recordGasSponsorshipUsage } from "@/lib/backend/gas-sponsorship";
import {
  completeSponsoredLaunchTransaction,
  launchFeeSponsorshipConfigured,
  validateSponsoredLaunchTransaction,
} from "@/lib/backend/launch-sponsorship";
import { requireSession } from "@/lib/backend/session";
import { query } from "@/lib/backend/db";

export const runtime = "nodejs";

type PendingLaunchRow = {
  creator_wallet: string;
  launch_accounts: Record<string, unknown> | null;
};

export async function POST(request: Request) {
  try {
    if (!launchFeeSponsorshipConfigured()) {
      throw new Error("Mission launch fee sponsorship is not configured on the server.");
    }

    const session = requireSession(request);
    const input = await readJson<{
      launchId?: string;
      stepIndex?: number;
      transactionBase64?: string;
    }>(request);

    if (!input.launchId) throw new Error("launchId is required.");
    if (!input.transactionBase64?.trim()) throw new Error("transactionBase64 is required.");

    const pendingResult = await query<PendingLaunchRow>(
      "select creator_wallet, launch_accounts from pending_mission_launches where id = $1 and creator_wallet = $2 and status = 'prepared' limit 1",
      [input.launchId, session.address],
    );
    const pending = pendingResult.rows[0];
    if (!pending) throw new Error("Pending mission launch not found.");
    if (!pending.launch_accounts?.sponsorFees) {
      throw new Error("This mission launch was not prepared for fee sponsorship.");
    }

    assertGasSponsorshipAvailable(session.address);
    const stepIndex = input.stepIndex ?? 0;
    validateSponsoredLaunchTransaction({
      transactionBase64: input.transactionBase64,
      creatorWallet: session.address,
      expectedAccounts: pending.launch_accounts,
      stepIndex,
    });

    const signature = await completeSponsoredLaunchTransaction({
      transactionBase64: input.transactionBase64,
      creatorWallet: session.address,
      expectedAccounts: pending.launch_accounts,
      stepIndex,
    });
    recordGasSponsorshipUsage(session.address);

    return ok({
      signature,
      launchId: input.launchId,
      stepIndex: input.stepIndex ?? 0,
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("sponsor-mission-launch-step failed", error.message);
    }
    return fail(error, error instanceof Error && error.message === "Authentication is required." ? 401 : 400);
  }
}
