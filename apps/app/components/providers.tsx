"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { DisabledWalletProvider, SingularityWalletProvider } from "@/lib/wallet";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function solanaMainnetRpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
}

function solanaMainnetWsUrl(httpUrl: string) {
  return httpUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function privySolanaConfig(): NonNullable<PrivyClientConfig["solana"]> {
  const rpcUrl = solanaMainnetRpcUrl();
  return {
    rpcs: {
      "solana:mainnet": {
        rpc: createSolanaRpc(rpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions(solanaMainnetWsUrl(rpcUrl)),
      },
    },
  } as unknown as NonNullable<PrivyClientConfig["solana"]>;
}

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
        solana: privySolanaConfig(),
      }}
    >
      <SingularityWalletProvider>{children}</SingularityWalletProvider>
    </PrivyProvider>
  );
}
