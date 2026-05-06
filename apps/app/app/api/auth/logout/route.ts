import { ok } from "@/lib/backend/http";
import { clearSessionCookie } from "@/lib/backend/session";

export const runtime = "nodejs";

export async function POST() {
  const response = ok({ loggedOut: true });
  clearSessionCookie(response);
  return response;
}
