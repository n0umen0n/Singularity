import { VersionedTransaction } from "@solana/web3.js";
import { DEFAULT_COUNCIL_PROGRAM_ID, DEFAULT_REGISTRY_PROGRAM_ID } from "@singularity/solana";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
const MEMO_PROGRAM_ID = "Memo111111111111111111111111111111111111111111";
const DEFAULT_METEORA_DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const METAPLEX_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const METEORA_VAULT_PROGRAM_ID = "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi";

const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);
const CLOSE_ACCOUNT_DISCRIMINATOR = 9;

type UsageBucket = {
  count: number;
  dayKey: string;
};

const usageByWallet = new Map<string, UsageBucket>();

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dailyLimit() {
  const configured = Number(process.env.SINGULARITY_GAS_SPONSOR_DAILY_LIMIT || "50");
  if (!Number.isFinite(configured) || configured <= 0) return 50;
  return Math.floor(configured);
}

function configuredProgramAllowlist() {
  const configured = process.env.SINGULARITY_GAS_SPONSOR_PROGRAM_IDS?.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (configured?.length) return new Set(configured);
  return new Set([
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    COMPUTE_BUDGET_PROGRAM_ID,
    MEMO_PROGRAM_ID,
    process.env.SINGULARITY_REGISTRY_PROGRAM_ID || DEFAULT_REGISTRY_PROGRAM_ID,
    process.env.SINGULARITY_COUNCIL_PROGRAM_ID || DEFAULT_COUNCIL_PROGRAM_ID,
    process.env.SINGULARITY_METEORA_DBC_PROGRAM_ID || DEFAULT_METEORA_DBC_PROGRAM_ID,
    METAPLEX_TOKEN_METADATA_PROGRAM_ID,
    METEORA_VAULT_PROGRAM_ID,
  ]);
}

export function programIdsFromTransactionBase64(transactionBase64: string) {
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));
  const accountKeys = transaction.message.getAccountKeys();
  const programIds = new Set<string>();

  for (const instruction of transaction.message.compiledInstructions) {
    const programId = accountKeys.get(instruction.programIdIndex);
    if (programId) programIds.add(programId.toBase58());
  }

  return [...programIds];
}

function hasCloseAccountInstruction(transactionBase64: string) {
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));
  const accountKeys = transaction.message.getAccountKeys();

  for (const instruction of transaction.message.compiledInstructions) {
    const programId = accountKeys.get(instruction.programIdIndex);
    if (!programId || !TOKEN_PROGRAM_IDS.has(programId.toBase58())) continue;
    if (instruction.data.length > 0 && instruction.data[0] === CLOSE_ACCOUNT_DISCRIMINATOR) return true;
  }

  return false;
}

export function validateSponsoredTransaction(transactionBase64: string) {
  if (!transactionBase64.trim()) throw new Error("transactionBase64 is required.");

  const allowlist = configuredProgramAllowlist();
  const programIds = programIdsFromTransactionBase64(transactionBase64);
  const disallowed = programIds.filter((programId) => !allowlist.has(programId));
  if (disallowed.length) {
    throw new Error("This transaction includes programs that are not eligible for gas sponsorship.");
  }

  if (hasCloseAccountInstruction(transactionBase64)) {
    throw new Error("This transaction is not eligible for gas sponsorship because it closes token accounts.");
  }
}

function currentUsage(walletAddress: string) {
  const dayKey = utcDayKey();
  const existing = usageByWallet.get(walletAddress);
  if (!existing || existing.dayKey !== dayKey) {
    const bucket = { count: 0, dayKey };
    usageByWallet.set(walletAddress, bucket);
    return bucket;
  }
  return existing;
}

export function gasSponsorshipUsageSnapshot(walletAddress: string) {
  const bucket = currentUsage(walletAddress);
  const limit = dailyLimit();
  return {
    used: bucket.count,
    remaining: Math.max(limit - bucket.count, 0),
    limit,
    dayKey: bucket.dayKey,
  };
}

export function assertGasSponsorshipAvailable(walletAddress: string) {
  const snapshot = gasSponsorshipUsageSnapshot(walletAddress);
  if (snapshot.remaining <= 0) {
    throw new Error("Daily gas sponsorship limit reached for this wallet. Try again tomorrow or pay gas with SOL.");
  }
  return snapshot;
}

export function recordGasSponsorshipUsage(walletAddress: string) {
  const bucket = currentUsage(walletAddress);
  bucket.count += 1;
  usageByWallet.set(walletAddress, bucket);
  return gasSponsorshipUsageSnapshot(walletAddress);
}
