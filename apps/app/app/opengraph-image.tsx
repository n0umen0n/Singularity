import { ogSize, renderHeroOg } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "Singularity – Fundraising redefined";
export const size = ogSize;
export const contentType = "image/png";
export const revalidate = false;

export default function Image() {
  return renderHeroOg();
}
