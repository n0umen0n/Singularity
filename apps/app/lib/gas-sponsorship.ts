import type { ConnectedStandardSolanaWallet } from "@privy-io/react-auth/solana";

export const SPONSORABLE_TX_KINDS = new Set([
  "council-candidate-register",
  "council-checkpoint",
  "funding-request-create",
  "funding-request-vote",
  "funding-request-execute",
  "funding-request-vote-escrow-release",
]);

// Mission launch uses server-relay fee sponsorship (signMessage + fee payer co-sign) because
// Privy's client sponsor:true flow rewrites the fee payer and invalidates Meteora co-signatures.
export const CLIENT_SPONSORABLE_TX_KINDS = SPONSORABLE_TX_KINDS;

export function isGasSponsorshipEnabled() {
  return process.env.NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP_ENABLED !== "false";
}

export function isSponsorableTransactionKind(kind?: string | null) {
  return Boolean(kind && SPONSORABLE_TX_KINDS.has(kind));
}

export function supportsClientGasSponsorship(kind?: string | null) {
  return Boolean(kind && CLIENT_SPONSORABLE_TX_KINDS.has(kind));
}

export function isEmbeddedPrivyWallet(wallet: ConnectedStandardSolanaWallet | null | undefined) {
  if (!wallet) return false;

  const standardWallet = wallet.standardWallet as { name?: string; isPrivyWallet?: boolean };
  if (standardWallet.isPrivyWallet === true) return true;
  return standardWallet.name === "Privy";
}

export function shouldUseGasSponsorship(input: {
  wallet: ConnectedStandardSolanaWallet | null | undefined;
  kind?: string | null;
}) {
  return (
    isGasSponsorshipEnabled() &&
    isEmbeddedPrivyWallet(input.wallet) &&
    supportsClientGasSponsorship(input.kind)
  );
}

export function shouldUseLaunchFeeSponsorship(input: {
  wallet: ConnectedStandardSolanaWallet | null | undefined;
  kind?: string | null;
  sponsorFees?: boolean | null;
}) {
  return (
    isGasSponsorshipEnabled() &&
    isEmbeddedPrivyWallet(input.wallet) &&
    input.kind === "mission-launch" &&
    Boolean(input.sponsorFees)
  );
}
