import { fail, ok, readJson } from "@/lib/backend/http";
import { verifyPrivyWalletSession } from "@/lib/backend/privy";
import { setSessionCookie } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readJson<{ address?: string }>(request);
    const session = await verifyPrivyWalletSession(request, input.address);
    const response = ok({ session });
    setSessionCookie(response, session.address);

    return response;
  } catch (error) {
    return fail(error, 401);
  }
}
