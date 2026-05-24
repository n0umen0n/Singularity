import { fail, ok, readJson } from "@/lib/backend/http";
import { assertGasSponsorshipAvailable, validateSponsoredTransaction } from "@/lib/backend/gas-sponsorship";
import { isSponsorableTransactionKind } from "@/lib/gas-sponsorship";
import { requireSession } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<{ transactionBase64?: string; kind?: string }>(request);

    if (!isSponsorableTransactionKind(input.kind)) {
      throw new Error("This transaction type is not eligible for gas sponsorship.");
    }

    validateSponsoredTransaction(input.transactionBase64 || "");
    const usage = assertGasSponsorshipAvailable(session.address);

    return ok({
      allowed: true,
      address: session.address,
      kind: input.kind,
      usage,
    });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Authentication is required." ? 401 : 400);
  }
}
