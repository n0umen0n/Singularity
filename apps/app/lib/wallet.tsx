"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Connection, SendTransactionError, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";

export type PreparedTransaction =
  | {
      kind: string;
      status: "ready";
      network?: string;
      transactionBase64: string;
      transactions?: Array<{
        label?: string;
        transactionBase64: string;
        requiredSigners?: string[];
      }>;
      requiredSigners?: string[];
      message?: string;
    }
  | {
      kind: string;
      status: "not_configured";
      message: string;
    };

type WalletContextValue = {
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  status: string | null;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPreparedTransaction: (transaction?: PreparedTransaction | null) => Promise<string | null>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requestErrorMessage(status: number, data: unknown) {
  const serverMessage =
    typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : null;
  if (serverMessage) return serverMessage;
  if (status === 401) return "Sign in with your wallet before continuing.";
  if (status >= 500) return "Wallet authentication is temporarily unavailable. Please try again in a moment.";
  return "Wallet authentication could not be completed. Please try again.";
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(requestErrorMessage(response.status, data));
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(requestErrorMessage(response.status, data));
  return data as T;
}

async function formatSendTransactionError(error: unknown, connection: Connection) {
  const plainLogs =
    typeof error === "object" && error && "logs" in error && Array.isArray((error as { logs?: unknown }).logs)
      ? ((error as { logs: string[] }).logs)
      : null;
  const plainMessage = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";

  if (!(error instanceof SendTransactionError) && !plainLogs) return error;

  const logs = error instanceof SendTransactionError ? await error.getLogs(connection).catch(() => error.logs) : plainLogs;
  const message = error instanceof SendTransactionError ? error.message : plainMessage;
  console.error("Solana transaction failed", {
    message,
    logs,
  });

  const details = `${message}\n${logs?.join("\n") || ""}`;
  if (details.includes("already in use")) {
    return new Error("This wallet is already registered as a council candidate for this mission.");
  }
  if (details.includes("InstructionFallbackNotFound")) {
    return new Error(
      "Simulation failed (InstructionFallbackNotFound): the chain rejected this instruction's header bytes—often a stale API deployment or RPC/cluster mismatch between the backend (SOLANA_RPC_URL) and your wallet RPC. The council program on mainnet matches this repo’s deploy artifact; redeploy the app if production might lag git.",
    );
  }
  if (details.includes("AccountNotInitialized") || details.includes("expected this account to be already initialized")) {
    return new Error("This mission does not have 6 finalized councillors on-chain yet. Finalize the top 6 holders before submitting funding requests.");
  }
  if (details.includes("insufficient lamports") || details.includes("Attempt to debit an account")) {
    return new Error("Your wallet does not have enough SOL to pay for this transaction.");
  }
  if (details.includes("User rejected") || details.includes("rejected")) {
    return new Error("Transaction was cancelled in your wallet.");
  }
  if (details.includes("Blockhash not found")) {
    return new Error("The transaction expired before it was submitted. Please try again.");
  }

  return new Error("The transaction could not be submitted. Please check your wallet and try again.");
}

export function SingularityWalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated: privyAuthenticated, login, logout, ready: privyReady } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const wallet = sessionAddress ? (wallets.find((entry) => entry.address === sessionAddress) ?? null) : (wallets[0] ?? null);
  const address = sessionAddress;
  const ready = privyReady && !restoringSession;
  const authenticated = Boolean(sessionAddress);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const data = await getJson<{ session: { address: string } | null }>("/api/auth/session");
        if (!cancelled) setSessionAddress(data.session?.address ?? null);
      } catch {
        if (!cancelled) setSessionAddress(null);
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setStatus(null);
    if (!privyReady) {
      setStatus("Loading wallet session. Please try again in a moment.");
      return null;
    }
    if (!privyAuthenticated) {
      login();
      setStatus("Choose a Solana wallet, then press Sign in again to verify ownership.");
      return null;
    }
    if (!wallet?.address) {
      setStatus("Connect a Solana wallet in Privy to continue.");
      return null;
    }

    const nonce = await postJson<{ nonce: string; message: string }>("/api/auth/nonce", { address: wallet.address });
    const signed = await signMessage({
      message: new TextEncoder().encode(nonce.message),
      wallet,
      options: { uiOptions: { title: "Sign in to Singularity" } },
    });
    const signatureBytes = "signature" in signed ? signed.signature : signed;
    const signature = bs58.encode(signatureBytes instanceof Uint8Array ? signatureBytes : new Uint8Array(signatureBytes as ArrayBuffer));

    await postJson("/api/auth/verify", {
      address: wallet.address,
      nonce: nonce.nonce,
      signature,
    });
    setSessionAddress(wallet.address);
    setStatus("Wallet verified.");
    return wallet.address;
  }, [login, privyAuthenticated, privyReady, signMessage, wallet]);

  const signOut = useCallback(async () => {
    await postJson("/api/auth/logout");
    setSessionAddress(null);
    setStatus(null);
    await logout();
  }, [logout]);

  const sendPreparedTransaction = useCallback(
    async (transaction?: PreparedTransaction | null) => {
      if (!transaction) return null;
      if (transaction.status !== "ready") {
        setStatus(transaction.message);
        return null;
      }
      if (!wallet) {
        if (sessionAddress) {
          throw new Error("Your signed-in wallet is not currently connected in Privy. Sign out, reconnect that Solana wallet, and try again.");
        }
        await signIn();
        return null;
      }
      if (sessionAddress && wallet.address !== sessionAddress) {
        throw new Error("The connected wallet does not match your signed-in wallet. Sign out, reconnect the correct wallet, and try again.");
      }

      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const preparedTransactions = transaction.transactions?.length ? transaction.transactions : [{ transactionBase64: transaction.transactionBase64 }];
      const signatures: string[] = [];

      for (const [index, prepared] of preparedTransactions.entries()) {
        setStatus(prepared.label || `Approve transaction ${index + 1} of ${preparedTransactions.length}.`);
        const transactionBytes = bytesFromBase64(prepared.transactionBase64);
        const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
        const signed = await signTransaction({ transaction: versionedTransaction.serialize(), wallet });
        const signedBytes = "signedTransaction" in signed ? signed.signedTransaction : signed;
        const rawTransaction = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes as ArrayBuffer);
        const submitted = await connection.sendRawTransaction(rawTransaction, { skipPreflight: false }).catch(async (error: unknown) => {
          throw await formatSendTransactionError(error, connection);
        });
        signatures.push(submitted);
        await connection.confirmTransaction(submitted, "confirmed");
      }

      const signature = signatures.at(-1) || null;
      setStatus(signature ? `Transaction submitted: ${signature}` : "Transaction was not submitted.");
      return signature;
    },
    [sessionAddress, signIn, signTransaction, wallet],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      ready,
      authenticated,
      address,
      status,
      signIn,
      signOut,
      sendPreparedTransaction,
    }),
    [address, authenticated, ready, sendPreparedTransaction, signIn, signOut, status],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function DisabledWalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<string | null>(null);
  const value = useMemo<WalletContextValue>(
    () => ({
      ready: true,
      authenticated: false,
      address: null,
      status,
      signIn: async () => {
        setStatus("NEXT_PUBLIC_PRIVY_APP_ID is required to enable wallet login.");
        return null;
      },
      signOut: async () => setStatus(null),
      sendPreparedTransaction: async (transaction) => {
        setStatus(transaction?.status === "not_configured" ? transaction.message : "Wallet login is not configured.");
        return null;
      },
    }),
    [status],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useSingularityWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useSingularityWallet must be used inside SingularityWalletProvider.");
  return value;
}
