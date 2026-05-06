import { fail, ok, readJson } from "@/lib/backend/http";
import { createAuthNonce } from "@/lib/backend/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readJson<{ address?: string }>(request);
    return ok(await createAuthNonce(input.address), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
