import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

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

function candidatePda(councilProgramId: string, mission: string, owner: string) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("candidate"), new PublicKey(mission).toBuffer(), new PublicKey(owner).toBuffer()],
    new PublicKey(councilProgramId),
  );

  return address.toBase58();
}

export function missionRegistrationPda(input: { registryProgramId: string; missionId: string }) {
  return missionPda(input.registryProgramId, input.missionId);
}

export function candidateRegistrationPda(input: {
  councilProgramId: string;
  registryProgramId: string;
  missionId: string;
  owner: string;
}) {
  return candidatePda(input.councilProgramId, missionPda(input.registryProgramId, input.missionId), input.owner);
}
