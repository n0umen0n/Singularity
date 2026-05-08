import { ogSize, renderMissionOg } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "Singularity mission preview";
export const size = ogSize;
export const contentType = "image/png";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return renderMissionOg(missionId);
}
