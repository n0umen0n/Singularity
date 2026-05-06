import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import assert from "node:assert/strict";

const COUNCIL_SIZE = 6;

function bytes(value: number) {
  return Array.from({ length: 32 }, () => value);
}

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

describe("singularity council", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const registry = anchor.workspace.SingularityRegistry as Program;
  const council = anchor.workspace.SingularityCouncil as Program;
  const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;

  async function fund(wallet: PublicKey) {
    const signature = await provider.connection.requestAirdrop(wallet, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  it("creates a mission request, accepts it, and rejects early treasury execution without transferring tokens", async () => {
    const slugHash = bytes(7);
    const missionMetadataHash = bytes(8);
    const requestMetadataHash = bytes(9);
    const epoch = 1;
    const recipient = Keypair.generate();
    const councilMembers = [payer, ...Array.from({ length: COUNCIL_SIZE - 1 }, () => Keypair.generate())];
    const escrowAmounts = [100_000, 90_000, 80_000, 70_000, 60_000, 50_000];

    await fund(recipient.publicKey);
    for (const member of councilMembers.slice(1)) {
      await fund(member.publicKey);
    }

    const [mission] = PublicKey.findProgramAddressSync([Buffer.from("mission"), Buffer.from(slugHash)], registry.programId);
    const [epochCouncil] = PublicKey.findProgramAddressSync(
      [Buffer.from("epoch_council"), mission.toBuffer(), u64Le(epoch)],
      council.programId,
    );
    const [request] = PublicKey.findProgramAddressSync(
      [Buffer.from("request"), mission.toBuffer(), Buffer.from(requestMetadataHash)],
      council.programId,
    );
    const [treasuryAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_authority"), mission.toBuffer()],
      council.programId,
    );
    const [voteEscrowAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("vote_escrow_authority"), request.toBuffer()],
      council.programId,
    );

    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    const treasuryVaultAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      treasuryAuthority,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    const treasuryVault = treasuryVaultAccount.address;
    const recipientTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      recipient.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      treasuryVault,
      payer,
      1_000_000,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    const councilTokenAccounts = await Promise.all(
      councilMembers.map(async (member, index) => {
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          payer,
          mint,
          member.publicKey,
          false,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID,
        );
        await mintTo(
          provider.connection,
          payer,
          mint,
          tokenAccount.address,
          payer,
          escrowAmounts[index],
          [],
          undefined,
          TOKEN_2022_PROGRAM_ID,
        );

        return tokenAccount.address;
      }),
    );
    const voteEscrowVault = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        voteEscrowAuthority,
        true,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )
    ).address;

    await registry.methods
      .initializeMission(slugHash, missionMetadataHash, mint, treasuryVault, new anchor.BN(1_000_000), 2_000)
      .accounts({
        creator: payer.publicKey,
        mission,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await council.methods
      .finalizeEpochCouncil(
        new anchor.BN(epoch),
        councilMembers.map((member) => member.publicKey),
        escrowAmounts.map((amount) => new anchor.BN(amount)),
      )
      .accounts({
        authority: payer.publicKey,
        mission,
        epochCouncil,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await council.methods
      .createRequest(requestMetadataHash, recipient.publicKey, new anchor.BN(250_000))
      .accounts({
        requester: payer.publicKey,
        mission,
        epochCouncil,
        request,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    for (const member of councilMembers.slice(0, 4)) {
      const [vote] = PublicKey.findProgramAddressSync(
        [Buffer.from("vote"), request.toBuffer(), member.publicKey.toBuffer()],
        council.programId,
      );

      await council.methods
        .vote(true)
        .accountsStrict({
          voter: member.publicKey,
          epochCouncil,
          request,
          vote,
          voterTokenAccount: councilTokenAccounts[councilMembers.indexOf(member)],
          voteEscrowAuthority,
          voteEscrowVault,
          mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers(member === payer ? [] : [member])
        .rpc();
    }

    const acceptedRequest = await council.account.fundingRequest.fetch(request);
    assert.equal(acceptedRequest.approvals, 4);
    assert.equal(acceptedRequest.status, 1);
    const voteEscrowAfterVoting = await getAccount(
      provider.connection,
      voteEscrowVault,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(voteEscrowAfterVoting.amount, BigInt(escrowAmounts.slice(0, 4).reduce((sum, amount) => sum + amount, 0)));
    const firstVoterAfterVoting = await getAccount(
      provider.connection,
      councilTokenAccounts[0],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(firstVoterAfterVoting.amount, 0n);

    await assert.rejects(
      () =>
        council.methods
          .execute()
          .accounts({
            executor: payer.publicKey,
            request,
            treasuryAuthority,
            treasuryVault,
            recipientTokenAccount,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      /VotingPeriodNotMet|The minimum voting period has not been met/,
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL),
      "confirmed",
    );

    // Local validator exposes warpSlot, but it does not guarantee clock time moves enough on every runtime.
    // The Rust unit tests cover the time invariant; this test confirms early execution cannot transfer.
    const recipientAfterFailedExecute = await getAccount(
      provider.connection,
      recipientTokenAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(recipientAfterFailedExecute.amount, 0n);
  });
});
