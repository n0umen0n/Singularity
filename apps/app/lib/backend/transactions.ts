import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  buildPreparedTransaction,
  buildPreparedTransactionSteps,
  DEFAULT_DBC_INITIAL_MARKET_CAP,
  DEFAULT_DBC_MIGRATION_MARKET_CAP,
  DEFAULT_DBC_TOTAL_SUPPLY,
  DEFAULT_DBC_TREASURY_SUPPLY_PERCENT,
  prepareMeteoraDammV2PositionFeeClaim,
  fetchMeteoraDbcMarketSnapshot,
  fetchMeteoraDammV2MarketSnapshot,
  latestBlockhash,
  meteoraDbcPartnerFeeClaimInstruction,
  meteoraDbcPartnerFeeClaimInstructions,
  prepareMeteoraDammV2Trade,
  prepareMeteoraDbcDammV2Migration,
  prepareMeteoraDbcLaunchInstructions,
  prepareMeteoraDbcTreasuryAllocationClaim,
  prepareMeteoraDbcTrade,
  quoteMeteoraDammV2Trade,
  quoteMeteoraDbcTrade,
  recoverMeteoraDammV2FeePositions,
  requireProgramConfig,
  resolveMeteoraDbcLaunchConfig,
  type MeteoraDammV2FeePosition,
  type MeteoraDammV2MarketSnapshot,
  type MeteoraDbcMarketSnapshot,
  type PreparedSolanaTransaction,
} from "@singularity/solana";

type TransactionResult =
  | PreparedSolanaTransaction
  | {
      kind: string;
      status: "not_configured";
      message: string;
      instructions: unknown[];
    };

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_JUPITER_API_URL = "https://lite-api.jup.ag/swap/v1";
const FALLBACK_JUPITER_API_URL = "https://api.jup.ag/swap/v1";
const JUPITER_QUOTE_TIMEOUT_MS = 2_500;
const JUPITER_SWAP_TIMEOUT_MS = 8_000;
type NotConfiguredTransaction = { kind: string; status: "not_configured"; message: string; instructions: unknown[] };

export type JupiterTradeResult = {
  route: "jupiter";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  requestedInputAmount?: number;
  partialFill?: boolean;
  willGraduate?: boolean;
  estimatedOutput: number;
  minimumAmountOut?: number | null;
  priceImpactPercent: number;
  transaction: TransactionResult;
  quoteResponse?: unknown;
};

export type MeteoraDbcTradeQuoteResult = {
  route: "meteora-dbc";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  requestedInputAmount?: number;
  partialFill?: boolean;
  willGraduate?: boolean;
  estimatedOutput: number;
  minimumAmountOut: number;
  priceImpactPercent: number;
  currentPrice: number;
  market: {
    dbcPool: string;
    tokenMint: string;
    quoteMint: string;
    baseReserve: number;
    quoteReserve: number;
    liquidityUsd: number;
    poolProgressPercent: number;
  };
  transaction: TransactionResult;
};

export type MeteoraDammV2TradeQuoteResult = {
  route: "meteora-damm-v2";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  estimatedOutput: number;
  minimumAmountOut: number;
  priceImpactPercent: number;
  currentPrice: number;
  market: {
    dammPool: string;
    tokenMint: string;
    quoteMint: string;
  };
  transaction: TransactionResult;
};

export type MissionMarketGraduationResult = {
  route: "meteora-damm-v2";
  dbcPool: string;
  dammPool: string;
  dammConfig: string;
  baseMint: string;
  quoteMint: string;
  alreadyMigrated: boolean;
  transaction: TransactionResult;
};

export type MissionTreasuryAllocationClaimResult = {
  route: "meteora-dbc";
  dbcPool: string;
  tokenMint: string;
  treasuryVault: string;
  alreadyWithdrawn: boolean;
  transaction: TransactionResult;
};

function notConfigured(kind: string, error: unknown): TransactionResult {
  const message = error instanceof Error ? error.message : "Solana transaction preparation is not configured.";
  return {
    kind,
    status: "not_configured",
    message,
    instructions: [],
  };
}

function meteoraDbcTradeErrorMessage(input: { side: "buy" | "sell"; error: unknown }) {
  const message = input.error instanceof Error ? input.error.message : "Meteora DBC trade preparation failed.";
  if (message.toLowerCase().includes("insufficient liquidity")) {
    return input.side === "buy"
      ? "This buy is larger than the remaining bonding-curve capacity before graduation. Try a smaller USDC amount or wait for the market to graduate."
      : "This sell is larger than the available bonding-curve liquidity. Try a smaller token amount.";
  }
  return message;
}

function priceImpactFromReferenceOutput(input: { referenceOutput: number; estimatedOutput: number }) {
  if (!Number.isFinite(input.referenceOutput) || input.referenceOutput <= 0) return Number.NaN;
  if (!Number.isFinite(input.estimatedOutput) || input.estimatedOutput <= 0) return Number.NaN;
  return ((input.estimatedOutput - input.referenceOutput) / input.referenceOutput) * 100;
}

function jupiterTradeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Jupiter trade preparation failed.";
  if (message.includes("CANNOT_COMPUTE_OTHER_AMOUNT_THRESHOLD")) {
    return "This amount is too small for AMM routing. Try a larger amount.";
  }
  if (message.includes("NO_ROUTES_FOUND")) {
    return "No AMM route was found for this amount. Try a larger amount.";
  }
  return message;
}

function pda(programId: string, namespace: string, id: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from(namespace), createHash("sha256").update(id).digest().subarray(0, 32)],
    new PublicKey(programId),
  );

  return address.toBase58();
}

function missionPda(registryProgramId: string, missionId: string) {
  return pda(registryProgramId, "mission", missionId);
}

function requestPda(councilProgramId: string, mission: string, metadataHash: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("request"), new PublicKey(mission).toBuffer(), Buffer.from(metadataHash.slice(0, 64).padEnd(64, "0"), "hex")],
    new PublicKey(councilProgramId),
  );

  return address.toBase58();
}

function epochCouncilPda(councilProgramId: string, mission: string, epoch: number) {
  const epochBuffer = Buffer.alloc(8);
  epochBuffer.writeBigUInt64LE(BigInt(epoch));
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("epoch_council"), new PublicKey(mission).toBuffer(), epochBuffer],
    new PublicKey(councilProgramId),
  );

  return address.toBase58();
}

function candidatePda(councilProgramId: string, mission: string, owner: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("candidate"), new PublicKey(mission).toBuffer(), new PublicKey(owner).toBuffer()],
    new PublicKey(councilProgramId),
  );

  return address.toBase58();
}

export function candidateRegistrationPda(input: { councilProgramId: string; registryProgramId: string; missionId: string; owner: string }) {
  return candidatePda(input.councilProgramId, missionPda(input.registryProgramId, input.missionId), input.owner);
}

function treasuryAuthorityPda(programId: string, mission: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority"), new PublicKey(mission).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
}

function voteEscrowAuthorityPda(programId: string, mission: string, voter: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_escrow_authority"), new PublicKey(mission).toBuffer(), new PublicKey(voter).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
}

function voteEscrowPositionPda(programId: string, mission: string, voter: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_escrow_position"), new PublicKey(mission).toBuffer(), new PublicKey(voter).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
}

function votePda(programId: string, request: string, voter: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), new PublicKey(request).toBuffer(), new PublicKey(voter).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
}

export function fundingRequestPda(input: { registryProgramId: string; councilProgramId: string; missionId: string; metadataHash: string }) {
  const mission = missionPda(input.registryProgramId, input.missionId);
  return requestPda(input.councilProgramId, mission, input.metadataHash);
}

function feeRouterAuthorityPda(programId: string, mission: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_router"), new PublicKey(mission).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
}

function anchorDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64Buffer(value: number | bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function u16Buffer(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function bytesVecBuffer(value: Uint8Array | Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(value.length);
  return Buffer.concat([length, Buffer.from(value)]);
}

function optionalKeypairFromEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;

  const secret = value.startsWith("[")
    ? Uint8Array.from(JSON.parse(value) as number[])
    : bs58.decode(value);
  return Keypair.fromSecretKey(secret);
}

function keypairFromEnv(name: string, purpose = "this transaction") {
  const keypair = optionalKeypairFromEnv(name);
  if (!keypair) throw new Error(`${name} is required for ${purpose}.`);
  return keypair;
}

function feeDistributorKeypair() {
  return keypairFromEnv("SINGULARITY_FEE_DISTRIBUTOR_KEYPAIR", "backend mission fee distribution");
}

function feeClaimerForLaunch(feeRouterAuthority: string) {
  const configured = process.env.SINGULARITY_FEE_DISTRIBUTOR_PUBKEY?.trim();
  if (configured) return configured;
  return optionalKeypairFromEnv("SINGULARITY_FEE_DISTRIBUTOR_KEYPAIR")?.publicKey.toBase58() ?? feeRouterAuthority;
}

function assertConfiguredCouncilAuthority(authority: PublicKey) {
  const expected = process.env.SINGULARITY_COUNCIL_AUTHORITY_PUBKEY?.trim();
  if (!expected) throw new Error("SINGULARITY_COUNCIL_AUTHORITY_PUBKEY is required for automatic council checkpoint finalization.");
  if (!authority.equals(new PublicKey(expected))) {
    throw new Error("SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR does not match SINGULARITY_COUNCIL_AUTHORITY_PUBKEY.");
  }
}

function hashBytes(value: string) {
  return createHash("sha256").update(value).digest().subarray(0, 32);
}

function tokenAmountBaseUnits(amount: number, decimals = 6) {
  return Math.floor(Math.max(amount, 0) * 10 ** decimals);
}

class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jupiterApiUrls() {
  return Array.from(new Set([process.env.JUPITER_API_URL, DEFAULT_JUPITER_API_URL, FALLBACK_JUPITER_API_URL].filter(Boolean).map((url) => url!.replace(/\/$/, ""))));
}

async function jsonFetch<T>(url: string, init?: RequestInit, options: { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const host = new URL(url).host;
    const message = error instanceof Error && error.name === "AbortError" ? "timed out" : error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Could not reach ${host}: ${message}`);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpStatusError(response.status, `Request failed (${response.status}): ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}

function registryInitializeMissionInstruction(input: {
  programId: string;
  creator: string;
  mission: string;
  slugHash: Buffer;
  metadataHash: string;
  tokenMint: string;
  treasuryVault: string;
  totalSupply: number;
  treasuryBps: number;
}) {
  const data = Buffer.concat([
    anchorDiscriminator("initialize_mission"),
    input.slugHash,
    Buffer.from(input.metadataHash.slice(0, 64).padEnd(64, "0"), "hex"),
    new PublicKey(input.tokenMint).toBuffer(),
    new PublicKey(input.treasuryVault).toBuffer(),
    u64Buffer(input.totalSupply),
    u16Buffer(input.treasuryBps),
  ]);

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.creator), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function registryMarkGraduatedInstruction(input: {
  programId: string;
  authority: string;
  mission: string;
  dammPool: string;
}) {
  const data = Buffer.concat([anchorDiscriminator("mark_graduated"), new PublicKey(input.dammPool).toBuffer()]);

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.authority), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.authority), isSigner: false, isWritable: false },
    ],
    data,
  });
}

function registerCandidateInstruction(input: { programId: string; owner: string; mission: string; candidate: string }) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.owner), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.candidate), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("register_candidate"),
  });
}

function finalizeEpochCouncilInstruction(input: {
  programId: string;
  authority: string;
  mission: string;
  epochCouncil: string;
  epoch: number;
  members: string[];
  escrowAmounts: number[];
}) {
  if (input.members.length !== 6) throw new Error("finalize_epoch_council requires exactly 6 members.");
  if (input.escrowAmounts.length !== 6) throw new Error("finalize_epoch_council requires exactly 6 escrow amounts.");

  const data = Buffer.concat([
    anchorDiscriminator("finalize_epoch_council"),
    u64Buffer(input.epoch),
    ...input.members.map((member) => new PublicKey(member).toBuffer()),
    ...input.escrowAmounts.map((amount) => u64Buffer(amount)),
  ]);

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.authority), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.epochCouncil), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function createFundingRequestInstruction(input: {
  programId: string;
  requester: string;
  mission: string;
  epochCouncil: string;
  request: string;
  metadataHash: string;
  recipient: string;
  tokenAmount: number;
}) {
  const tokenAmount = Math.floor(Math.max(Number(input.tokenAmount) || 0, 0));
  if (tokenAmount <= 0) throw new Error("Request token amount must be greater than zero.");

  const data = Buffer.concat([
    anchorDiscriminator("create_request"),
    Buffer.from(input.metadataHash.slice(0, 64).padEnd(64, "0"), "hex"),
    new PublicKey(input.recipient).toBuffer(),
    u64Buffer(tokenAmount),
  ]);

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.requester), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.epochCouncil), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.request), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function voteInstruction(input: {
  programId: string;
  voter: string;
  epochCouncil: string;
  request: string;
  vote: string;
  voteEscrowPosition: string;
  voterTokenAccount: string;
  voteEscrowAuthority: string;
  voteEscrowVault: string;
  mint: string;
  approve: boolean;
}) {
  const data = Buffer.concat([anchorDiscriminator("vote"), Buffer.from([input.approve ? 1 : 0])]);

  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.voter), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.epochCouncil), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.request), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.vote), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voteEscrowPosition), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voterTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voteEscrowAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.voteEscrowVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function executeFundingRequestInstruction(input: {
  programId: string;
  executor: string;
  request: string;
  treasuryAuthority: string;
  treasuryVault: string;
  recipientTokenAccount: string;
  mint: string;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.executor), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(input.request), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.treasuryAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.treasuryVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.recipientTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("execute"),
  });
}

function releaseVoteEscrowInstruction(input: {
  programId: string;
  payer: string;
  voteEscrowPosition: string;
  voteEscrowAuthority: string;
  voteEscrowVault: string;
  voter: string;
  voterTokenAccount: string;
  mint: string;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: [
      { pubkey: new PublicKey(input.payer), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(input.voteEscrowPosition), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voteEscrowAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(input.voteEscrowVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voter), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.voterTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(input.mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("release_vote_escrow"),
  });
}

export async function prepareLaunchTransaction(input: {
  creatorWallet?: string;
  missionId: string;
  metadataHash: string;
  metadataUri?: string;
  tokenName?: string;
  tokenSymbol?: string;
  totalSupply?: number;
  initialPurchaseUsdc?: number;
  initialMarketCap?: number;
  migrationMarketCap?: number;
}) {
  const kind = "mission-launch";

  try {
    if (!input.creatorWallet) throw new Error("creatorWallet is required to prepare a launch transaction.");
    const creatorWallet = input.creatorWallet;
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const missionAccount = missionPda(config.registryProgramId, input.missionId);
    const treasuryAuthority = treasuryAuthorityPda(config.councilProgramId, missionAccount);
    const feeRouterAuthority = feeRouterAuthorityPda(config.councilProgramId, missionAccount);
    const launchConfig = resolveMeteoraDbcLaunchConfig({
      totalSupply: input.totalSupply ?? DEFAULT_DBC_TOTAL_SUPPLY,
      treasurySupplyPercent: DEFAULT_DBC_TREASURY_SUPPLY_PERCENT,
      initialPurchaseUsdc: input.initialPurchaseUsdc,
      initialMarketCap: input.initialMarketCap ?? DEFAULT_DBC_INITIAL_MARKET_CAP,
      migrationMarketCap: input.migrationMarketCap ?? DEFAULT_DBC_MIGRATION_MARKET_CAP,
    });
    const meteoraLaunch = await prepareMeteoraDbcLaunchInstructions({
      rpcUrl: config.rpcUrl,
      payer: input.creatorWallet,
      poolCreator: input.creatorWallet,
      name: input.tokenName || input.missionId,
      symbol: input.tokenSymbol || "MISSION",
      uri: input.metadataUri || `https://metadata.singularity.diy/${input.metadataHash}.json`,
      quoteMint: process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT,
      feeClaimer: feeClaimerForLaunch(feeRouterAuthority),
      leftoverReceiver: treasuryAuthority,
      totalSupply: launchConfig.totalSupply,
      treasurySupplyPercent: launchConfig.treasurySupplyPercent,
      initialPurchaseUsdc: launchConfig.initialPurchaseUsdc,
      initialMarketCap: launchConfig.initialMarketCap,
      migrationMarketCap: launchConfig.migrationMarketCap,
    });
    return buildPreparedTransactionSteps({
      kind,
      feePayer: input.creatorWallet,
      recentBlockhash: blockhash.blockhash,
      steps: meteoraLaunch.transactionSteps.map((step) => ({
        ...step,
        requiredSigners: [creatorWallet, ...(step.signerKeypairs || []).map((signer) => signer.publicKey.toBase58())],
      })),
      accounts: {
        mission: "",
        treasuryAuthority,
        feeRouterAuthority,
        ...meteoraLaunch.accounts,
      },
    });
  } catch (error) {
    const failed = notConfigured(kind, error);
    return {
      kind: failed.kind,
      status: "not_configured",
      message: failed.status === "not_configured" ? failed.message : "Jupiter trade preparation failed.",
      instructions: failed.status === "not_configured" ? failed.instructions : [],
    };
  }
}

export async function prepareJupiterTradeTransaction(input: {
  wallet?: string;
  side: "buy" | "sell";
  amount: number;
  tokenMint?: string | null;
  quoteMint?: string;
  slippageBps?: number;
  referencePrice?: number | null;
}): Promise<JupiterTradeResult | { kind: string; status: "not_configured"; message: string; instructions: unknown[] }> {
  const kind = "trade";

  try {
    if (!input.tokenMint) throw new Error("tokenMint is required for Jupiter trade routing.");
    const quoteMint = input.quoteMint || process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT;
    const inputMint = input.side === "buy" ? quoteMint : input.tokenMint;
    const outputMint = input.side === "buy" ? input.tokenMint : quoteMint;
    const amount = tokenAmountBaseUnits(input.amount);
    if (amount <= 0) throw new Error("amount must be greater than zero.");
    const referenceOutput =
      input.referencePrice && input.referencePrice > 0
        ? input.side === "buy"
          ? input.amount / input.referencePrice
          : input.amount * input.referencePrice
        : 0;
    if (input.side === "sell" && referenceOutput > 0 && tokenAmountBaseUnits(referenceOutput) <= 0) {
      throw new Error("This amount is too small for AMM routing. Try a larger amount.");
    }

    type JupiterQuoteResponse = {
      outAmount?: string;
      otherAmountThreshold?: string;
      priceImpactPct?: string;
    };
    let apiUrl = "";
    let quoteResponse: JupiterQuoteResponse | null = null;
    let lastQuoteError: unknown = null;
    for (const candidateApiUrl of jupiterApiUrls()) {
      const quoteUrl = new URL(`${candidateApiUrl}/quote`);
      quoteUrl.searchParams.set("inputMint", inputMint);
      quoteUrl.searchParams.set("outputMint", outputMint);
      quoteUrl.searchParams.set("amount", String(amount));
      quoteUrl.searchParams.set("slippageBps", String(input.slippageBps ?? 100));
      try {
        quoteResponse = await jsonFetch<JupiterQuoteResponse>(quoteUrl.toString(), undefined, { timeoutMs: JUPITER_QUOTE_TIMEOUT_MS });
        apiUrl = candidateApiUrl;
        break;
      } catch (error) {
        lastQuoteError = error;
        if (error instanceof HttpStatusError && error.status < 500) throw error;
      }
    }
    if (!quoteResponse) throw lastQuoteError || new Error("Jupiter quote failed.");

    const estimatedOutput = Number(quoteResponse.outAmount || 0) / 1_000_000;
    const minimumAmountOut = quoteResponse.otherAmountThreshold ? Number(quoteResponse.otherAmountThreshold) / 1_000_000 : null;
    const jupiterImpactRaw = quoteResponse.priceImpactPct;
    const jupiterImpactNumeric = jupiterImpactRaw !== undefined && jupiterImpactRaw !== null && jupiterImpactRaw !== "" ? Number(jupiterImpactRaw) : Number.NaN;
    const jupiterPriceImpactPercent = Number.isFinite(jupiterImpactNumeric) ? Math.max(jupiterImpactNumeric * 100, 0) : Number.NaN;
    const referencePriceImpactPercent = priceImpactFromReferenceOutput({ referenceOutput, estimatedOutput });
    const priceImpactPercent = Number.isFinite(referencePriceImpactPercent)
      ? referencePriceImpactPercent
      : Number.isFinite(jupiterPriceImpactPercent)
        ? jupiterPriceImpactPercent
        : 0;

    if (!input.wallet) {
      return {
        route: "jupiter",
        inputMint,
        outputMint,
        inputAmount: input.amount,
        estimatedOutput,
        minimumAmountOut,
        priceImpactPercent,
        transaction: notConfigured(kind, new Error("wallet is required to prepare a Jupiter swap transaction.")),
        quoteResponse,
      };
    }

    const swapResponse = await jsonFetch<{ swapTransaction?: string }>(
      `${apiUrl || jupiterApiUrls()[0]}/swap`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: input.wallet,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      },
      { timeoutMs: JUPITER_SWAP_TIMEOUT_MS },
    );
    if (!swapResponse.swapTransaction) throw new Error("Jupiter swap response did not include a transaction.");

    return {
      route: "jupiter",
      inputMint,
      outputMint,
      inputAmount: input.amount,
      estimatedOutput,
      minimumAmountOut,
      priceImpactPercent,
      transaction: {
        kind,
        status: "ready",
        network: "mainnet-beta",
        feePayer: input.wallet,
        blockhash: "",
        transactionBase64: swapResponse.swapTransaction,
        accounts: { inputMint, outputMint },
        instructions: [],
        requiredSigners: [input.wallet],
      },
      quoteResponse,
    };
  } catch (error) {
    const message = jupiterTradeErrorMessage(error);
    return {
      kind,
      status: "not_configured",
      message,
      instructions: [],
    };
  }
}

export async function prepareMeteoraDbcTradeTransaction(input: {
  wallet?: string;
  side: "buy" | "sell";
  amount: number;
  dbcPool?: string | null;
  slippageBps?: number;
}): Promise<MeteoraDbcTradeQuoteResult | { kind: string; status: "not_configured"; message: string; instructions: unknown[] }> {
  const kind = "trade";

  try {
    if (!input.dbcPool) throw new Error("dbcPool is required for Meteora DBC trading.");
    const config = requireProgramConfig(process.env);
    const quoteOnly = await quoteMeteoraDbcTrade({
      rpcUrl: config.rpcUrl,
      pool: input.dbcPool,
      side: input.side,
      amount: input.amount,
      slippageBps: input.slippageBps,
    });
    const transaction = input.wallet
      ? (
          await prepareMeteoraDbcTrade({
            rpcUrl: config.rpcUrl,
            pool: input.dbcPool,
            wallet: input.wallet,
            side: input.side,
            amount: input.amount,
            recentBlockhash: (await latestBlockhash(config)).blockhash,
            slippageBps: input.slippageBps,
          })
        ).transaction
      : (notConfigured(kind, new Error("wallet is required to prepare a Meteora DBC swap transaction.")) as NotConfiguredTransaction);

    return {
      route: "meteora-dbc",
      inputMint: quoteOnly.inputMint,
      outputMint: quoteOnly.outputMint,
      inputAmount: quoteOnly.inputAmount,
      requestedInputAmount: quoteOnly.requestedInputAmount,
      partialFill: quoteOnly.partialFill,
      willGraduate: quoteOnly.willGraduate,
      estimatedOutput: quoteOnly.estimatedOutput,
      minimumAmountOut: quoteOnly.minimumAmountOut,
      priceImpactPercent: quoteOnly.priceImpactPercent,
      currentPrice: quoteOnly.currentPrice,
      market: {
        dbcPool: quoteOnly.dbcPool,
        tokenMint: quoteOnly.baseMint,
        quoteMint: quoteOnly.quoteMint,
        baseReserve: quoteOnly.baseReserve,
        quoteReserve: quoteOnly.quoteReserve,
        liquidityUsd: quoteOnly.liquidityUsd,
        poolProgressPercent: quoteOnly.poolProgressPercent,
      },
      transaction,
    };
  } catch (error) {
    return notConfigured(kind, new Error(meteoraDbcTradeErrorMessage({ side: input.side, error }))) as NotConfiguredTransaction;
  }
}

export async function prepareMeteoraDammV2TradeTransaction(input: {
  wallet?: string;
  side: "buy" | "sell";
  amount: number;
  dammPool?: string | null;
  tokenMint?: string | null;
  quoteMint?: string | null;
  slippageBps?: number;
  referencePrice?: number | null;
}): Promise<MeteoraDammV2TradeQuoteResult | NotConfiguredTransaction> {
  const kind = "trade";

  try {
    if (!input.dammPool) throw new Error("dammPool is required for Meteora DAMM v2 trading.");
    if (!input.tokenMint) throw new Error("tokenMint is required for Meteora DAMM v2 trading.");
    const config = requireProgramConfig(process.env);
    const quoteOnly = await quoteMeteoraDammV2Trade({
      rpcUrl: config.rpcUrl,
      dammPool: input.dammPool,
      baseMint: input.tokenMint,
      quoteMint: input.quoteMint || process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT,
      side: input.side,
      amount: input.amount,
      slippageBps: input.slippageBps,
      referencePrice: input.referencePrice,
    });
    const transaction = input.wallet
      ? (
          await prepareMeteoraDammV2Trade({
            rpcUrl: config.rpcUrl,
            dammPool: input.dammPool,
            baseMint: input.tokenMint,
            quoteMint: input.quoteMint || process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT,
            wallet: input.wallet,
            side: input.side,
            amount: input.amount,
            recentBlockhash: (await latestBlockhash(config)).blockhash,
            slippageBps: input.slippageBps,
            referencePrice: input.referencePrice,
          })
        ).transaction
      : (notConfigured(kind, new Error("wallet is required to prepare a Meteora DAMM v2 swap transaction.")) as NotConfiguredTransaction);

    return {
      route: "meteora-damm-v2",
      inputMint: quoteOnly.inputMint,
      outputMint: quoteOnly.outputMint,
      inputAmount: quoteOnly.inputAmount,
      estimatedOutput: quoteOnly.estimatedOutput,
      minimumAmountOut: quoteOnly.minimumAmountOut,
      priceImpactPercent: quoteOnly.priceImpactPercent,
      currentPrice: quoteOnly.currentPrice,
      market: {
        dammPool: quoteOnly.dammPool,
        tokenMint: quoteOnly.baseMint,
        quoteMint: quoteOnly.quoteMint,
      },
      transaction,
    };
  } catch (error) {
    return notConfigured(kind, error) as NotConfiguredTransaction;
  }
}

export async function prepareMissionMarketGraduationTransaction(input: {
  wallet?: string;
  dbcPool?: string | null;
}): Promise<MissionMarketGraduationResult | NotConfiguredTransaction> {
  const kind = "mission-market-graduation";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare market graduation.");
    if (!input.dbcPool) throw new Error("dbcPool is required to prepare market graduation.");
    const config = requireProgramConfig(process.env);
    const migration = await prepareMeteoraDbcDammV2Migration({
      rpcUrl: config.rpcUrl,
      pool: input.dbcPool,
      wallet: input.wallet,
      recentBlockhash: (await latestBlockhash(config)).blockhash,
    });

    return {
      route: migration.route,
      dbcPool: migration.dbcPool,
      dammPool: migration.dammPool,
      dammConfig: migration.dammConfig,
      baseMint: migration.baseMint,
      quoteMint: migration.quoteMint,
      alreadyMigrated: migration.alreadyMigrated,
      transaction: migration.transaction,
    };
  } catch (error) {
    return notConfigured(kind, error) as NotConfiguredTransaction;
  }
}

export async function fetchMeteoraDbcMissionSnapshot(input: {
  dbcPool?: string | null;
  tokenMint?: string | null;
  treasuryVault?: string | null;
  treasurySupplyPercent?: number | null;
  totalSupply?: number;
}): Promise<MeteoraDbcMarketSnapshot | null> {
  if (!input.dbcPool) return null;
  const config = requireProgramConfig(process.env);
  return fetchMeteoraDbcMarketSnapshot({
    rpcUrl: config.rpcUrl,
    pool: input.dbcPool,
    tokenMint: input.tokenMint,
    treasuryVault: input.treasuryVault,
    treasurySupplyPercent: input.treasurySupplyPercent,
    totalSupply: input.totalSupply,
  });
}

export async function prepareMissionTreasuryAllocationClaimTransaction(input: {
  wallet?: string;
  dbcPool?: string | null;
}): Promise<MissionTreasuryAllocationClaimResult | NotConfiguredTransaction> {
  const kind = "mission-treasury-allocation-claim";

  try {
    if (!input.wallet) throw new Error("wallet is required to claim the treasury allocation.");
    if (!input.dbcPool) throw new Error("dbcPool is required to claim the treasury allocation.");
    const config = requireProgramConfig(process.env);
    const claim = await prepareMeteoraDbcTreasuryAllocationClaim({
      rpcUrl: config.rpcUrl,
      pool: input.dbcPool,
      wallet: input.wallet,
      recentBlockhash: (await latestBlockhash(config)).blockhash,
    });

    return {
      route: claim.route,
      dbcPool: claim.dbcPool,
      tokenMint: claim.tokenMint,
      treasuryVault: claim.treasuryVault,
      alreadyWithdrawn: claim.alreadyWithdrawn,
      transaction: claim.transaction,
    };
  } catch (error) {
    return notConfigured(kind, error) as NotConfiguredTransaction;
  }
}

export async function fetchMeteoraDammV2MissionSnapshot(input: {
  dammPool?: string | null;
  tokenMint?: string | null;
  treasuryVault?: string | null;
  treasurySupplyPercent?: number | null;
  totalSupply?: number;
  fallbackPrice?: number | null;
}): Promise<MeteoraDammV2MarketSnapshot | null> {
  if (!input.dammPool || !input.tokenMint) return null;
  const config = requireProgramConfig(process.env);
  return fetchMeteoraDammV2MarketSnapshot({
    rpcUrl: config.rpcUrl,
    dammPool: input.dammPool,
    tokenMint: input.tokenMint,
    treasuryVault: input.treasuryVault,
    treasurySupplyPercent: input.treasurySupplyPercent,
    totalSupply: input.totalSupply,
    fallbackPrice: input.fallbackPrice,
  });
}

export async function prepareFundingRequestTransaction(input: {
  requesterWallet?: string;
  missionId: string;
  requestId: string;
  metadataHash: string;
  recipientWallet?: string;
  tokenAmount: number;
  epoch?: number;
  tokenMint?: string | null;
}) {
  const kind = "funding-request-create";

  try {
    if (!input.requesterWallet) throw new Error("requesterWallet is required to prepare a funding request transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const request = requestPda(config.councilProgramId, mission, input.metadataHash);
    const epochCouncil = epochCouncilPda(config.councilProgramId, mission, input.epoch ?? 1);
    const recipient = input.recipientWallet || input.requesterWallet;
    const requesterPubkey = new PublicKey(input.requesterWallet);
    const recipientPubkey = new PublicKey(recipient);
    const instructions: TransactionInstruction[] = [
      createFundingRequestInstruction({
        programId: config.councilProgramId,
        requester: input.requesterWallet,
        mission,
        epochCouncil,
        request,
        metadataHash: input.metadataHash,
        recipient,
        tokenAmount: input.tokenAmount,
      }),
    ];
    const accounts: Record<string, string> = { mission, epochCouncil, request };

    // Pre-create the recipient token account. Vote escrow vaults are now per mission/member,
    // so the voter creates their shared escrow ATA idempotently when they vote.
    if (input.tokenMint) {
      const mintPubkey = new PublicKey(input.tokenMint);
      const recipientTokenAccount = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, TOKEN_2022_PROGRAM_ID);
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          requesterPubkey,
          recipientTokenAccount,
          recipientPubkey,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
      accounts.recipientTokenAccount = recipientTokenAccount.toBase58();
    }

    return buildPreparedTransaction({
      kind,
      feePayer: input.requesterWallet,
      recentBlockhash: blockhash.blockhash,
      instructions,
      requiredSigners: [input.requesterWallet],
      accounts,
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareCouncilVoteTransaction(input: {
  wallet?: string;
  missionId: string;
  requestId: string;
  vote: "approve" | "reject";
  requestAccount?: string | null;
  mint?: string | null;
  epoch?: number;
}) {
  const kind = "funding-request-vote";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare a vote transaction.");
    if (!input.requestAccount) throw new Error("This funding request has not been recorded on-chain yet. Try again in a moment.");
    if (!input.mint) throw new Error("Mission token mint is unavailable. Refresh the mission and try again.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const epochCouncil = epochCouncilPda(config.councilProgramId, mission, input.epoch ?? 1);
    const voterPubkey = new PublicKey(input.wallet);
    const mintPubkey = new PublicKey(input.mint);
    const voteEscrowPosition = voteEscrowPositionPda(config.councilProgramId, mission, input.wallet);
    const voteEscrowAuthority = voteEscrowAuthorityPda(config.councilProgramId, mission, input.wallet);
    const voteEscrowVault = getAssociatedTokenAddressSync(mintPubkey, new PublicKey(voteEscrowAuthority), true, TOKEN_2022_PROGRAM_ID);
    const voterTokenAccount = getAssociatedTokenAddressSync(mintPubkey, voterPubkey, false, TOKEN_2022_PROGRAM_ID);
    const vote = votePda(config.councilProgramId, input.requestAccount, input.wallet);

    const instructions: TransactionInstruction[] = [
      // Idempotent ATA creates protect against the unlikely cases where the funding request was created before the
      // pre-creation logic existed, or where a voter's ATA was closed for some reason.
      createAssociatedTokenAccountIdempotentInstruction(voterPubkey, voterTokenAccount, voterPubkey, mintPubkey, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(voterPubkey, voteEscrowVault, new PublicKey(voteEscrowAuthority), mintPubkey, TOKEN_2022_PROGRAM_ID),
      voteInstruction({
        programId: config.councilProgramId,
        voter: input.wallet,
        epochCouncil,
        request: input.requestAccount,
        vote,
        voteEscrowPosition,
        voterTokenAccount: voterTokenAccount.toBase58(),
        voteEscrowAuthority,
        voteEscrowVault: voteEscrowVault.toBase58(),
        mint: input.mint,
        approve: input.vote === "approve",
      }),
    ];

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions,
      requiredSigners: [input.wallet],
      accounts: {
        request: input.requestAccount,
        epochCouncil,
        vote,
        voteEscrowPosition,
        voterTokenAccount: voterTokenAccount.toBase58(),
        voteEscrowAuthority,
        voteEscrowVault: voteEscrowVault.toBase58(),
        mint: input.mint,
      },
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareCouncilExecuteTransaction(input: {
  wallet?: string;
  missionId: string;
  requestId: string;
  requestAccount?: string | null;
  treasuryVault?: string | null;
  recipientWallet?: string | null;
  mint?: string | null;
}) {
  const kind = "funding-request-execute";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare an execution transaction.");
    if (!input.requestAccount) throw new Error("This funding request has not been recorded on-chain yet.");
    if (!input.treasuryVault) throw new Error("Mission treasury vault is unavailable. Refresh the mission and try again.");
    if (!input.recipientWallet) throw new Error("Funding request recipient wallet is missing.");
    if (!input.mint) throw new Error("Mission token mint is unavailable. Refresh the mission and try again.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const treasuryAuthority = treasuryAuthorityPda(config.councilProgramId, mission);
    const executorPubkey = new PublicKey(input.wallet);
    const recipientPubkey = new PublicKey(input.recipientWallet);
    const mintPubkey = new PublicKey(input.mint);
    const recipientTokenAccount = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, TOKEN_2022_PROGRAM_ID);

    const instructions: TransactionInstruction[] = [
      // Make sure the recipient ATA exists. Free if it does, ~0.002 SOL if it doesn't.
      createAssociatedTokenAccountIdempotentInstruction(executorPubkey, recipientTokenAccount, recipientPubkey, mintPubkey, TOKEN_2022_PROGRAM_ID),
      executeFundingRequestInstruction({
        programId: config.councilProgramId,
        executor: input.wallet,
        request: input.requestAccount,
        treasuryAuthority,
        treasuryVault: input.treasuryVault,
        recipientTokenAccount: recipientTokenAccount.toBase58(),
        mint: input.mint,
      }),
    ];

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions,
      requiredSigners: [input.wallet],
      accounts: {
        request: input.requestAccount,
        treasuryAuthority,
        treasuryVault: input.treasuryVault,
        recipientTokenAccount: recipientTokenAccount.toBase58(),
        mint: input.mint,
      },
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareCandidateRegistrationTransaction(input: { wallet?: string; missionId: string }) {
  const kind = "council-candidate-register";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare candidate registration.");
    const config = requireProgramConfig(process.env);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const candidate = candidatePda(config.councilProgramId, mission, input.wallet);
    const connection = new Connection(config.rpcUrl, "confirmed");
    const existingCandidate = await connection.getAccountInfo(new PublicKey(candidate));

    if (existingCandidate) {
      return {
        kind,
        status: "not_configured" as const,
        message: "This wallet is already registered as a council candidate for this mission.",
        instructions: [],
      };
    }

    const blockhash = await latestBlockhash(config);
    const instruction = registerCandidateInstruction({
      programId: config.councilProgramId,
      owner: input.wallet,
      mission,
      candidate,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.wallet],
      accounts: {
        mission,
        candidate,
      },
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareFinalizeEpochCouncilTransaction(input: {
  authorityWallet?: string;
  missionId: string;
  epoch: number;
  members: string[];
  escrowAmounts: number[];
}) {
  const kind = "council-checkpoint";

  try {
    if (!input.authorityWallet) throw new Error("authorityWallet is required to prepare council checkpoint finalization.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const epochCouncil = epochCouncilPda(config.councilProgramId, mission, input.epoch);
    const instruction = finalizeEpochCouncilInstruction({
      programId: config.councilProgramId,
      authority: input.authorityWallet,
      mission,
      epochCouncil,
      epoch: input.epoch,
      members: input.members,
      escrowAmounts: input.escrowAmounts,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.authorityWallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.authorityWallet],
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function submitFinalizeEpochCouncilTransaction(input: {
  missionId: string;
  epoch: number;
  members: string[];
  escrowAmounts: number[];
}) {
  if (!process.env.SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR) return null;
  if (input.members.length !== 6) throw new Error("Automatic council finalization requires exactly 6 members.");
  if (input.escrowAmounts.length !== 6) throw new Error("Automatic council finalization requires exactly 6 escrow amounts.");

  const config = requireProgramConfig(process.env);
  const authority = keypairFromEnv("SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR");
  assertConfiguredCouncilAuthority(authority.publicKey);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const blockhash = await connection.getLatestBlockhash();
  const mission = missionPda(config.registryProgramId, input.missionId);
  const epochCouncil = epochCouncilPda(config.councilProgramId, mission, input.epoch);
  const instruction = finalizeEpochCouncilInstruction({
    programId: config.councilProgramId,
    authority: authority.publicKey.toBase58(),
    mission,
    epochCouncil,
    epoch: input.epoch,
    members: input.members,
    escrowAmounts: input.escrowAmounts,
  });
  const message = new TransactionMessage({
    payerKey: authority.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [instruction],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([authority]);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");

  return {
    signature,
    authorityWallet: authority.publicKey.toBase58(),
    mission,
    epochCouncil,
  };
}

export async function submitReleaseVoteEscrowTransaction(input: {
  missionId: string;
  voter: string;
  mint: string;
}) {
  const config = requireProgramConfig(process.env);
  const payer = keypairFromEnv("SINGULARITY_COUNCIL_AUTHORITY_KEYPAIR", "backend vote escrow release");
  const connection = new Connection(config.rpcUrl, "confirmed");
  const blockhash = await connection.getLatestBlockhash();
  const mission = missionPda(config.registryProgramId, input.missionId);
  const voteEscrowPosition = voteEscrowPositionPda(config.councilProgramId, mission, input.voter);
  const voteEscrowAuthority = voteEscrowAuthorityPda(config.councilProgramId, mission, input.voter);
  const voteEscrowVault = getAssociatedTokenAddressSync(new PublicKey(input.mint), new PublicKey(voteEscrowAuthority), true, TOKEN_2022_PROGRAM_ID);
  const voterTokenAccount = getAssociatedTokenAddressSync(new PublicKey(input.mint), new PublicKey(input.voter), false, TOKEN_2022_PROGRAM_ID);
  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, voterTokenAccount, new PublicKey(input.voter), new PublicKey(input.mint), TOKEN_2022_PROGRAM_ID),
    releaseVoteEscrowInstruction({
      programId: config.councilProgramId,
      payer: payer.publicKey.toBase58(),
      voteEscrowPosition,
      voteEscrowAuthority,
      voteEscrowVault: voteEscrowVault.toBase58(),
      voter: input.voter,
      voterTokenAccount: voterTokenAccount.toBase58(),
      mint: input.mint,
    }),
  ];
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer]);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");

  return {
    signature,
    payer: payer.publicKey.toBase58(),
    voteEscrowPosition,
    voteEscrowAuthority,
    voteEscrowVault: voteEscrowVault.toBase58(),
    voterTokenAccount: voterTokenAccount.toBase58(),
  };
}

export async function prepareMissionGraduationTransaction(input: {
  authorityWallet?: string;
  missionId: string;
  dammPool?: string;
}) {
  const kind = "mission-graduation";

  try {
    if (!input.authorityWallet) throw new Error("authorityWallet is required to prepare mission graduation.");
    if (!input.dammPool) throw new Error("dammPool is required to prepare mission graduation.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const instruction = registryMarkGraduatedInstruction({
      programId: config.registryProgramId,
      authority: input.authorityWallet,
      mission,
      dammPool: input.dammPool,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.authorityWallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.authorityWallet],
      accounts: {
        mission,
        dammPool: input.dammPool,
      },
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareClaimMissionFeesTransaction(input: {
  wallet?: string;
  missionId: string;
  creatorWallet?: string | null;
  tokenMint?: string | null;
  dbcPool?: string | null;
  treasuryVault?: string | null;
}) {
  const kind = "mission-fee-claim";

  try {
    if (!input.wallet) throw new Error("wallet is required to claim mission fees.");
    if (!input.creatorWallet) throw new Error("creatorWallet is required to claim mission fees.");
    if (!input.tokenMint) throw new Error("tokenMint is required to claim mission fees.");
    if (!input.dbcPool) throw new Error("dbcPool is required to claim mission fees.");
    if (!input.treasuryVault) throw new Error("treasuryVault is required to claim mission fees.");

    const platformWallet = process.env.SINGULARITY_PLATFORM_FEE_RECIPIENT;
    if (!platformWallet) throw new Error("SINGULARITY_PLATFORM_FEE_RECIPIENT is required to claim mission fees.");

    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const feeRouterAuthority = feeRouterAuthorityPda(config.councilProgramId, mission);
    const treasuryAuthority = treasuryAuthorityPda(config.councilProgramId, mission);
    const mint = new PublicKey(input.tokenMint);
    const payer = new PublicKey(input.wallet);
    const creator = new PublicKey(input.creatorWallet);
    const platform = new PublicKey(platformWallet);
    const routerVault = getAssociatedTokenAddressSync(mint, new PublicKey(feeRouterAuthority), true, TOKEN_2022_PROGRAM_ID);
    const creatorFeeAccount = getAssociatedTokenAddressSync(mint, creator, true, TOKEN_2022_PROGRAM_ID);
    const platformFeeAccount = getAssociatedTokenAddressSync(mint, platform, true, TOKEN_2022_PROGRAM_ID);
    const treasuryFeeAccount = new PublicKey(input.treasuryVault);
    const claimInstruction = await meteoraDbcPartnerFeeClaimInstruction({
      rpcUrl: config.rpcUrl,
      pool: input.dbcPool,
      feeClaimer: feeRouterAuthority,
      payer: input.wallet,
      receiver: feeRouterAuthority,
      maxBaseAmount: 9_000_000_000_000_000n,
      maxQuoteAmount: 0n,
    });
    const claimData = Buffer.concat([anchorDiscriminator("claim_dbc_fees_and_route"), bytesVecBuffer(claimInstruction.data)]);
    const claimAccounts = claimInstruction.keys.map((account) => ({
      pubkey: account.pubkey,
      isSigner: false,
      isWritable: account.isWritable,
    }));
    const routeInstruction = new TransactionInstruction({
      programId: new PublicKey(config.councilProgramId),
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(mission), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(feeRouterAuthority), isSigner: false, isWritable: false },
        { pubkey: routerVault, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(treasuryAuthority), isSigner: false, isWritable: false },
        { pubkey: treasuryFeeAccount, isSigner: false, isWritable: true },
        { pubkey: creator, isSigner: false, isWritable: false },
        { pubkey: creatorFeeAccount, isSigner: false, isWritable: true },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: platformFeeAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: claimInstruction.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ...claimAccounts,
      ],
      data: claimData,
    });
    const setupInstructions = [
      createAssociatedTokenAccountIdempotentInstruction(payer, routerVault, new PublicKey(feeRouterAuthority), mint, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer, treasuryFeeAccount, new PublicKey(treasuryAuthority), mint, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer, creatorFeeAccount, creator, mint, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer, platformFeeAccount, platform, mint, TOKEN_2022_PROGRAM_ID),
    ];

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [...setupInstructions, routeInstruction],
      requiredSigners: [input.wallet],
      accounts: {
        mission,
        dbcPool: input.dbcPool,
        tokenMint: input.tokenMint,
        feeRouterAuthority,
        routerVault: routerVault.toBase58(),
        treasuryVault: treasuryFeeAccount.toBase58(),
        creatorFeeAccount: creatorFeeAccount.toBase58(),
        platformFeeAccount: platformFeeAccount.toBase58(),
      },
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

async function tokenAccountBalance(connection: Connection, account: PublicKey, programId = TOKEN_2022_PROGRAM_ID) {
  try {
    return (await getAccount(connection, account, "confirmed", programId)).amount;
  } catch {
    return 0n;
  }
}

export async function submitBackendMissionFeeDistribution(input: {
  missionId: string;
  creatorWallet: string;
  dbcPool: string;
}) {
  const config = requireProgramConfig(process.env);
  const distributor = feeDistributorKeypair();
  const platformWallet = process.env.SINGULARITY_PLATFORM_FEE_RECIPIENT?.trim();
  if (!platformWallet) throw new Error("SINGULARITY_PLATFORM_FEE_RECIPIENT is required for backend mission fee distribution.");

  const connection = new Connection(config.rpcUrl, "confirmed");
  const quoteMint = new PublicKey(process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT);
  const creator = new PublicKey(input.creatorWallet);
  const platform = new PublicKey(platformWallet);
  const distributorTokenAccount = getAssociatedTokenAddressSync(quoteMint, distributor.publicKey, false, TOKEN_PROGRAM_ID);
  const beforeBalance = await tokenAccountBalance(connection, distributorTokenAccount, TOKEN_PROGRAM_ID);

  const claimInstructions = await meteoraDbcPartnerFeeClaimInstructions({
    rpcUrl: config.rpcUrl,
    pool: input.dbcPool,
    feeClaimer: distributor.publicKey.toBase58(),
    payer: distributor.publicKey.toBase58(),
    receiver: distributor.publicKey.toBase58(),
    maxBaseAmount: 0n,
    maxQuoteAmount: 9_000_000_000_000_000n,
  });

  const claimTransaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(distributor.publicKey, distributorTokenAccount, distributor.publicKey, quoteMint, TOKEN_PROGRAM_ID),
    ...claimInstructions,
  );
  const claimSignature = await sendAndConfirmTransaction(connection, claimTransaction, [distributor], { commitment: "confirmed" });
  const afterBalance = await tokenAccountBalance(connection, distributorTokenAccount, TOKEN_PROGRAM_ID);
  const distributableAmount = afterBalance > beforeBalance ? afterBalance - beforeBalance : 0n;

  if (distributableAmount <= 0n) {
    return {
      status: "no_fees" as const,
      missionId: input.missionId,
      claimSignature,
      distributedAmount: "0",
    };
  }

  const distribution = await distributeBackendUsdcFees({
    connection,
    distributor,
    quoteMint,
    creator,
    platform,
    amount: distributableAmount,
  });

  return {
    status: "distributed" as const,
    missionId: input.missionId,
    claimSignature,
    distributionSignature: distribution.distributionSignature,
    distributedAmount: distributableAmount.toString(),
    creatorAmount: distribution.creatorAmount.toString(),
    platformAmount: distribution.platformAmount.toString(),
  };
}

async function distributeBackendUsdcFees(input: {
  connection: Connection;
  distributor: Keypair;
  quoteMint: PublicKey;
  creator: PublicKey;
  platform: PublicKey;
  amount: bigint;
}) {
  const quoteMintInfo = await getMint(input.connection, input.quoteMint, "confirmed", TOKEN_PROGRAM_ID);
  const distributorTokenAccount = getAssociatedTokenAddressSync(input.quoteMint, input.distributor.publicKey, false, TOKEN_PROGRAM_ID);
  const creatorTokenAccount = getAssociatedTokenAddressSync(input.quoteMint, input.creator, true, TOKEN_PROGRAM_ID);
  const platformTokenAccount = getAssociatedTokenAddressSync(input.quoteMint, input.platform, true, TOKEN_PROGRAM_ID);
  const creatorAmount = input.amount / 2n;
  const platformAmount = input.amount - creatorAmount;
  const distributionTransaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(input.distributor.publicKey, creatorTokenAccount, input.creator, input.quoteMint, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(input.distributor.publicKey, platformTokenAccount, input.platform, input.quoteMint, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(
      distributorTokenAccount,
      input.quoteMint,
      creatorTokenAccount,
      input.distributor.publicKey,
      creatorAmount,
      quoteMintInfo.decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      distributorTokenAccount,
      input.quoteMint,
      platformTokenAccount,
      input.distributor.publicKey,
      platformAmount,
      quoteMintInfo.decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  const distributionSignature = await sendAndConfirmTransaction(input.connection, distributionTransaction, [input.distributor], { commitment: "confirmed" });
  return {
    distributionSignature,
    creatorAmount,
    platformAmount,
  };
}

export async function submitBackendDammV2FeeDistribution(input: {
  missionId: string;
  creatorWallet: string;
  tokenMint: string;
  dammPool: string;
  positions: MeteoraDammV2FeePosition[];
}) {
  const config = requireProgramConfig(process.env);
  const distributor = feeDistributorKeypair();
  const distributorWallet = distributor.publicKey.toBase58();
  const platformWallet = process.env.SINGULARITY_PLATFORM_FEE_RECIPIENT?.trim();
  if (!platformWallet) throw new Error("SINGULARITY_PLATFORM_FEE_RECIPIENT is required for backend DAMM fee distribution.");

  const ownedPositions = input.positions.filter((position) => position.owner === distributorWallet);
  if (!ownedPositions.length) {
    return {
      status: "no_positions" as const,
      missionId: input.missionId,
      source: "damm-v2" as const,
      distributedAmount: "0",
    };
  }

  const connection = new Connection(config.rpcUrl, "confirmed");
  const quoteMint = new PublicKey(process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT);
  const distributorTokenAccount = getAssociatedTokenAddressSync(quoteMint, distributor.publicKey, false, TOKEN_PROGRAM_ID);
  const beforeBalance = await tokenAccountBalance(connection, distributorTokenAccount, TOKEN_PROGRAM_ID);
  const claimSignatures = [];

  for (const position of ownedPositions) {
    const claim = await prepareMeteoraDammV2PositionFeeClaim({
      rpcUrl: config.rpcUrl,
      dammPool: input.dammPool,
      baseMint: input.tokenMint,
      quoteMint: quoteMint.toBase58(),
      owner: distributorWallet,
      receiver: distributorWallet,
      feePayer: distributorWallet,
      positionNftMint: position.positionNftMint,
    });
    const transaction = new Transaction().add(...claim.instructions);
    const signature = await sendAndConfirmTransaction(connection, transaction, [distributor], { commitment: "confirmed" });
    claimSignatures.push(signature);
  }

  const afterBalance = await tokenAccountBalance(connection, distributorTokenAccount, TOKEN_PROGRAM_ID);
  const distributableAmount = afterBalance > beforeBalance ? afterBalance - beforeBalance : 0n;
  if (distributableAmount <= 0n) {
    return {
      status: "no_fees" as const,
      missionId: input.missionId,
      source: "damm-v2" as const,
      claimSignatures,
      distributedAmount: "0",
    };
  }

  const distribution = await distributeBackendUsdcFees({
    connection,
    distributor,
    quoteMint,
    creator: new PublicKey(input.creatorWallet),
    platform: new PublicKey(platformWallet),
    amount: distributableAmount,
  });

  return {
    status: "distributed" as const,
    missionId: input.missionId,
    source: "damm-v2" as const,
    claimSignatures,
    distributionSignature: distribution.distributionSignature,
    distributedAmount: distributableAmount.toString(),
    creatorAmount: distribution.creatorAmount.toString(),
    platformAmount: distribution.platformAmount.toString(),
  };
}

export async function recoverDammV2FeePositions(input: { signature: string; dammPool: string }) {
  const config = requireProgramConfig(process.env);
  return recoverMeteoraDammV2FeePositions({
    rpcUrl: config.rpcUrl,
    signature: input.signature,
    dammPool: input.dammPool,
  });
}
