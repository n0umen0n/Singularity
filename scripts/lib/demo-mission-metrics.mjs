/** Metrics helpers for DB-seeded demo missions (not on-chain Meteora launches). */

export const DEMO_CREATOR_WALLET = "DemoSingularityCreator1111111111111111111111";

export const DEFAULT_TOTAL_SUPPLY = 50_000_000;
export const DEFAULT_TREASURY_TOKENS = 10_000_000;

/** Pool-side token value as a share of fully diluted market cap (matches UI breakdown). */
export const MARKET_LIQUIDITY_SHARE = 0.18;

function seedUint(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic, mission-specific cap so seeded values avoid obvious repeating patterns. */
export function humanizeMarketCapUsd(rawCapUsd, missionId) {
  const raw = Math.max(Number(rawCapUsd) || 0, 0);
  if (!missionId || raw <= 0) return raw;

  const seed = seedUint(missionId);
  const jitterPct = 0.945 + ((seed % 10_001) / 10_001) * 0.11;
  const step =
    raw >= 10_000_000 ? 19_000 : raw >= 1_000_000 ? 2_300 : raw >= 100_000 ? 370 : raw >= 10_000 ? 53 : 17;
  const phase = ((seed >> 7) % 89) * 137 + ((seed >> 13) % 409);
  const snapped = Math.round((raw * jitterPct + phase) / step) * step;
  const tail = 113 + ((seed >> 3) % 811);

  return Math.max(Math.round(snapped + tail), Math.round(raw * 0.9));
}

/**
 * Derive token price, treasury, and pool token counts from liquidity.
 * Liquidity is kept as-is; market cap ≈ liquidity / MARKET_LIQUIDITY_SHARE with per-mission jitter.
 * Treasury (10M tokens) is 20% of total supply and 20% of market cap at that price.
 */
export function metricsFromLiquidity(liquidityUsd, holders, options = {}) {
  const totalSupply = options.totalSupply ?? DEFAULT_TOTAL_SUPPLY;
  const treasuryTokens = options.treasuryTokens ?? DEFAULT_TREASURY_TOKENS;
  const missionId = options.missionId || "";
  const liquidity = Math.max(Number(liquidityUsd) || 0, 0);
  const rawMarketCapUsd = liquidity / MARKET_LIQUIDITY_SHARE;
  const marketCapUsd = humanizeMarketCapUsd(rawMarketCapUsd, missionId);
  const tokenPrice = marketCapUsd / totalSupply;
  const treasuryShare = treasuryTokens / totalSupply;
  const tradableSupply = Math.max(totalSupply - treasuryTokens, 0);
  const marketTokens = Math.min(
    Math.round(liquidity / Math.max(tokenPrice, 1e-12)),
    tradableSupply,
  );
  const circulatingTokens = Math.max(tradableSupply - marketTokens, 0);
  const treasuryUsdc = Math.round(marketCapUsd * treasuryShare);

  return {
    tokenPrice,
    holders: Number(holders) || 0,
    liquidity,
    treasuryUsdc,
    marketTokens,
    circulatingTokens,
    marketCapUsd,
    volumeUsdc: Math.round(liquidity * (0.11 + ((seedUint(`${missionId}:vol`) % 30) / 1000))),
  };
}
