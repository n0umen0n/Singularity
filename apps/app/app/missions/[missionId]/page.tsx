import { notFound } from "next/navigation";
import { MissionDetailPage } from "@/components/platform";
import { getMissionById, refreshMissionMarketData } from "@/lib/backend/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MissionRoute({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = (await refreshMissionMarketData(missionId)) || (await getMissionById(missionId));
  if (!mission) notFound();

  return <MissionDetailPage missionId={missionId} initialMission={mission} />;
}
