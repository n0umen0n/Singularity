import type { FundingRequest, Mission } from "@/lib/mock-data";
import type { MeteoraDbcLaunchSimulation, MeteoraDbcLaunchSimulationInput } from "@singularity/solana";
import type { PreparedTransaction } from "@/lib/wallet";

export type Profile = {
  name: string;
  address: string;
  avatar: string;
  description: string;
  socials: string[];
  balances: {
    usdc?: number;
    usdcUsd?: number;
    sol?: number;
    solUsd?: number;
  };
  tokenBalances: Array<{ missionId: string; symbol: string; balance: number; usd: number; council?: boolean; mission?: Mission | null }>;
  createdMissions: Array<{ missionId: string; tradingFeesEarned: number; claimableFees?: number; mission?: Mission | null }>;
  submittedRequests?: Array<{ request: FundingRequest; symbol: string }>;
  councilRequests?: Array<{ request: FundingRequest; symbol: string }>;
};

export type MissionQuote = {
  missionId: string;
  side: "buy" | "sell";
  inputAmount: number;
  requestedInputAmount?: number;
  partialFill?: boolean;
  willGraduate?: boolean;
  estimatedOutput: number;
  minimumAmountOut?: number | null;
  priceImpactPercent?: number | null;
  currentPrice?: number;
  route: string;
  market?: {
    lifecycle?: string | null;
    tokenMint?: string | null;
    dbcPool?: string | null;
    dammPool?: string | null;
    baseReserve?: number;
    quoteReserve?: number;
    liquidityUsd?: number;
    poolProgressPercent?: number;
  };
  transaction: PreparedTransaction;
};

export type MissionMarketGraduation = {
  mission: Mission;
  dammPool: string | null;
  transaction: PreparedTransaction;
};

export type MissionTreasuryAllocationClaim = {
  mission: Mission;
  treasuryVault: string | null;
  transaction: PreparedTransaction;
};

export type MissionBalances = {
  wallet: string;
  missionId: string;
  usdc: number;
  missionToken: number;
  tokenSymbol: string;
};

function requestErrorMessage(status: number, data: unknown) {
  const serverMessage =
    typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : null;
  if (serverMessage) return serverMessage;
  if (status === 401) return "Sign in with your wallet before continuing.";
  if (status === 403) return "Your wallet does not have permission to perform this action.";
  if (status === 404) return "The requested item could not be found. Refresh the page and try again.";
  if (status === 409) return "This action conflicts with the latest state. Refresh the page and try again.";
  if (status >= 500) return "The server could not complete this action. Please try again in a moment.";
  return "The request could not be completed. Check the form and try again.";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(requestErrorMessage(response.status, data));
  return data as T;
}

export function listMissions(params: { q?: string; sort?: string } = {}, init?: Pick<RequestInit, "signal">) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  return api<{ missions: Mission[] }>(`/api/missions${search.size ? `?${search}` : ""}`, init);
}

export function getMission(missionId: string, init?: Pick<RequestInit, "signal"> & { refresh?: boolean }) {
  const search = init?.refresh ? "?refresh=1" : "";
  return api<{ mission: Mission }>(`/api/missions/${missionId}${search}`, { signal: init?.signal });
}

export function getProfile(address: string, init?: Pick<RequestInit, "signal"> & { summary?: boolean }) {
  const search = init?.summary ? "?summary=1" : "";
  return api<{ profile: Profile }>(`/api/profile/${address}${search}`, { signal: init?.signal });
}

export function updateProfile(input: { name?: string; description?: string; avatar?: string; socials?: string[] }) {
  return api<{ profile: Profile }>("/api/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function uploadObject(input: { file: File; purpose: string }) {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("purpose", input.purpose);
  return api<{ upload: { uri: string; hash: string } }>("/api/uploads/prepare", { method: "POST", body: formData });
}

export function prepareMissionLaunch(input: {
  statement: string;
  description: string;
  tokenSymbol: string;
  missionImage?: string;
  tokenImage?: string;
  initialPurchaseUsdc?: number;
  initialMarketCap?: number;
  migrationMarketCap?: number;
}) {
  return api<{ launchId: string | null; mission: Mission; transaction: PreparedTransaction }>("/api/missions/prepare-launch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function simulateDbcLaunch(input: MeteoraDbcLaunchSimulationInput) {
  return api<{ simulation: MeteoraDbcLaunchSimulation }>("/api/markets/dbc-simulation", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmMissionLaunch(input: { launchId: string; signature: string }) {
  return api<{ mission: Mission }>("/api/missions/confirm-launch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getMissionQuote(missionId: string, input: { side: "buy" | "sell"; amount: number; wallet?: string | null; slippageBps?: number }) {
  return api<MissionQuote>(`/api/missions/${missionId}/quote`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function prepareMissionMarketGraduation(missionId: string) {
  return api<MissionMarketGraduation>(`/api/missions/${missionId}/prepare-market-graduation`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function confirmMissionMarketGraduation(missionId: string, input: { signature: string; dammPool: string }) {
  return api<{ mission: Mission }>(`/api/missions/${missionId}/confirm-market-graduation`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function prepareMissionTreasuryAllocationClaim(missionId: string) {
  return api<MissionTreasuryAllocationClaim>(`/api/missions/${missionId}/prepare-treasury-allocation-claim`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function confirmMissionTreasuryAllocationClaim(missionId: string, input: { signature: string }) {
  return api<{ mission: Mission }>(`/api/missions/${missionId}/confirm-treasury-allocation-claim`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getMissionBalances(missionId: string, wallet: string) {
  const search = new URLSearchParams({ wallet });
  return api<MissionBalances>(`/api/missions/${missionId}/balances?${search}`);
}

export function prepareFundingRequest(input: { missionId: string; name: string; description: string; amountUsd: number }) {
  return api<{ request: FundingRequest; transaction: PreparedTransaction }>("/api/funding-requests/prepare", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function voteFundingRequest(requestId: string, vote: "approve" | "reject") {
  return api<{ request: FundingRequest; transaction: PreparedTransaction }>(`/api/funding-requests/${requestId}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export function executeFundingRequest(requestId: string) {
  return api<{ request: FundingRequest; transaction: PreparedTransaction }>(`/api/funding-requests/${requestId}/execute`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function confirmFundingRequestExecution(requestId: string, input: { signature: string }) {
  return api<{ request: FundingRequest }>(`/api/funding-requests/${requestId}/confirm-execution`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function registerCouncilCandidate(missionId: string) {
  return api<{ transaction: PreparedTransaction }>(`/api/council-candidates/register`, {
    method: "POST",
    body: JSON.stringify({ missionId }),
  });
}
