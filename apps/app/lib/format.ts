/** Compact USD for mission liquidity badges — always one decimal in millions (e.g. $3.5M). */
export function formatLiquidityUsd(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(safeValue);
  const sign = safeValue < 0 ? "-" : "";

  if (absoluteValue >= 1_000_000) {
    return `${sign}$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  }
  if (absoluteValue >= 1000) {
    return `${sign}$${Math.round(absoluteValue / 1000)}K`;
  }
  if (absoluteValue === 0) {
    return "$0";
  }
  return money(safeValue, false);
}

export function money(value: number, compact = false, maximumFractionDigitsOverride?: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(safeValue);
  const sign = safeValue < 0 ? "-" : "";

  if (compact) {
    if (absoluteValue >= 1_000_000) {
      return formatLiquidityUsd(safeValue);
    }
    if (absoluteValue >= 1000) {
      const thousands = Math.round(absoluteValue / 1000);
      return `${sign}$${thousands}K`;
    }
  }

  const maximumFractionDigits =
    maximumFractionDigitsOverride ??
    (absoluteValue >= 1000 ? 0 : absoluteValue > 0 && absoluteValue < 0.01 ? 8 : 4);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits,
  }).format(safeValue);
}

export function number(value: number, compact = false) {
  const formatted = new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Number.isFinite(value) ? value : 0);

  return compact ? formatted.toLowerCase() : formatted;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
