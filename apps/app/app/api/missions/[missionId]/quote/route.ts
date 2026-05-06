import { fail, ok, readJson } from "@/lib/backend/http";
import { quoteMissionTrade } from "@/lib/backend/store";

export const runtime = "nodejs";

type QuoteInput = {
  side?: string;
  amount?: number;
  wallet?: string;
  slippageBps?: number;
};

async function quote(request: Request, missionId: string) {
  const url = new URL(request.url);
  const body = request.method === "POST" ? await readJson<QuoteInput>(request) : {};
  return quoteMissionTrade(missionId, {
    side: body.side || url.searchParams.get("side") || undefined,
    amount: body.amount ?? Number(url.searchParams.get("amount") || 0),
    wallet: body.wallet || url.searchParams.get("wallet") || undefined,
    slippageBps: body.slippageBps ?? Number(url.searchParams.get("slippageBps") || 100),
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const { missionId } = await params;
    return ok(await quote(request, missionId));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const { missionId } = await params;
    return ok(await quote(request, missionId));
  } catch (error) {
    return fail(error);
  }
}
