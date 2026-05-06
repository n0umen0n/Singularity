import { simulateMeteoraDbcLaunch, type MeteoraDbcLaunchSimulationInput } from "@singularity/solana";
import { fail, ok, readJson } from "@/lib/backend/http";

export const runtime = "nodejs";

function inputFromUrl(request: Request): MeteoraDbcLaunchSimulationInput {
  const url = new URL(request.url);
  const buyAmountsUsdc = url.searchParams
    .get("buyAmountsUsdc")
    ?.split(",")
    .map((amount) => Number(amount.trim()))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  return {
    totalSupply: Number(url.searchParams.get("totalSupply") || 0) || undefined,
    treasurySupplyPercent: Number(url.searchParams.get("treasurySupplyPercent") || 0) || undefined,
    initialMarketCap: Number(url.searchParams.get("initialMarketCap") || 0) || undefined,
    migrationMarketCap: Number(url.searchParams.get("migrationMarketCap") || 0) || undefined,
    initialPurchaseUsdc: Number(url.searchParams.get("initialPurchaseUsdc") || 0) || undefined,
    buyAmountsUsdc,
  };
}

export async function GET(request: Request) {
  try {
    return ok({ simulation: simulateMeteoraDbcLaunch(inputFromUrl(request)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return ok({ simulation: simulateMeteoraDbcLaunch(await readJson<MeteoraDbcLaunchSimulationInput>(request)) });
  } catch (error) {
    return fail(error);
  }
}
