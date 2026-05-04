import { RequestFundingPage } from "@/components/platform";

export default async function RequestFundingRoute({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <RequestFundingPage missionId={missionId} />;
}
