"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { DisabledWalletProvider, SingularityWalletProvider } from "@/lib/wallet";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: React.ReactNode }) {
  if (!privyAppId) {
    return <DisabledWalletProvider>{children}</DisabledWalletProvider>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#8b5cf6",
          walletChainType: "solana-only",
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        loginMethods: ["wallet", "email"],
      }}
    >
      <SingularityWalletProvider>{children}</SingularityWalletProvider>
    </PrivyProvider>
  );
}
