import { Connection, PublicKey } from "@solana/web3.js";
import { fail, ok } from "@/lib/backend/http";
import { getMissionById } from "@/lib/backend/store";

export const runtime = "nodejs";

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function tokenBalance(connection: Connection, owner: string, mint: string) {
  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) }, "confirmed");

  return accounts.value.reduce((total, account) => {
    const parsed = account.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number | null } } };
    return total + Number(parsed.info?.tokenAmount?.uiAmount || 0);
  }, 0);
}

export async function GET(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  try {
    const { missionId } = await params;
    const wallet = new URL(request.url).searchParams.get("wallet");
    if (!wallet) throw new Error("wallet is required.");

    const mission = await getMissionById(missionId);
    if (!mission) return fail(new Error("Mission not found"), 404);
    if (!mission.tokenMint) throw new Error("Mission token mint is not available.");

    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const usdcMint = process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT;
    const [usdc, missionToken] = await Promise.all([
      tokenBalance(connection, wallet, usdcMint),
      tokenBalance(connection, wallet, mission.tokenMint),
    ]);
    const councilMember = mission.council.find((member) => member.address.toLowerCase() === wallet.toLowerCase());
    const missionTokenEscrowed = councilMember?.escrowedTokens || 0;
    const missionTokenTotal = missionToken + missionTokenEscrowed;

    return ok({
      wallet,
      missionId,
      usdc,
      missionToken,
      missionTokenEscrowed,
      missionTokenTotal,
      tokenSymbol: mission.tokenSymbol,
    });
  } catch (error) {
    return fail(error);
  }
}
