#!/usr/bin/env node
// Exercises the epoch rotation logic in `prepareFundingRequestInPostgres`.
//
// Step 1: Calls /api/funding-requests/prepare with the existing top-6 (no change).
//         Expected: backend reuses the latest epoch, prepared tx references the same epoch_council PDA.
// Step 2: Mutates holders by transferring 5,000 GF from voter6 to voter7 so the council membership changes
//         (voter7 enters the top-6, voter6 drops out).
// Step 3: Calls /api/funding-requests/prepare again.
//         Expected: backend allocates a new epoch_number, finalize_epoch_council fires on chain,
//         the new request points at the new epoch_council PDA.
//
// Cleans up DB-only (no chain rollback). Intended for the existing mainnet test mission.

import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "apps/app/.env.local"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq), l.slice(eq + 1)]; }),
);

const HOST = "http://127.0.0.1:8094";
const MISSION_ID = "launch-a-mission-market-a8b7";
const TOKEN_MINT = "AyY5ouzBZef9TghU89R7MhvSyruFdZ8CjYeXg4VE2SMF";
const REQUESTER = "8F7YpepKxP1xc9Nqscdh6SSs5X7DmtPWUjUGViYShCxQ"; // also the council authority

function makeSession(address) {
  const payload = Buffer.from(JSON.stringify({ address, issuedAt: Date.now(), expiresAt: Date.now() + 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", env.SINGULARITY_SESSION_SECRET).update(payload).digest("base64url");
  return `singularity_session=${payload}.${sig}`;
}

function loadKp(filename) {
  const arr = JSON.parse(readFileSync(path.join(homedir(), ".config/solana", filename), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function preparePost(name, description) {
  const response = await fetch(`${HOST}/api/funding-requests/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: makeSession(REQUESTER) },
    body: JSON.stringify({ missionId: MISSION_ID, name, description, amountUsd: 0.001 }),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function readEpochCouncils(pool) {
  const r = await pool.query("select epoch_number, member_wallets, escrow_amounts from epoch_councils where mission_id = $1 order by epoch_number desc", [MISSION_ID]);
  return r.rows;
}

async function deleteRequestById(pool, id) {
  await pool.query("delete from funding_request_votes where request_id = $1", [id]);
  await pool.query("delete from funding_requests where id = $1", [id]);
}

async function transferGf({ from, to, amountWhole, decimals, connection }) {
  const mint = new PublicKey(TOKEN_MINT);
  const fromAta = getAssociatedTokenAddressSync(mint, from.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const toAta = getAssociatedTokenAddressSync(mint, to.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const baseUnits = BigInt(amountWhole) * 10n ** BigInt(decimals);
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: from.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(from.publicKey, toAta, to.publicKey, mint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(fromAta, mint, toAta, from.publicKey, baseUnits, decimals, [], TOKEN_2022_PROGRAM_ID),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([from]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, ...blockhash }, "confirmed");
  return sig;
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

try {
  console.log("=== Initial epoch_councils ===");
  for (const row of await readEpochCouncils(pool)) console.log(`  epoch=${row.epoch_number} members=${(row.member_wallets || []).map((m) => m.slice(0, 4) + "..").join(",")}`);

  console.log("\n=== Step 1: prepare with unchanged holders ===");
  const r1 = await preparePost("Rotation test 1", "no holder change");
  console.log(`status=${r1.status} epoch_council=${r1.data?.transaction?.accounts?.epochCouncil}`);
  if (r1.data?.error) { console.log("error:", r1.data.error); }
  if (r1.data?.request?.id) {
    const epochR1 = (await pool.query("select epoch_number from funding_requests where id=$1", [r1.data.request.id])).rows[0]?.epoch_number;
    console.log(`request_row.epoch_number=${epochR1}`);
    await deleteRequestById(pool, r1.data.request.id);
  }
  const afterStep1 = await readEpochCouncils(pool);
  console.log(`epoch_councils count after step1: ${afterStep1.length} (expected: same as before)`);

  console.log("\n=== Step 2: mutate holders (voter6 -> voter7, 5,000 GF) ===");
  const voter6 = loadKp("test-voter-6.json");
  const voter7 = loadKp("test-voter-7.json");
  // voter7 needs SOL to be the fee payer for any future tx; transfer 0.005 SOL from requester just to make sure they exist on chain.
  const requester = loadKp("singularity-deploy.json");
  const mintInfo = await getMint(connection, new PublicKey(TOKEN_MINT), "confirmed", TOKEN_2022_PROGRAM_ID);
  // Ensure voter7 has SOL for their ATA rent.
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const seedMsg = new TransactionMessage({
    payerKey: requester.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: requester.publicKey, toPubkey: voter7.publicKey, lamports: 5_000_000 })],
  }).compileToV0Message();
  const seedTx = new VersionedTransaction(seedMsg);
  seedTx.sign([requester]);
  const seedSig = await connection.sendRawTransaction(seedTx.serialize());
  await connection.confirmTransaction({ signature: seedSig, ...blockhash }, "confirmed");
  console.log(`seeded voter7 with 0.005 SOL: ${seedSig}`);

  // Move 5,000 GF from voter6 (15k current) to voter7 (0 current).
  // voter7 ends with 5k (still less than voter5's 25k -> doesn't enter top-6 unless others also moved).
  // To force a real change we'll transfer enough so voter7 jumps above voter6.
  // voter6 current=15k, voter5=25k, voter7=0. Move 10k -> voter6=5k, voter7=10k. Top-6 by balance:
  //   voter1(100k) voter2(70k) voter3(50k) voter4(40k) voter5(25k) voter7(10k)  - voter6 drops out.
  const moveSig = await transferGf({ from: voter6, to: voter7, amountWhole: 10_000, decimals: mintInfo.decimals, connection });
  console.log(`moved 10,000 GF voter6 -> voter7: ${moveSig}`);

  console.log("\n=== Step 3: prepare with mutated holders ===");
  const r3 = await preparePost("Rotation test 3", "voter7 should now be in top-6");
  console.log(`status=${r3.status} epoch_council=${r3.data?.transaction?.accounts?.epochCouncil}`);
  if (r3.data?.error) { console.log("error:", r3.data.error); }
  if (r3.data?.request?.id) {
    const epochR3 = (await pool.query("select epoch_number from funding_requests where id=$1", [r3.data.request.id])).rows[0]?.epoch_number;
    console.log(`request_row.epoch_number=${epochR3}`);
    await deleteRequestById(pool, r3.data.request.id);
  }
  const afterStep3 = await readEpochCouncils(pool);
  console.log(`epoch_councils count after step3: ${afterStep3.length} (expected: previous + 1)`);
  for (const row of afterStep3) console.log(`  epoch=${row.epoch_number} members=${(row.member_wallets || []).map((m) => m.slice(0, 4) + "..").join(",")}`);
} finally {
  await pool.end();
}
