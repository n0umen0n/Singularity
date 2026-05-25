import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { requireProgramConfig } from "@singularity/solana";
import { candidateRegistrationPda, missionRegistrationPda } from "@/lib/backend/council-pdas";
import { validateSponsoredTransaction } from "@/lib/backend/gas-sponsorship";

export function launchFeeSponsorshipConfigured() {
  return Boolean(process.env.SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR?.trim());
}

function keypairFromEnvSecret(raw: string) {
  const secret = raw.trim().replace(/^["']|["']$/g, "");
  if (secret.startsWith("[")) {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    } catch {
      throw new Error(
        "SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR looks like a JSON keypair but could not be parsed. Paste the base58 secret instead.",
      );
    }
  }

  try {
    const bytes = bs58.decode(secret);
    if (bytes.length !== 64) {
      throw new Error(
        "SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR must be the full base58 secret key from solana-keygen, not the public address.",
      );
    }
    return Keypair.fromSecretKey(bytes);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR")) {
      throw error;
    }
    throw new Error(
      "SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR must be the base58 secret key from solana-keygen, not the public address or seed phrase.",
    );
  }
}

export function launchFeePayerKeypair() {
  const secret = process.env.SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR?.trim();
  if (!secret) {
    throw new Error("SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR is required to sponsor mission launch fees.");
  }
  return keypairFromEnvSecret(secret);
}

export function launchFeePayerAddress() {
  return launchFeePayerKeypair().publicKey.toBase58();
}

function transactionAccountKeys(transaction: VersionedTransaction) {
  const accountKeys = transaction.message.getAccountKeys();
  const keysInTx = new Set<string>();
  for (const instruction of transaction.message.compiledInstructions) {
    for (const accountIndex of instruction.accountKeyIndexes) {
      const key = accountKeys.get(accountIndex);
      if (key) keysInTx.add(key.toBase58());
    }
  }
  return keysInTx;
}

function assertLaunchAccountsMatch(
  transaction: VersionedTransaction,
  expectedAccounts: Record<string, unknown>,
  stepIndex = 0,
) {
  const keysInTx = transactionAccountKeys(transaction);
  const meteoraConfig = expectedAccounts.meteoraConfig;
  if (typeof meteoraConfig !== "string" || !keysInTx.has(meteoraConfig)) {
    throw new Error("Launch transaction does not match the prepared meteoraConfig account. Refresh and try again.");
  }

  const tokenMint = expectedAccounts.tokenMint;
  const dbcPool = expectedAccounts.dbcPool;
  const isPoolStep = (typeof dbcPool === "string" && keysInTx.has(dbcPool)) || stepIndex > 0;

  if (!isPoolStep) return;

  if (typeof tokenMint === "string" && !keysInTx.has(tokenMint)) {
    throw new Error("Launch transaction does not match the prepared tokenMint account. Refresh and try again.");
  }
  if (typeof dbcPool === "string" && !keysInTx.has(dbcPool)) {
    throw new Error("Launch transaction does not match the prepared dbcPool account. Refresh and try again.");
  }
}

export function validateSponsoredLaunchTransaction(input: {
  transactionBase64: string;
  creatorWallet: string;
  feePayerAddress?: string;
  expectedAccounts?: Record<string, unknown>;
  stepIndex?: number;
}) {
  validateSponsoredTransaction(input.transactionBase64);

  const feePayerAddress = input.feePayerAddress || launchFeePayerAddress();
  const transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
  const accountKeys = transaction.message.getAccountKeys();
  const feePayer = accountKeys.get(0);

  if (!feePayer || feePayer.toBase58() !== feePayerAddress) {
    throw new Error("Launch transaction fee payer does not match the configured sponsor wallet.");
  }

  if (input.expectedAccounts) {
    assertLaunchAccountsMatch(transaction, input.expectedAccounts, input.stepIndex ?? 0);
  }
}

export async function completeSponsoredLaunchTransaction(input: {
  transactionBase64: string;
  creatorWallet: string;
  expectedAccounts?: Record<string, unknown>;
  stepIndex?: number;
}) {
  const config = requireProgramConfig(process.env);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const feePayer = launchFeePayerKeypair();
  const transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));

  validateSponsoredLaunchTransaction({
    transactionBase64: input.transactionBase64,
    creatorWallet: input.creatorWallet,
    feePayerAddress: feePayer.publicKey.toBase58(),
    expectedAccounts: input.expectedAccounts,
    stepIndex: input.stepIndex,
  });

  return submitSponsoredTransaction(connection, transaction, feePayer);
}

export function validateSponsoredCouncilCandidateRegistrationTransaction(input: {
  transactionBase64: string;
  ownerWallet: string;
  missionId: string;
  feePayerAddress?: string;
}) {
  validateSponsoredTransaction(input.transactionBase64);

  const feePayerAddress = input.feePayerAddress || launchFeePayerAddress();
  const config = requireProgramConfig(process.env);
  const transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
  const accountKeys = transaction.message.getAccountKeys();
  const feePayer = accountKeys.get(0);
  const keysInTx = transactionAccountKeys(transaction);

  if (!feePayer || feePayer.toBase58() !== feePayerAddress) {
    throw new Error("Council registration transaction fee payer does not match the configured sponsor wallet.");
  }

  const expectedMission = missionRegistrationPda({
    registryProgramId: config.registryProgramId,
    missionId: input.missionId,
  });
  const expectedCandidate = candidateRegistrationPda({
    councilProgramId: config.councilProgramId,
    registryProgramId: config.registryProgramId,
    missionId: input.missionId,
    owner: input.ownerWallet,
  });

  if (!keysInTx.has(input.ownerWallet)) {
    throw new Error("Council registration transaction does not include the candidate owner wallet.");
  }
  if (!keysInTx.has(expectedMission)) {
    throw new Error("Council registration transaction does not match the prepared mission account.");
  }
  if (!keysInTx.has(expectedCandidate)) {
    throw new Error("Council registration transaction does not match the prepared candidate account.");
  }
}

export async function completeSponsoredCouncilCandidateRegistrationTransaction(input: {
  transactionBase64: string;
  ownerWallet: string;
  missionId: string;
}) {
  const config = requireProgramConfig(process.env);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const feePayer = launchFeePayerKeypair();
  const transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));

  validateSponsoredCouncilCandidateRegistrationTransaction({
    transactionBase64: input.transactionBase64,
    ownerWallet: input.ownerWallet,
    missionId: input.missionId,
    feePayerAddress: feePayer.publicKey.toBase58(),
  });

  return submitSponsoredTransaction(connection, transaction, feePayer);
}

async function submitSponsoredTransaction(connection: Connection, transaction: VersionedTransaction, feePayer: Keypair) {
  transaction.sign([feePayer]);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sponsored transaction submission failed.";
    if (message.toLowerCase().includes("insufficient lamports") || message.toLowerCase().includes("insufficient funds")) {
      throw new Error(
        "The launch fee payer wallet does not have enough SOL to cover this transaction. Fund SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR and try again.",
      );
    }
    throw new Error(message);
  }
  const confirmation = await connection.confirmTransaction(signature, "confirmed");
  if (confirmation.value.err) {
    throw new Error("The sponsored transaction failed on-chain.");
  }

  return signature;
}
