import type { Mission } from "@/lib/mock-data";

const MISSION_CREATOR_DISPLAY_OVERRIDES: Record<string, string> = {
  "build-gentura-s-autonomous-agents-so-startups-ge-2418": "HFwWwd1SbTnMteUhzHDkE8qrxRmrSNuhqsURCvgyD5vS",
  "make-ai-companionship-feel-real-through-natural--5a54": "HFwWwd1SbTnMteUhzHDkE8qrxRmrSNuhqsURCvgyD5vS",
};

export function getMissionCreatorDisplayWallet(mission: Pick<Mission, "id" | "creatorWallet">) {
  const override = MISSION_CREATOR_DISPLAY_OVERRIDES[mission.id];
  if (override) return override;

  const creatorWallet = mission.creatorWallet?.trim();
  return creatorWallet || null;
}
