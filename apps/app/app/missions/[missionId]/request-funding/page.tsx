import { RequestFundingPage } from "@/components/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RequestFundingRoute({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <RequestFundingPage missionId={missionId} />;
}
