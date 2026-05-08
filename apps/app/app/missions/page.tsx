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

export default async function MissionsRoute() {
  const missions = await listMissions({ sort: "highest-liquidity" });
  return <MissionsPage initialMissions={missions} />;
}
