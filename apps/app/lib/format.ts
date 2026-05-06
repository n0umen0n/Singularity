export function money(value: number, compact = false) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(safeValue);
  const maximumFractionDigits = compact || absoluteValue >= 1000 ? 0 : absoluteValue > 0 && absoluteValue < 0.01 ? 8 : 4;

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
