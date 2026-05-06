import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

export function authMessage(nonce: string) {
  return `Sign in to Singularity with nonce ${nonce}`;
}

export function verifySolanaSignature(input: { address: string; nonce: string; signature: string }) {
  const publicKey = new PublicKey(input.address);
  const message = new TextEncoder().encode(authMessage(input.nonce));
  const signature = bs58.decode(input.signature);

  return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
}
