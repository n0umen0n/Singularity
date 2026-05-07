import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import {
  buildPreparedTransaction,
  buildPreparedTransactionSteps,
  councilInstruction,
  DEFAULT_DBC_INITIAL_MARKET_CAP,
  DEFAULT_DBC_MIGRATION_MARKET_CAP,
  DEFAULT_DBC_TOTAL_SUPPLY,
  DEFAULT_DBC_TREASURY_SUPPLY_PERCENT,
  fetchMeteoraDbcMarketSnapshot,
  latestBlockhash,
  meteoraDbcPartnerFeeClaimInstruction,
  prepareMeteoraDbcLaunchInstructions,
  prepareMeteoraDbcTrade,
  quoteMeteoraDbcTrade,
  requireProgramConfig,
  resolveMeteoraDbcLaunchConfig,
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
const DEFAULT_JUPITER_API_URL = "https://quote-api.jup.ag/v6";
type NotConfiguredTransaction = { kind: string; status: "not_configured"; message: string; instructions: unknown[] };

export type JupiterTradeResult = {
  route: "jupiter";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  estimatedOutput: number;
  priceImpactPercent: number;
  transaction: TransactionResult;
  quoteResponse?: unknown;
};

export type MeteoraDbcTradeQuoteResult = {
  route: "meteora-dbc";
  inputMint: string;
  outputMint: string;
  inputAmount: number;
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

function notConfigured(kind: string, error: unknown): TransactionResult {
  const message = error instanceof Error ? error.message : "Solana transaction preparation is not configured.";
  return {
    kind,
    status: "not_configured",
    message,
    instructions: [],
  };
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

function treasuryAuthorityPda(programId: string, mission: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority"), new PublicKey(mission).toBuffer()],
    new PublicKey(programId),
  );

  return address.toBase58();
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

function keypairFromEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for automatic council checkpoint finalization.`);

  const secret = value.startsWith("[")
    ? Uint8Array.from(JSON.parse(value) as number[])
    : bs58.decode(value);
  return Keypair.fromSecretKey(secret);
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

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Request failed (${response.status}): ${body || response.statusText}`);
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
      feeClaimer: feeRouterAuthority,
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
}): Promise<JupiterTradeResult | { kind: string; status: "not_configured"; message: string; instructions: unknown[] }> {
  const kind = "trade";

  try {
    if (!input.tokenMint) throw new Error("tokenMint is required for Jupiter trade routing.");
    const quoteMint = input.quoteMint || process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT;
    const inputMint = input.side === "buy" ? quoteMint : input.tokenMint;
    const outputMint = input.side === "buy" ? input.tokenMint : quoteMint;
    const amount = tokenAmountBaseUnits(input.amount);
    if (amount <= 0) throw new Error("amount must be greater than zero.");

    const apiUrl = (process.env.JUPITER_API_URL || DEFAULT_JUPITER_API_URL).replace(/\/$/, "");
    const quoteUrl = new URL(`${apiUrl}/quote`);
    quoteUrl.searchParams.set("inputMint", inputMint);
    quoteUrl.searchParams.set("outputMint", outputMint);
    quoteUrl.searchParams.set("amount", String(amount));
    quoteUrl.searchParams.set("slippageBps", String(input.slippageBps ?? 100));
    const quoteResponse = await jsonFetch<{
      outAmount?: string;
      priceImpactPct?: string;
    }>(quoteUrl.toString());
    const estimatedOutput = Number(quoteResponse.outAmount || 0) / 1_000_000;
    const priceImpactPercent = Number(quoteResponse.priceImpactPct || 0) * 100;

    if (!input.wallet) {
      return {
        route: "jupiter",
        inputMint,
        outputMint,
        inputAmount: input.amount,
        estimatedOutput,
        priceImpactPercent,
        transaction: notConfigured(kind, new Error("wallet is required to prepare a Jupiter swap transaction.")),
        quoteResponse,
      };
    }

    const swapResponse = await jsonFetch<{ swapTransaction?: string }>(`${apiUrl}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: input.wallet,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });
    if (!swapResponse.swapTransaction) throw new Error("Jupiter swap response did not include a transaction.");

    return {
      route: "jupiter",
      inputMint,
      outputMint,
      inputAmount: input.amount,
      estimatedOutput,
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
    const message = error instanceof Error ? error.message : "Jupiter trade preparation failed.";
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

export async function prepareFundingRequestTransaction(input: {
  requesterWallet?: string;
  missionId: string;
  requestId: string;
  metadataHash: string;
  recipientWallet?: string;
  tokenAmount: number;
  epoch?: number;
}) {
  const kind = "funding-request-create";

  try {
    if (!input.requesterWallet) throw new Error("requesterWallet is required to prepare a funding request transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const request = requestPda(config.councilProgramId, mission, input.metadataHash);
    const epochCouncil = epochCouncilPda(config.councilProgramId, mission, input.epoch ?? 1);
    const instruction = createFundingRequestInstruction({
      programId: config.councilProgramId,
      requester: input.requesterWallet,
      mission,
      epochCouncil,
      request,
      metadataHash: input.metadataHash,
      recipient: input.recipientWallet || input.requesterWallet,
      tokenAmount: input.tokenAmount,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.requesterWallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.requesterWallet],
      accounts: {
        mission,
        epochCouncil,
        request,
      },
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
  requestAccount?: string;
  voterTokenAccount?: string;
  voteEscrowAuthority?: string;
  voteEscrowVault?: string;
  mint?: string;
}) {
  const kind = "funding-request-vote";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare a vote transaction.");
    if (!input.requestAccount) throw new Error("requestAccount is required to prepare a vote transaction.");
    if (!input.voterTokenAccount) throw new Error("voterTokenAccount is required to prepare a vote transaction.");
    if (!input.voteEscrowAuthority) throw new Error("voteEscrowAuthority is required to prepare a vote transaction.");
    if (!input.voteEscrowVault) throw new Error("voteEscrowVault is required to prepare a vote transaction.");
    if (!input.mint) throw new Error("mint is required to prepare a vote transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const instruction = councilInstruction({
      programId: config.councilProgramId,
      opcode: input.vote === "approve" ? 2 : 3,
      payer: input.wallet,
      mission: missionPda(config.registryProgramId, input.missionId),
      request: input.requestAccount,
      extraAccounts: [
        { pubkey: input.voterTokenAccount, isWritable: true },
        { pubkey: input.voteEscrowAuthority },
        { pubkey: input.voteEscrowVault, isWritable: true },
        { pubkey: input.mint },
        { pubkey: TOKEN_2022_PROGRAM_ID.toBase58() },
      ],
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.wallet],
    });
  } catch (error) {
    return notConfigured(kind, error);
  }
}

export async function prepareCouncilExecuteTransaction(input: {
  wallet?: string;
  missionId: string;
  requestId: string;
  requestAccount?: string;
  treasuryVault?: string;
  recipientTokenAccount?: string;
  mint?: string;
}) {
  const kind = "funding-request-execute";

  try {
    if (!input.wallet) throw new Error("wallet is required to prepare an execution transaction.");
    if (!input.requestAccount) throw new Error("requestAccount is required to prepare an execution transaction.");
    if (!input.treasuryVault) throw new Error("treasuryVault is required to prepare an execution transaction.");
    if (!input.recipientTokenAccount) throw new Error("recipientTokenAccount is required to prepare an execution transaction.");
    if (!input.mint) throw new Error("mint is required to prepare an execution transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const mission = missionPda(config.registryProgramId, input.missionId);
    const treasuryAuthority = treasuryAuthorityPda(config.councilProgramId, mission);
    const instruction = councilInstruction({
      programId: config.councilProgramId,
      opcode: 4,
      payer: input.wallet,
      mission,
      request: input.requestAccount,
      extraAccounts: [
        { pubkey: treasuryAuthority },
        { pubkey: input.treasuryVault, isWritable: true },
        { pubkey: input.recipientTokenAccount, isWritable: true },
        { pubkey: input.mint },
        { pubkey: TOKEN_2022_PROGRAM_ID.toBase58() },
      ],
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.wallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.wallet],
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
