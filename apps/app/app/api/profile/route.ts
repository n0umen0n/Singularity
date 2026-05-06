import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { updateProfile } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const session = requireSession(request);
    const input = await readJson<Parameters<typeof updateProfile>[0]>(request);
    return ok({ profile: await updateProfile({ ...input, address: session.address }) });
  } catch (error) {
    return fail(error);
  }
}
