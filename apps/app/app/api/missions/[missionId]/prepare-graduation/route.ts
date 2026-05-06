import { fail, ok, readJson } from "@/lib/backend/http";
import { requireSession } from "@/lib/backend/session";
import { prepareMissionGraduation } from "@/lib/backend/store";

export const runtime = "nodejs";

type GraduationInput = {
  authorityWallet?: string;
  dammPool?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const session = requireSession(request);
    const { missionId } = await params;
    const input = await readJson<GraduationInput>(request);
    return ok(await prepareMissionGraduation(missionId, { ...input, authorityWallet: session.address }));
  } catch (error) {
    return fail(error);
  }
}
