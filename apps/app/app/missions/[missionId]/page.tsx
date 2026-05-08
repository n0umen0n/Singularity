import type { Metadata } from "next";
import { headers } from "next/headers";
import { MissionDetailPage } from "@/components/platform";
import type { Mission } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchMission(missionId: string): Promise<Mission | null> {
  try {
    const headerList = await headers();
    const host = headerList.get("host");
    if (!host) return null;
    const proto =
      headerList.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    const response = await fetch(
      `${proto}://${host}/api/missions/${encodeURIComponent(missionId)}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { mission?: Mission };
    return payload.mission ?? null;
  } catch {
    return null;
  }
}

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
  return <MissionDetailPage missionId={missionId} />;
}
