import type { Metadata } from "next";
import { MissionsPage } from "@/components/platform";
import { listMissions } from "@/lib/backend/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Singularity | Fundraising redefined",
  description: "",
  openGraph: {
    type: "website",
    siteName: "Singularity",
    title: "Singularity | Fundraising redefined",
    description: "",
  },
  twitter: {
    card: "summary_large_image",
    title: "Singularity | Fundraising redefined",
    description: "",
  },
};

const MISSION_PAGE_SIZE = 24;

export default async function MissionsRoute() {
  const missions = await listMissions({ sort: "highest-liquidity", limit: MISSION_PAGE_SIZE + 1 });
  return <MissionsPage initialMissions={missions.slice(0, MISSION_PAGE_SIZE)} initialHasMore={missions.length > MISSION_PAGE_SIZE} />;
}
