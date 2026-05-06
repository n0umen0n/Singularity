"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
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

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || `Request failed with status ${response.status}.`);
  return data as T;
}

async function formatSendTransactionError(error: unknown, connection: Connection) {
  if (!(error instanceof SendTransactionError)) return error;

  const logs = await error.getLogs(connection).catch(() => error.logs);
  if (!logs?.length) return error;

  return new Error(`${error.message}\nLogs:\n${logs.join("\n")}`);
}

export function SingularityWalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, login, logout, ready } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const wallet = wallets[0] ?? null;
  const address = sessionAddress;

  const signIn = useCallback(async () => {
    setStatus(null);
    if (!authenticated) {
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
  }, [authenticated, login, signMessage, wallet]);

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
        await signIn();
        return null;
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
    [signIn, signTransaction, wallet],
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
