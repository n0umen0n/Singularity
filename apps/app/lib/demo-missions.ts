/** Wallet used by DB seed scripts for demo missions (not on-chain launches). */
export const DEMO_CREATOR_WALLET = "DemoSingularityCreator1111111111111111111111";

export function isDemoMissionCreator(creatorWallet: string | null | undefined) {
  return Boolean(creatorWallet && creatorWallet.toLowerCase() === DEMO_CREATOR_WALLET.toLowerCase());
}
