import type { Metadata } from "next";
import { cache } from "react";
import { MissionDetailPage } from "@/components/platform";
import { getMissionById, refreshMissionMarketData } from "@/lib/backend/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fetchMission = cache(async (missionId: string) => {
  try {
    return (await refreshMissionMarketData(missionId)) || (await getMissionById(missionId));
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ missionId: string }> }): Promise<Metadata> {
  const { missionId } = await params;
  const mission = await fetchMission(missionId);
  if (!mission) return {};

  const title = `${mission.statement} | Singularity`;
  const description = mission.description;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Singularity",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function MissionRoute({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = await fetchMission(missionId);
  return <MissionDetailPage missionId={missionId} initialMission={mission} />;
}
