import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { requireProgramConfig } from "@singularity/solana";
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

function assertLaunchAccountsMatch(transaction: VersionedTransaction, expectedAccounts: Record<string, unknown>) {
  const accountKeys = transaction.message.getAccountKeys();
  const requiredKeys = ["meteoraConfig", "tokenMint", "dbcPool"] as const;

  for (const key of requiredKeys) {
    const expectedAddress = expectedAccounts[key];
    if (typeof expectedAddress !== "string" || !expectedAddress.trim()) continue;

    let found = false;
    for (const instruction of transaction.message.compiledInstructions) {
      for (const accountIndex of instruction.accountKeyIndexes) {
        if (accountKeys.get(accountIndex)?.toBase58() === expectedAddress) {
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      throw new Error(`Launch transaction does not match the prepared ${key} account. Refresh and try again.`);
    }
  }
}

export function validateSponsoredLaunchTransaction(input: {
  transactionBase64: string;
  creatorWallet: string;
  feePayerAddress?: string;
  expectedAccounts?: Record<string, unknown>;
}) {
  validateSponsoredTransaction(input.transactionBase64);

  const feePayerAddress = input.feePayerAddress || launchFeePayerAddress();
  const transaction = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
  const accountKeys = transaction.message.getAccountKeys();
  const feePayer = accountKeys.get(0);

  if (!feePayer || feePayer.toBase58() !== feePayerAddress) {
    throw new Error("Launch transaction fee payer does not match the configured sponsor wallet.");
  }

  const requiredSignerCount = transaction.message.header.numRequiredSignatures;
  const requiredSigners = new Set<string>();
  for (let index = 0; index < requiredSignerCount; index += 1) {
    const signer = accountKeys.get(index);
    if (signer) requiredSigners.add(signer.toBase58());
  }

  if (!requiredSigners.has(input.creatorWallet)) {
    let referencesCreator = false;
    for (const instruction of transaction.message.compiledInstructions) {
      for (const accountIndex of instruction.accountKeyIndexes) {
        if (accountKeys.get(accountIndex)?.toBase58() === input.creatorWallet) {
          referencesCreator = true;
          break;
        }
      }
      if (referencesCreator) break;
    }
    if (!referencesCreator) {
      throw new Error("Launch transaction must reference the creator wallet.");
    }
  }

  if (input.expectedAccounts) {
    assertLaunchAccountsMatch(transaction, input.expectedAccounts);
  }
}

export async function completeSponsoredLaunchTransaction(input: {
  transactionBase64: string;
  creatorWallet: string;
  expectedAccounts?: Record<string, unknown>;
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
  });

  transaction.sign([feePayer]);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Launch transaction submission failed.";
    if (message.toLowerCase().includes("insufficient lamports") || message.toLowerCase().includes("insufficient funds")) {
      throw new Error(
        "The launch fee payer wallet does not have enough SOL to cover this mission launch. Fund SINGULARITY_LAUNCH_FEE_PAYER_KEYPAIR and try again.",
      );
    }
    throw new Error(message);
  }
  const confirmation = await connection.confirmTransaction(signature, "confirmed");
  if (confirmation.value.err) {
    throw new Error("The sponsored mission launch transaction failed on-chain.");
  }

  return signature;
}
