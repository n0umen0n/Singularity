import { ok } from "@/lib/backend/http";
import { getSession, setSessionCookie } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getSession(request);
  const response = ok({ session });

  if (session) {
    setSessionCookie(response, session.address);
  }

  return response;
}
