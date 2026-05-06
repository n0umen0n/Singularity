import type { FundingRequest, Mission } from "@/lib/mock-data";
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
  tokenBalances: Array<{ missionId: string; symbol: string; balance: number; usd: number; council?: boolean }>;
  createdMissions: Array<{ missionId: string; tradingFeesEarned: number; claimableFees?: number }>;
  submittedRequests?: Array<{ request: FundingRequest; symbol: string }>;
  councilRequests?: Array<{ request: FundingRequest; symbol: string }>;
};

export type MissionQuote = {
  missionId: string;
  side: "buy" | "sell";
  inputAmount: number;
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

export type MissionBalances = {
  wallet: string;
  missionId: string;
  usdc: number;
  missionToken: number;
  tokenSymbol: string;
};

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
  if (!response.ok) throw new Error(data?.error || `Request failed with status ${response.status}.`);
  return data as T;
}

export function listMissions(params: { q?: string; sort?: string } = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  return api<{ missions: Mission[] }>(`/api/missions${search.size ? `?${search}` : ""}`);
}

export function getMission(missionId: string) {
  return api<{ mission: Mission }>(`/api/missions/${missionId}`);
}

export function getProfile(address: string) {
  return api<{ profile: Profile }>(`/api/profile/${address}`);
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
}) {
  return api<{ launchId: string | null; mission: Mission; transaction: PreparedTransaction }>("/api/missions/prepare-launch", {
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

export function registerCouncilCandidate(missionId: string) {
  return api<{ transaction: PreparedTransaction }>(`/api/council-candidates/register`, {
    method: "POST",
    body: JSON.stringify({ missionId }),
  });
}
