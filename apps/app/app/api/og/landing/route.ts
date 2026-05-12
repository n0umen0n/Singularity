import { renderHeroOg } from "@/lib/og";

export const runtime = "nodejs";

export async function GET() {
  return renderHeroOg();
}
