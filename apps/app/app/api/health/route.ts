import { backendHealth } from "@/lib/backend/store";
import { fail, ok } from "@/lib/backend/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await backendHealth());
  } catch (error) {
    return fail(error, 500);
  }
}
