#!/usr/bin/env node
// Drives the singularity council funding-request end-to-end test for mission `launch-a-mission-market-a8b7`.
// Phases: fund | db | finalize-create | vote | verify | all
// Run: node scripts/test-funding-flow.mjs <phase>

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
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
} from "@solana/spl-token";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import pg from "pg";

const MISSION_ID = "launch-a-mission-market-a8b7";
const TOKEN_MINT = "AyY5ouzBZef9TghU89R7MhvSyruFdZ8CjYeXg4VE2SMF";
const TREASURY_VAULT = "8hUgxJAWJ3Chc8MqUHN7q1kbr3TSMMLgYNgsdYh1rBRi";
const REGISTRY_PROGRAM_ID = "7CxZRBgnYwi5MtSKebmaSh7XTRVXk3QgzjXRUgLzcXT5";
const COUNCIL_PROGRAM_ID = "4k7JhCHjs2uoiP1hmvYDawnwJuXMt5ZhUJotvMRqedKS";
const EPOCH = 1;

// Per-voter target GF amount (whole tokens). Sum = 300_000.
const VOTER_AMOUNTS_GF = [100_000, 70_000, 50_000, 40_000, 25_000, 15_000];
const VOTER_SOL = 0.01;
const VOTERS_THAT_APPROVE = 4; // 4 approvals -> Accepted (per program constants)

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function loadEnv() {
  const file = readFileSync(path.join(ROOT, "apps/app/.env.local"), "utf8");
  const env = {};
  for (const line of file.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function loadKeypair(filename) {
  const arr = JSON.parse(readFileSync(path.join(homedir(), ".config/solana", filename), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function loadVoters() {
  return Array.from({ length: 7 }, (_, i) => loadKeypair(`test-voter-${i + 1}.json`));
}

function anchorDiscriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64Le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function pdaFromSeeds(programId, seeds) {
  const [address] = PublicKey.findProgramAddressSync(seeds, new PublicKey(programId));
  return address;
}

function missionPda(missionId) {
  return pdaFromSeeds(REGISTRY_PROGRAM_ID, [
    Buffer.from("mission"),
    createHash("sha256").update(missionId).digest().subarray(0, 32),
  ]);
}

function epochCouncilPda(mission, epoch) {
  return pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("epoch_council"), mission.toBuffer(), u64Le(epoch)]);
}

function requestPda(mission, metadataHash32) {
  return pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("request"), mission.toBuffer(), metadataHash32]);
}

function voteEscrowAuthorityPda(request) {
  return pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("vote_escrow_authority"), request.toBuffer()]);
}

function votePda(request, voter) {
  return pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("vote"), request.toBuffer(), voter.toBuffer()]);
}

function candidatePda(mission, owner) {
  return pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("candidate"), mission.toBuffer(), owner.toBuffer()]);
}

function buildRegisterCandidateInstruction({ owner, sponsor, mission, candidate }) {
  return new TransactionInstruction({
    programId: new PublicKey(COUNCIL_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(owner), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(sponsor), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(candidate), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("register_candidate"),
  });
}

function metadataHashFromString(s) {
  return createHash("sha256").update(s).digest();
}

function buildFinalizeInstruction({ authority, mission, epochCouncil, epoch, members, escrowAmounts }) {
  if (members.length !== 6) throw new Error("members must be 6");
  if (escrowAmounts.length !== 6) throw new Error("escrowAmounts must be 6");
  const data = Buffer.concat([
    anchorDiscriminator("finalize_epoch_council"),
    u64Le(epoch),
    ...members.map((m) => new PublicKey(m).toBuffer()),
    ...escrowAmounts.map((a) => u64Le(a)),
  ]);
  return new TransactionInstruction({
    programId: new PublicKey(COUNCIL_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(authority), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(epochCouncil), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildCreateRequestInstruction({ requester, mission, epochCouncil, request, metadataHash32, recipient, tokenAmountBaseUnits }) {
  const data = Buffer.concat([
    anchorDiscriminator("create_request"),
    metadataHash32,
    new PublicKey(recipient).toBuffer(),
    u64Le(tokenAmountBaseUnits),
  ]);
  return new TransactionInstruction({
    programId: new PublicKey(COUNCIL_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(requester), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(mission), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(epochCouncil), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(request), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildVoteInstruction({ voter, epochCouncil, request, vote, voterTokenAccount, voteEscrowAuthority, voteEscrowVault, mint, approve }) {
  const data = Buffer.concat([
    anchorDiscriminator("vote"),
    Buffer.from([approve ? 1 : 0]),
  ]);
  return new TransactionInstruction({
    programId: new PublicKey(COUNCIL_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(voter), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(epochCouncil), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(request), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(vote), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(voterTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(voteEscrowAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(voteEscrowVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildExecuteInstruction({ executor, request, treasuryAuthority, treasuryVault, recipientTokenAccount, mint }) {
  const data = anchorDiscriminator("execute");
  return new TransactionInstruction({
    programId: new PublicKey(COUNCIL_PROGRAM_ID),
    keys: [
      { pubkey: new PublicKey(executor), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(request), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(treasuryAuthority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(treasuryVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(recipientTokenAccount), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function sendV0(connection, payerKeypair, instructions, signers = [payerKeypair]) {
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payerKeypair.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign(signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, ...blockhash }, "confirmed");
  return sig;
}

function pgClient(env) {
  const Pool = pg.Pool;
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

function shortWallet(addr) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

async function fundPhase(env) {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const payer = loadKeypair("singularity-deploy.json");
  const voters = loadVoters().slice(0, 6);
  const mint = new PublicKey(TOKEN_MINT);
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const decimals = mintInfo.decimals;
  console.log(`Mint ${TOKEN_MINT} has ${decimals} decimals`);

  const payerAta = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const startingBalance = await connection.getTokenAccountBalance(payerAta).catch(() => null);
  console.log(`CLI ATA ${payerAta.toBase58()} balance=${startingBalance?.value.uiAmountString}`);

  const lamportsPerVoter = Math.floor(VOTER_SOL * 1e9);
  const transferIxs = [];
  for (let i = 0; i < voters.length; i += 1) {
    const voter = voters[i];
    const voterAta = getAssociatedTokenAddressSync(mint, voter.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const gfBaseUnits = BigInt(VOTER_AMOUNTS_GF[i]) * 10n ** BigInt(decimals);
    transferIxs.push(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: voter.publicKey, lamports: lamportsPerVoter }),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, voterAta, voter.publicKey, mint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(payerAta, mint, voterAta, payer.publicKey, gfBaseUnits, decimals, [], TOKEN_2022_PROGRAM_ID),
    );
    console.log(`  voter${i + 1} ${voter.publicKey.toBase58()} -> ${VOTER_AMOUNTS_GF[i]} GF + ${VOTER_SOL} SOL (ata=${voterAta.toBase58()})`);
  }
  // Submit in two transactions to stay under size limits.
  const half = Math.floor(transferIxs.length / 2);
  const sig1 = await sendV0(connection, payer, transferIxs.slice(0, half));
  console.log(`tx1: ${sig1}`);
  const sig2 = await sendV0(connection, payer, transferIxs.slice(half));
  console.log(`tx2: ${sig2}`);
}

async function registerPhase(env) {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const voters = loadVoters().slice(0, 6);
  const mission = missionPda(MISSION_ID);
  for (let i = 0; i < voters.length; i += 1) {
    const voter = voters[i];
    const candidate = candidatePda(mission, voter.publicKey);
    const existing = await connection.getAccountInfo(candidate, "confirmed");
    if (existing) {
      console.log(`  voter${i + 1} ${shortWallet(voter.publicKey.toBase58())} already registered (candidate=${candidate.toBase58()})`);
      continue;
    }
    const ix = buildRegisterCandidateInstruction({
      owner: voter.publicKey.toBase58(),
      sponsor: voter.publicKey.toBase58(),
      mission: mission.toBase58(),
      candidate: candidate.toBase58(),
    });
    const sig = await sendV0(connection, voter, [ix]);
    console.log(`  voter${i + 1} ${shortWallet(voter.publicKey.toBase58())} register_candidate -> ${sig}`);
  }
}

async function dbPhase(env) {
  const pool = pgClient(env);
  try {
    const voters = loadVoters().slice(0, 6);
    const decimals = 6; // GF token has 6 decimals
    for (let i = 0; i < voters.length; i += 1) {
      const v = voters[i];
      const wallet = v.publicKey.toBase58();
      const tokens = VOTER_AMOUNTS_GF[i];
      const baseUnits = (BigInt(tokens) * 10n ** BigInt(decimals)).toString();
      const displayName = `Test Voter ${i + 1}`;

      await pool.query(
        `insert into profiles (wallet_address, display_name, avatar_url, bio, socials)
         values ($1, $2, null, 'Funding flow test councillor', '[]'::jsonb)
         on conflict (wallet_address) do update set display_name = excluded.display_name, updated_at = now()`,
        [wallet, displayName],
      );
      await pool.query(
        `insert into council_candidates (mission_id, owner_wallet, latest_checkpoint_balance, status)
         values ($1, $2, $3, 'registered')
         on conflict (mission_id, owner_wallet) do update set latest_checkpoint_balance = excluded.latest_checkpoint_balance, status = 'registered'`,
        [MISSION_ID, wallet, baseUnits],
      );
      console.log(`  upserted ${displayName} ${shortWallet(wallet)} balance=${tokens} GF`);
    }

    // Refresh missions.council_json so the FE shows them immediately (otherwise users only show via merge in candidateRowsToCouncil, which is fine, but explicit set is clearer).
    const counc = await pool.query(
      `select cc.owner_wallet as address, p.display_name, p.avatar_url, cc.latest_checkpoint_balance
       from council_candidates cc
       left join profiles p on p.wallet_address = cc.owner_wallet
       where cc.mission_id = $1 and cc.status = 'registered'
       order by cc.latest_checkpoint_balance::numeric desc, cc.created_at asc
       limit 6`,
      [MISSION_ID],
    );
    const totalSupplyResult = await pool.query("select total_supply from missions where id=$1", [MISSION_ID]);
    const totalSupply = Number(totalSupplyResult.rows[0]?.total_supply || 50_000_000);
    const councilJson = counc.rows.map((row, idx) => {
      const tokens = Number(row.latest_checkpoint_balance) / 10 ** 6;
      return {
        id: `${MISSION_ID}-candidate-${row.address}`,
        name: row.display_name || shortWallet(row.address),
        address: row.address,
        avatar: row.avatar_url || "",
        tokens,
        ownership: totalSupply > 0 ? (tokens / totalSupply) * 100 : 0,
      };
    });
    await pool.query("update missions set council_json = $2::jsonb where id = $1", [MISSION_ID, JSON.stringify(councilJson)]);
    console.log(`council_json refreshed with ${councilJson.length} members`);
  } finally {
    await pool.end();
  }
}

async function finalizeAndCreatePhase(env) {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const authority = loadKeypair("singularity-deploy.json");
  const voters = loadVoters().slice(0, 6);
  const mint = new PublicKey(TOKEN_MINT);
  const decimals = (await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID)).decimals;

  const mission = missionPda(MISSION_ID);
  const epochCouncil = epochCouncilPda(mission, EPOCH);
  console.log(`mission_pda=${mission.toBase58()} epoch_council=${epochCouncil.toBase58()}`);

  const epochCouncilAccount = await connection.getAccountInfo(epochCouncil, "confirmed");
  if (!epochCouncilAccount) {
    console.log("Finalizing epoch council on-chain...");
    const members = voters.map((v) => v.publicKey.toBase58());
    const escrowAmounts = VOTER_AMOUNTS_GF.map((amount) => BigInt(amount) * 10n ** BigInt(decimals));
    const finalizeIx = buildFinalizeInstruction({
      authority: authority.publicKey.toBase58(),
      mission: mission.toBase58(),
      epochCouncil: epochCouncil.toBase58(),
      epoch: EPOCH,
      members,
      escrowAmounts,
    });
    const sig = await sendV0(connection, authority, [finalizeIx]);
    console.log(`finalize_epoch_council sig: ${sig}`);
  } else {
    console.log("Epoch council already finalized on-chain; reusing.");
  }

  // Build funding request: requester=cli wallet, recipient=cli wallet, ~1000 GF tokens
  const requesterWallet = authority.publicKey.toBase58();
  const tokenAmountWhole = 1_000;
  const tokenAmountBaseUnits = BigInt(tokenAmountWhole) * 10n ** BigInt(decimals);
  const description = "Funding flow E2E test from CLI";
  const title = "Funding flow E2E test";
  const requestId = `${MISSION_ID}-r-test-${randomBytes(2).toString("hex")}`;
  const metadata = {
    name: title,
    description,
    tokenAmount: Number(tokenAmountBaseUnits),
    amountUsd: 0,
    requesterWallet,
  };
  const metadataHashHex = createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
  const metadataHash32 = Buffer.from(metadataHashHex, "hex");
  const request = requestPda(mission, metadataHash32);
  const voteEscrowAuth = voteEscrowAuthorityPda(request);
  const voteEscrowVault = getAssociatedTokenAddressSync(mint, voteEscrowAuth, true, TOKEN_2022_PROGRAM_ID);

  console.log(`request_pda=${request.toBase58()} vote_escrow_auth=${voteEscrowAuth.toBase58()} vault=${voteEscrowVault.toBase58()}`);

  const onChain = await connection.getAccountInfo(request, "confirmed");
  let onChainSig = null;
  if (!onChain) {
    const ixs = [
      buildCreateRequestInstruction({
        requester: requesterWallet,
        mission: mission.toBase58(),
        epochCouncil: epochCouncil.toBase58(),
        request: request.toBase58(),
        metadataHash32,
        recipient: requesterWallet,
        tokenAmountBaseUnits,
      }),
      // Pre-create vote escrow vault ATA so voters don't need to (idempotent).
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, voteEscrowVault, voteEscrowAuth, mint, TOKEN_2022_PROGRAM_ID),
      // Make sure recipient ATA exists for execute() later (idempotent).
      createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, getAssociatedTokenAddressSync(mint, authority.publicKey, false, TOKEN_2022_PROGRAM_ID), authority.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    ];
    onChainSig = await sendV0(connection, authority, ixs);
    console.log(`create_request sig: ${onChainSig}`);
  } else {
    console.log("Funding request already exists on-chain.");
  }

  // Persist DB rows.
  const pool = pgClient(env);
  try {
    await pool.query(
      `insert into epoch_councils (mission_id, epoch_number, member_wallets, checkpoint_balances, escrow_amounts, finalized_at)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, now())
       on conflict (mission_id, epoch_number) do update set
         member_wallets = excluded.member_wallets,
         checkpoint_balances = excluded.checkpoint_balances,
         escrow_amounts = excluded.escrow_amounts,
         finalized_at = now()`,
      [
        MISSION_ID,
        EPOCH,
        JSON.stringify(voters.map((v) => v.publicKey.toBase58())),
        JSON.stringify(VOTER_AMOUNTS_GF.map((g) => (BigInt(g) * 10n ** BigInt(decimals)).toString())),
        JSON.stringify(VOTER_AMOUNTS_GF.map((g) => Number(BigInt(g) * 10n ** BigInt(decimals)))),
      ],
    );
    const existing = await pool.query("select id from funding_requests where request_pda = $1", [request.toBase58()]);
    let dbRequestId;
    if (existing.rows[0]) {
      dbRequestId = existing.rows[0].id;
      console.log(`Funding request already in DB: ${dbRequestId}`);
    } else {
      dbRequestId = requestId;
      await pool.query(
        `insert into funding_requests (
           id, request_pda, mission_id, requester_wallet, recipient_wallet, mission_token_amount,
           derived_usd_estimate, status, metadata_hash, title, description
         ) values ($1, $2, $3, $4, $4, $5, 0, 'active', $6, $7, $8)`,
        [dbRequestId, request.toBase58(), MISSION_ID, requesterWallet, tokenAmountWhole, metadataHashHex, title, description],
      );
      console.log(`Inserted funding_request DB row: ${dbRequestId}`);
    }
    if (onChainSig) {
      await pool.query(
        `insert into transactions (signature, wallet, mission_id, type, status)
         values ($1, $2, $3, 'funding-request-create', 'submitted')
         on conflict (signature) do nothing`,
        [onChainSig, requesterWallet, MISSION_ID],
      );
    }
    // Record the on-chain coordinates so the verify phase doesn't have to re-derive.
    const stateFile = path.join(ROOT, "scripts", ".test-funding-flow.state.json");
    const state = {
      requestId: dbRequestId,
      requestPda: request.toBase58(),
      epochCouncil: epochCouncil.toBase58(),
      mission: mission.toBase58(),
      voteEscrowAuth: voteEscrowAuth.toBase58(),
      voteEscrowVault: voteEscrowVault.toBase58(),
      metadataHashHex,
      requesterWallet,
      tokenAmountBaseUnits: tokenAmountBaseUnits.toString(),
    };
    const fs = await import("node:fs/promises");
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log(`state saved -> ${stateFile}`);
  } finally {
    await pool.end();
  }
}

async function readState() {
  const fs = await import("node:fs/promises");
  const stateFile = path.join(ROOT, "scripts", ".test-funding-flow.state.json");
  return JSON.parse(await fs.readFile(stateFile, "utf8"));
}

async function votePhase(env) {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const state = await readState();
  const voters = loadVoters().slice(0, 6);
  const mint = new PublicKey(TOKEN_MINT);
  const epochCouncil = new PublicKey(state.epochCouncil);
  const request = new PublicKey(state.requestPda);
  const voteEscrowAuth = new PublicKey(state.voteEscrowAuth);
  const voteEscrowVault = new PublicKey(state.voteEscrowVault);

  const pool = pgClient(env);
  try {
    for (let i = 0; i < VOTERS_THAT_APPROVE; i += 1) {
      const voter = voters[i];
      const voterAta = getAssociatedTokenAddressSync(mint, voter.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const vote = votePda(request, voter.publicKey);
      // If this voter already voted, skip.
      const existing = await connection.getAccountInfo(vote, "confirmed");
      if (existing) {
        console.log(`  voter${i + 1} ${shortWallet(voter.publicKey.toBase58())} already voted - skipping`);
        continue;
      }
      const ix = buildVoteInstruction({
        voter: voter.publicKey.toBase58(),
        epochCouncil: epochCouncil.toBase58(),
        request: request.toBase58(),
        vote: vote.toBase58(),
        voterTokenAccount: voterAta.toBase58(),
        voteEscrowAuthority: voteEscrowAuth.toBase58(),
        voteEscrowVault: voteEscrowVault.toBase58(),
        mint: mint.toBase58(),
        approve: true,
      });
      const sig = await sendV0(connection, voter, [ix]);
      console.log(`  voter${i + 1} ${shortWallet(voter.publicKey.toBase58())} approved -> ${sig}`);

      // Mirror in DB (idempotent).
      await pool.query(
        `insert into funding_request_votes (request_id, voter_wallet, vote, signature)
         values ($1, $2, 'approve', $3)
         on conflict (request_id, voter_wallet) do nothing`,
        [state.requestId, voter.publicKey.toBase58(), sig],
      );
      await pool.query(
        `insert into transactions (signature, wallet, mission_id, type, status)
         values ($1, $2, $3, 'funding-request-vote', 'submitted')
         on conflict (signature) do nothing`,
        [sig, voter.publicKey.toBase58(), MISSION_ID],
      );
    }

    // Update DB request status if accepted by counts.
    const counts = await pool.query(
      `select count(*) filter (where vote='approve') as approvals,
              count(*) filter (where vote='reject') as rejections
         from funding_request_votes where request_id = $1`,
      [state.requestId],
    );
    const approvals = Number(counts.rows[0].approvals);
    const rejections = Number(counts.rows[0].rejections);
    const newStatus = approvals >= 4 ? "accepted" : rejections >= 3 ? "rejected" : "active";
    await pool.query("update funding_requests set status = $2 where id = $1", [state.requestId, newStatus]);
    console.log(`DB votes: approvals=${approvals} rejections=${rejections} status=${newStatus}`);
  } finally {
    await pool.end();
  }
}

async function decodeFundingRequest(connection, request) {
  const account = await connection.getAccountInfo(request, "confirmed");
  if (!account) throw new Error(`request account not found: ${request.toBase58()}`);
  const data = account.data;
  // Layout (after 8-byte discriminator):
  //   mission: Pubkey (32), requester: Pubkey (32), epoch_council: Pubkey (32),
  //   metadata_hash: [u8; 32], recipient: Pubkey (32), token_amount: u64,
  //   status: u8, approvals: u8, rejections: u8, created_at: i64, executed_at: i64, bump: u8
  let offset = 8;
  const readPubkey = () => {
    const v = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    return v;
  };
  const readU64 = () => {
    const v = data.readBigUInt64LE(offset);
    offset += 8;
    return v;
  };
  const readI64 = () => {
    const v = data.readBigInt64LE(offset);
    offset += 8;
    return v;
  };
  const readU8 = () => {
    const v = data.readUInt8(offset);
    offset += 1;
    return v;
  };
  const readBytes = (n) => {
    const v = data.subarray(offset, offset + n);
    offset += n;
    return v;
  };
  const mission = readPubkey();
  const requester = readPubkey();
  const epochCouncil = readPubkey();
  const metadataHash = Buffer.from(readBytes(32)).toString("hex");
  const recipient = readPubkey();
  const tokenAmount = readU64();
  const status = readU8();
  const approvals = readU8();
  const rejections = readU8();
  const createdAt = readI64();
  const executedAt = readI64();
  const bump = readU8();
  const statusName = ["Active", "Accepted", "Rejected", "Executed"][status] || `Unknown(${status})`;
  return { mission, requester, epochCouncil, metadataHash, recipient, tokenAmount, status, statusName, approvals, rejections, createdAt, executedAt, bump };
}

async function verifyPhase(env) {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const state = await readState();
  const mint = new PublicKey(TOKEN_MINT);
  const request = new PublicKey(state.requestPda);
  const voteEscrowVault = new PublicKey(state.voteEscrowVault);
  const voters = loadVoters().slice(0, 6);

  const decoded = await decodeFundingRequest(connection, request);
  console.log(`request status=${decoded.statusName} approvals=${decoded.approvals} rejections=${decoded.rejections}`);
  console.log(`token_amount=${decoded.tokenAmount} created_at=${new Date(Number(decoded.createdAt) * 1000).toISOString()}`);

  const escrow = await getAccount(connection, voteEscrowVault, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log(`vote_escrow_vault balance=${escrow.amount} (expected sum of first ${VOTERS_THAT_APPROVE} = ${VOTER_AMOUNTS_GF.slice(0, VOTERS_THAT_APPROVE).reduce((a, b) => a + b, 0) * 1e6})`);

  for (let i = 0; i < voters.length; i += 1) {
    const ata = getAssociatedTokenAddressSync(mint, voters[i].publicKey, false, TOKEN_2022_PROGRAM_ID);
    const balance = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null);
    const sol = await connection.getBalance(voters[i].publicKey, "confirmed");
    console.log(`  voter${i + 1} ${shortWallet(voters[i].publicKey.toBase58())} GF(base)=${balance?.amount ?? "n/a"} SOL=${sol / 1e9}`);
  }

  // Try to execute(). Should fail with VotingPeriodNotMet if 3 days have not yet passed.
  const authority = loadKeypair("singularity-deploy.json");
  const treasuryAuth = pdaFromSeeds(COUNCIL_PROGRAM_ID, [Buffer.from("treasury_authority"), new PublicKey(state.mission).toBuffer()]);
  const recipientAta = getAssociatedTokenAddressSync(mint, new PublicKey(state.requesterWallet), false, TOKEN_2022_PROGRAM_ID);
  const ix = buildExecuteInstruction({
    executor: authority.publicKey.toBase58(),
    request: request.toBase58(),
    treasuryAuthority: treasuryAuth.toBase58(),
    treasuryVault: TREASURY_VAULT,
    recipientTokenAccount: recipientAta.toBase58(),
    mint: mint.toBase58(),
  });
  try {
    const sig = await sendV0(connection, authority, [ix]);
    console.log(`execute() unexpectedly succeeded: ${sig}`);
  } catch (err) {
    const msg = String(err?.message || err);
    const expected = /VotingPeriodNotMet|6003|0x1773|minimum voting period|custom program error/i.test(msg);
    console.log(`execute() ${expected ? "blocked as expected" : "blocked"}: ${msg.slice(0, 240)}`);
  }
}

const phase = process.argv[2] || "all";
const env = loadEnv();
if (!env.SOLANA_RPC_URL || !env.DATABASE_URL) {
  throw new Error("apps/app/.env.local missing SOLANA_RPC_URL or DATABASE_URL");
}

const phases = {
  fund: () => fundPhase(env),
  register: () => registerPhase(env),
  db: () => dbPhase(env),
  "finalize-create": () => finalizeAndCreatePhase(env),
  vote: () => votePhase(env),
  verify: () => verifyPhase(env),
};

async function main() {
  if (phase === "all") {
    for (const name of ["fund", "register", "db", "finalize-create", "vote", "verify"]) {
      console.log(`\n=== phase: ${name} ===`);
      await phases[name]();
    }
  } else if (phases[phase]) {
    console.log(`=== phase: ${phase} ===`);
    await phases[phase]();
  } else {
    throw new Error(`unknown phase ${phase}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
