import { MissionDetailPage } from "@/components/platform";

export default async function MissionRoute({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <MissionDetailPage missionId={missionId} />;
}
