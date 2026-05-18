import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { Mission } from "@/lib/mock-data";

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export type WalletBalanceSnapshot = {
  balances: {
    usdc: number;
    usdcUsd: number;
    sol: number;
    solUsd?: number;
  };
  tokenBalances: Array<{ missionId: string; symbol: string; balance: number; escrowed?: number; total?: number; usd: number; council?: boolean }>;
};

function escrowedTokensForMission(address: string, mission: Mission) {
  const member = mission.council.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  return member?.escrowedTokens || 0;
}

function rpcUrl() {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
}

function uiTokenAmount(account: { account: { data: unknown } }) {
  const parsed = account.account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } } };
  return Number(parsed.parsed?.info?.tokenAmount?.uiAmount || 0);
}

export async function tokenBalance(connection: Connection, owner: string, mint: string) {
  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) }, "confirmed");

  return accounts.value.reduce((total, account) => total + uiTokenAmount(account), 0);
}

async function parsedTokenAccountsByProgram(connection: Connection, owner: PublicKey, programId: PublicKey) {
  try {
    return await connection.getParsedTokenAccountsByOwner(owner, { programId }, "confirmed");
  } catch {
    return { value: [] };
  }
}

export async function getWalletBalanceSnapshot(address: string, missions: Mission[]): Promise<WalletBalanceSnapshot> {
  const owner = new PublicKey(address);
  const connection = new Connection(rpcUrl(), "confirmed");
  const usdcMint = process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT;
  const missionByMint = new Map(missions.filter((mission) => mission.tokenMint).map((mission) => [mission.tokenMint!, mission]));

  const [lamports, usdc, splTokenAccounts, token2022Accounts] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    tokenBalance(connection, address, usdcMint),
    parsedTokenAccountsByProgram(connection, owner, TOKEN_PROGRAM_ID),
    parsedTokenAccountsByProgram(connection, owner, TOKEN_2022_PROGRAM_ID),
  ]);
  const sol = lamports / 1_000_000_000;

  const missionTokenAmounts = new Map<string, number>();
  for (const account of [...splTokenAccounts.value, ...token2022Accounts.value]) {
    const parsed = account.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null } } } };
    const mint = parsed.parsed?.info?.mint;
    const amount = Number(parsed.parsed?.info?.tokenAmount?.uiAmount || 0);
    if (!mint || amount <= 0 || !missionByMint.has(mint)) continue;
    missionTokenAmounts.set(mint, (missionTokenAmounts.get(mint) || 0) + amount);
  }

  const tokenBalances = [...missionTokenAmounts.entries()].map(([mint, balance]) => {
    const mission = missionByMint.get(mint)!;
    const escrowed = escrowedTokensForMission(address, mission);
    const total = balance + escrowed;
    const council = mission.council.some((member) => member.address.toLowerCase() === address.toLowerCase());
    return {
      missionId: mission.id,
      symbol: mission.tokenSymbol,
      balance,
      escrowed,
      total,
      usd: total * mission.tokenPrice,
      council,
    };
  });

  for (const mission of missions) {
    const escrowed = escrowedTokensForMission(address, mission);
    if (escrowed <= 0 || !mission.tokenMint || missionTokenAmounts.has(mission.tokenMint)) continue;
    const council = mission.council.some((member) => member.address.toLowerCase() === address.toLowerCase());
    tokenBalances.push({
      missionId: mission.id,
      symbol: mission.tokenSymbol,
      balance: 0,
      escrowed,
      total: escrowed,
      usd: escrowed * mission.tokenPrice,
      council,
    });
  }

  return {
    balances: {
      usdc,
      usdcUsd: usdc,
      sol,
    },
    tokenBalances,
  };
}

export function emptyWalletBalanceSnapshot(): WalletBalanceSnapshot {
  return {
    balances: {
      usdc: 0,
      usdcUsd: 0,
      sol: 0,
    },
    tokenBalances: [],
  };
}
