import { fail, ok, readJson } from "@/lib/backend/http";
import { recordGasSponsorshipUsage } from "@/lib/backend/gas-sponsorship";
import { isSponsorableTransactionKind } from "@/lib/gas-sponsorship";
import { requireSession } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<{ kind?: string; signature?: string }>(request);

    if (!isSponsorableTransactionKind(input.kind)) {
      throw new Error("This transaction type is not eligible for gas sponsorship.");
    }
    if (!input.signature?.trim()) throw new Error("signature is required.");

    const usage = recordGasSponsorshipUsage(session.address);
    return ok({ recorded: true, signature: input.signature, usage });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Authentication is required." ? 401 : 400);
  }
}
