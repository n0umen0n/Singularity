import { MissionsPage } from "@/components/platform";
import { listMissions } from "@/lib/backend/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MissionsRoute() {
  const missions = await listMissions({ sort: "highest-liquidity" });
  return <MissionsPage initialMissions={missions} />;
}
