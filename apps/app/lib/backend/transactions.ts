import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  buildPreparedTransaction,
  councilInstruction,
  latestBlockhash,
  prepareMeteoraDbcLaunchInstructions,
  requireProgramConfig,
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

function treasuryAuthorityPda(programId: string, mission: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority"), new PublicKey(mission).toBuffer()],
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

export async function prepareLaunchTransaction(input: {
  creatorWallet?: string;
  missionId: string;
  metadataHash: string;
  metadataUri?: string;
  tokenName?: string;
  tokenSymbol?: string;
  totalSupply?: number;
  initialPurchaseUsdc?: number;
}) {
  const kind = "mission-launch";

  try {
    if (!input.creatorWallet) throw new Error("creatorWallet is required to prepare a launch transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const missionAccount = missionPda(config.registryProgramId, input.missionId);
    const treasuryAuthority = treasuryAuthorityPda(config.councilProgramId, missionAccount);
    const totalSupply = input.totalSupply ?? 50_000_000;
    const meteoraLaunch = await prepareMeteoraDbcLaunchInstructions({
      rpcUrl: config.rpcUrl,
      payer: input.creatorWallet,
      poolCreator: input.creatorWallet,
      name: input.tokenName || input.missionId,
      symbol: input.tokenSymbol || "MISSION",
      uri: input.metadataUri || `https://metadata.singularity.diy/${input.metadataHash}.json`,
      quoteMint: process.env.SINGULARITY_USDC_MINT || MAINNET_USDC_MINT,
      feeClaimer: process.env.SINGULARITY_METEORA_FEE_CLAIMER || input.creatorWallet,
      leftoverReceiver: process.env.SINGULARITY_METEORA_LEFTOVER_RECEIVER || treasuryAuthority,
      totalSupply,
      treasurySupplyPercent: 20,
      initialPurchaseUsdc: input.initialPurchaseUsdc,
    });
    const treasuryVault = getAssociatedTokenAddressSync(
      new PublicKey(meteoraLaunch.accounts.tokenMint),
      new PublicKey(treasuryAuthority),
      true,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58();
    const instruction = registryInitializeMissionInstruction({
      programId: config.registryProgramId,
      creator: input.creatorWallet,
      mission: missionAccount,
      slugHash: hashBytes(input.missionId),
      metadataHash: input.metadataHash,
      tokenMint: meteoraLaunch.accounts.tokenMint,
      treasuryVault,
      totalSupply,
      treasuryBps: 2_000,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.creatorWallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [...meteoraLaunch.instructions, instruction],
      requiredSigners: [input.creatorWallet, ...meteoraLaunch.signerKeypairs.map((signer) => signer.publicKey.toBase58())],
      signerKeypairs: meteoraLaunch.signerKeypairs,
      accounts: {
        mission: missionAccount,
        treasuryAuthority,
        treasuryVault,
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

export async function prepareFundingRequestTransaction(input: { requesterWallet?: string; missionId: string; requestId: string; metadataHash: string }) {
  const kind = "funding-request-create";

  try {
    if (!input.requesterWallet) throw new Error("requesterWallet is required to prepare a funding request transaction.");
    const config = requireProgramConfig(process.env);
    const blockhash = await latestBlockhash(config);
    const instruction = councilInstruction({
      programId: config.councilProgramId,
      opcode: 1,
      payer: input.requesterWallet,
      mission: missionPda(config.registryProgramId, input.missionId),
      request: requestPda(config.councilProgramId, missionPda(config.registryProgramId, input.missionId), input.metadataHash),
      metadataHash: input.metadataHash,
    });

    return buildPreparedTransaction({
      kind,
      feePayer: input.requesterWallet,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
      requiredSigners: [input.requesterWallet],
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
    const blockhash = await latestBlockhash(config);
    const instruction = councilInstruction({
      programId: config.councilProgramId,
      opcode: 5,
      payer: input.wallet,
      mission: missionPda(config.registryProgramId, input.missionId),
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
