import { fail, ok } from "@/lib/backend/http";
import { getProfile } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    const url = new URL(_request.url);
    return ok({ profile: await getProfile(address, { includeBalances: url.searchParams.get("summary") !== "1" }) });
  } catch (error) {
    return fail(error, 500);
  }
}
