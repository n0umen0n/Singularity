import { fail, ok, readJson } from "@/lib/backend/http";
import { setSessionCookie } from "@/lib/backend/session";
import { verifyAuth } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readJson<Parameters<typeof verifyAuth>[0]>(request);
    const session = await verifyAuth(input);
    const response = ok({ session });
    setSessionCookie(response, session.address);

    return response;
  } catch (error) {
    return fail(error);
  }
}
