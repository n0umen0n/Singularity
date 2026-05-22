/** Creator share of collected USDC trading fees, in basis points (10000 = 100%). */
export const CREATOR_TRADING_FEE_SHARE_BPS = 0;

/** Previous 50/50 split. Set `CREATOR_TRADING_FEE_SHARE_BPS` back to this value to restore creator payouts. */
export const LEGACY_CREATOR_TRADING_FEE_SHARE_BPS = 5000;

/** Whether to show earned trading fees on user profiles. */
export const SHOW_CREATOR_TRADING_FEES_IN_PROFILE = false;

export function splitTradingFeeAmounts(amount: bigint): { creatorAmount: bigint; platformAmount: bigint } {
  const creatorAmount = (amount * BigInt(CREATOR_TRADING_FEE_SHARE_BPS)) / 10000n;
  const platformAmount = amount - creatorAmount;
  return { creatorAmount, platformAmount };
}

function formatCreatorSharePercent(bps: number) {
  return bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

export const MISSION_CREATE_TRADING_FEE_DESCRIPTION =
  CREATOR_TRADING_FEE_SHARE_BPS > 0
    ? `A mission can be anything: a product, research goal, community, protocol, creative project, public good, or ambitious outcome. ${formatCreatorSharePercent(CREATOR_TRADING_FEE_SHARE_BPS)}% of USDC trading fees go to the creator, and ${formatCreatorSharePercent(10000 - CREATOR_TRADING_FEE_SHARE_BPS)}% to Singularity.`
    : "A mission can be anything: a product, research goal, community, protocol, creative project, public good, or ambitious outcome. Investors pay USDC trading fees that go to Singularity.";
