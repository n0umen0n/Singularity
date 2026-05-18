export type RequestStatus = "active" | "accepted" | "rejected" | "expired";

export type Investor = {
  id: string;
  name: string;
  address: string;
  avatar: string;
  description?: string;
  tokens: number;
  ownership: number;
  escrowedTokens?: number;
  socials?: string;
};

export type FundingRequestCouncillor = {
  address: string;
  name: string;
  avatar: string;
  tokens: number;
  vote?: "approve" | "reject";
};

export type FundingRequest = {
  id: string;
  missionId: string;
  requester: string;
  requesterAddress?: string;
  requesterName?: string;
  requesterAvatar: string;
  name: string;
  description: string;
  amountUsd: number;
  tokenAmount: number;
  approvals: number;
  rejections: number;
  timeLeft: string;
  createdAt?: string;
  votingEndsAt?: string;
  status: RequestStatus;
  paid: boolean;
  paidAt?: string | null;
  councillors?: FundingRequestCouncillor[];
};

export type PerformancePoint = {
  label: string;
  agoLabel: string;
  value: number;
  change: number;
};

export type Mission = {
  id: string;
  missionPda?: string | null;
  statement: string;
  description: string;
  image: string;
  tokenImage: string;
  tokenSymbol: string;
  tokenMint?: string | null;
  dbcPool?: string | null;
  dammPool?: string | null;
  treasuryVault?: string | null;
  lifecycle?: "draft" | "bonding" | "graduated";
  tokenPrice: number;
  holders: number;
  liquidity: number;
  treasuryUsdc: number;
  treasuryTokens: number;
  treasurySupplyPercent: number;
  totalSupply: number;
  marketTokens?: number;
  circulatingTokens?: number;
  quoteReserve?: number;
  baseReserve?: number;
  poolProgressPercent?: number;
  treasuryAllocationClaimed?: boolean;
  marketDataUpdatedAt?: string;
  performance: Record<"1H" | "4H" | "1D" | "1W" | "1M" | "6M" | "1Y", PerformancePoint>;
  council: Investor[];
  requests: FundingRequest[];
};

const avatars = [
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80",
];

function council(symbol: string, multiplier: number): Investor[] {
  return ["Astra", "Vector", "Mira", "Halden", "Nyx", "Sable"].map((name, index) => ({
    id: `${symbol.toLowerCase()}-${name.toLowerCase()}`,
    name,
    address: `So${index}La${symbol}${index}9xQa${index}38R${index}t${symbol}`,
    avatar: avatars[index],
    tokens: Math.round((920000 - index * 94000) * multiplier),
    ownership: Number((7.8 - index * 0.74).toFixed(2)),
    socials: index % 2 === 0 ? "@singularity" : undefined,
  }));
}

function performance(base: number): Mission["performance"] {
  const point = (label: string, agoLabel: string, multiplier: number) => {
    const value = Number((base * multiplier).toFixed(2));
    return { label, agoLabel, value, change: value - 100 };
  };

  return {
    "1H": point("1 hour", "1 hour ago", 1.018),
    "4H": point("4 hours", "4 hours ago", 1.064),
    "1D": point("1 day", "1 day ago", 1.284),
    "1W": point("1 week", "1 week ago", 1.92),
    "1M": point("1 month", "1 month ago", 2.74),
    "6M": point("6 months", "6 months ago", 4.6),
    "1Y": point("1 year", "1 year ago", 7.2),
  };
}

function requests(missionId: string, symbol: string): FundingRequest[] {
  const now = Date.now();
  const activeCreatedAt = new Date(now - 5 * 60 * 60 * 1000 - 36 * 60 * 1000).toISOString();
  const activeVotingEndsAt = new Date(new Date(activeCreatedAt).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: `${missionId}-r1`,
      missionId,
      requester: "Lena Ortiz",
      requesterAvatar: avatars[0],
      name: "Build the mission analytics command center",
      description: "Create a public dashboard showing holders, treasury runway, market depth, and funding request history.",
      amountUsd: 18500,
      tokenAmount: 402174,
      approvals: 3,
      rejections: 1,
      timeLeft: "18h 24m left",
      createdAt: activeCreatedAt,
      votingEndsAt: activeVotingEndsAt,
      status: "active",
      paid: false,
    },
    {
      id: `${missionId}-r2`,
      missionId,
      requester: "Arun Patel",
      requesterAvatar: avatars[2],
      name: "Research sprint and ecosystem report",
      description: "A three-week research sprint to map partners, ecosystem gaps, and first builder opportunities.",
      amountUsd: 9200,
      tokenAmount: 198740,
      approvals: 5,
      rejections: 0,
      timeLeft: "Accepted",
      status: "accepted",
      paid: false,
    },
    {
      id: `${missionId}-r3`,
      missionId,
      requester: "Nova Labs",
      requesterAvatar: avatars[4],
      name: `Experimental ${symbol} launch campaign`,
      description: "A broad marketing campaign that did not include enough delivery detail for the council.",
      amountUsd: 28000,
      tokenAmount: 609120,
      approvals: 1,
      rejections: 4,
      timeLeft: "Rejected",
      status: "rejected",
      paid: false,
    },
  ];
}

export const missions: Mission[] = [
  {
    id: "mars-gardens",
    statement: "Terraform resilient food systems for off-world cities.",
    description:
      "A mission market funding modular greenhouse robotics, seed research, and open-source climate loops for Mars-ready agriculture.",
    image: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=1400&q=85",
    tokenImage: "https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=300&q=80",
    tokenSymbol: "MARS",
    tokenPrice: 0.046,
    holders: 1842,
    liquidity: 1240000,
    treasuryUsdc: 428000,
    treasuryTokens: 10000000,
    treasurySupplyPercent: 20,
    totalSupply: 50000000,
    performance: performance(100),
    council: council("MARS", 1.1),
    requests: requests("mars-gardens", "MARS"),
  },
  {
    id: "ocean-memory",
    statement: "Map the living ocean before it disappears.",
    description:
      "Capital for autonomous reef sensors, preservation datasets, and open climate intelligence owned by the communities collecting it.",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=85",
    tokenImage: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=300&q=80",
    tokenSymbol: "TIDE",
    tokenPrice: 196000 / 4200000,
    holders: 931,
    liquidity: 760000,
    treasuryUsdc: 196000,
    treasuryTokens: 4200000,
    treasurySupplyPercent: 20,
    totalSupply: 21000000,
    performance: performance(92),
    council: council("TIDE", 0.72),
    requests: requests("ocean-memory", "TIDE"),
  },
  {
    id: "open-cure",
    statement: "Fund open therapeutics for rare diseases.",
    description:
      "A transparent funding market for patient-led research, clinical translation, and shared therapeutic IP primitives.",
    image: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1400&q=85",
    tokenImage: "https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=300&q=80",
    tokenSymbol: "CURE",
    tokenPrice: 0.128,
    holders: 2640,
    liquidity: 2130000,
    treasuryUsdc: 812000,
    treasuryTokens: 6500000,
    treasurySupplyPercent: 20,
    totalSupply: 32500000,
    performance: performance(118),
    council: council("CURE", 1.48),
    requests: requests("open-cure", "CURE"),
  },
  {
    id: "city-solar",
    statement: "Turn apartment rooftops into neighborhood power plants.",
    description:
      "Coordinating installers, residents, and software to finance solar collectives block by block.",
    image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=85",
    tokenImage: "https://images.unsplash.com/photo-1497440001374-f26997328c1b?auto=format&fit=crop&w=300&q=80",
    tokenSymbol: "SUN",
    tokenPrice: 0.031,
    holders: 612,
    liquidity: 510000,
    treasuryUsdc: 94000,
    treasuryTokens: 3000000,
    treasurySupplyPercent: 20,
    totalSupply: 15000000,
    performance: performance(104),
    council: council("SUN", 0.54),
    requests: requests("city-solar", "SUN"),
  },
];

export const currentUser = {
  name: "Vlad",
  address: "9fN7aK3bqR2sSingularity4uQe8Dx7P1Lm5Za",
  avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80",
  description: "Building capital markets for missions that should exist.",
  socials: ["@vlad", "github.com/vlad", "singularity.diy"],
  balances: {
    usdc: 42850.21,
    usdcUsd: 42850.21,
    sol: 128.44,
    solUsd: 18623.8,
  },
  tokenBalances: [
    { missionId: "mars-gardens", symbol: "MARS", balance: 284000, usd: 13064, council: true },
    { missionId: "open-cure", symbol: "CURE", balance: 96000, usd: 12288, council: false },
    { missionId: "city-solar", symbol: "SUN", balance: 410000, usd: 12710, council: true },
  ],
  createdMissions: [
    { missionId: "mars-gardens", tradingFeesEarned: 8240.18, claimableFees: 3120.44 },
    { missionId: "city-solar", tradingFeesEarned: 1290.64, claimableFees: 640.12 },
  ],
};

export function getMission(id: string) {
  return missions.find((mission) => mission.id === id) ?? missions[0];
}
