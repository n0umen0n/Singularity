"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey, SendTransactionError, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { refreshPreparedTransactionBlockhash } from "@singularity/solana";
import { getIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { isEmbeddedPrivyWallet, shouldUseGasSponsorship, shouldUseServerFeeSponsorship } from "@/lib/gas-sponsorship";

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
      sponsorFees?: boolean;
      launchId?: string;
      missionId?: string;
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
  isEmbeddedWallet: boolean;
  status: string | null;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPreparedTransaction: (transaction?: PreparedTransaction | null) => Promise<string | null>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

type PrivyLinkedWallet = {
  type?: string;
  chainType?: string;
  chain_type?: string;
  address?: string;
};

type PrivyUserWithWallets = {
  wallet?: PrivyLinkedWallet;
  linkedAccounts?: PrivyLinkedWallet[];
  linked_accounts?: PrivyLinkedWallet[];
};

function isSolanaWallet(account?: PrivyLinkedWallet | null) {
  return account?.type === "wallet" && (account.chainType === "solana" || account.chain_type === "solana") && Boolean(account.address);
}

function solanaAddressFromPrivyUser(user: PrivyUserWithWallets | null) {
  if (user?.wallet?.chainType === "solana" || user?.wallet?.chain_type === "solana") return user.wallet.address ?? null;

  const linkedAccounts = user?.linkedAccounts ?? user?.linked_accounts ?? [];
  return linkedAccounts.find(isSolanaWallet)?.address ?? null;
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function privyTransactionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "The sponsored transaction could not be submitted.";

  const details =
    typeof error === "object" && error && "cause" in error && error.cause instanceof Error
      ? error.cause.message
      : error.message;

  if (process.env.NODE_ENV !== "production") {
    console.error("Privy sponsored transaction failed", { message: error.message, details, error });
  }

  if (details.includes("User rejected") || details.includes("rejected")) {
    return "Transaction was cancelled in your wallet.";
  }
  if (details.includes("sponsor") || details.includes("gas")) {
    return "Gas sponsorship is unavailable right now. Add a small amount of SOL to your wallet and try again.";
  }
  if (details.includes("too large")) {
    return "This transaction is too large for the wallet to submit. Try again or contact support.";
  }

  return details || error.message || "The sponsored transaction could not be submitted.";
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

async function postJson<T>(url: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
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

async function formatSendTransactionError(error: unknown, connection: Connection, kind?: string) {
  const plainLogs =
    typeof error === "object" && error && "logs" in error && Array.isArray((error as { logs?: unknown }).logs)
      ? ((error as { logs: string[] }).logs)
      : null;
  const plainMessage = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message) : "";

  if (!(error instanceof SendTransactionError) && !plainLogs) return error;

  const logs = error instanceof SendTransactionError ? await error.getLogs(connection).catch(() => error.logs) : plainLogs;
  const message = error instanceof SendTransactionError ? error.message : plainMessage;
  if (process.env.NODE_ENV !== "production") {
    console.error("Solana transaction failed", {
      message,
      logs,
    });
  }

  const details = `${message}\n${logs?.join("\n") || ""}`;
  if (details.includes("already in use")) {
    return new Error("This wallet is already registered as a council candidate for this mission.");
  }
  if (details.includes("InstructionFallbackNotFound")) {
    return new Error(
      "Simulation failed (InstructionFallbackNotFound): the deployed council program does not recognize this fee-claim instruction. Upgrade the on-chain council program from the current source, then retry.",
    );
  }
  if (details.includes("AccountNotInitialized") || details.includes("expected this account to be already initialized")) {
    if (kind === "mission-fee-claim" || details.includes("ClaimDbcFeesAndRoute")) {
      return new Error(
        "Fee claim failed because one of the Meteora or mission fee token accounts is not initialized yet. Check the console logs for the exact account error.",
      );
    }
    if (details.includes("account: epoch_council")) {
      return new Error("This mission does not have 6 finalized councillors on-chain yet. Finalize the top 6 holders before submitting funding requests.");
    }
    if (details.includes("account: voter_token_account")) {
      return new Error("Your connected wallet does not have an initialized mission-token account for this vote. Refresh balances, reconnect the council wallet, and try again.");
    }
    return new Error("A required on-chain account is not initialized for this transaction. Check the console logs for the exact account and try again.");
  }
  if (details.includes("insufficient funds for rent")) {
    return new Error("Your wallet does not have enough SOL to pay the on-chain account rent for registration. Send at least 0.01 SOL to your connected wallet and try again.");
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

function isRequiredTransactionSigner(transaction: VersionedTransaction, address: string) {
  const accountKeys = transaction.message.getAccountKeys();
  const requiredSignerCount = transaction.message.header.numRequiredSignatures;
  for (let index = 0; index < requiredSignerCount; index += 1) {
    if (accountKeys.get(index)?.toBase58() === address) return true;
  }
  return false;
}

export function SingularityWalletProvider({ children }: { children: React.ReactNode }) {
  const { authenticated: privyAuthenticated, getAccessToken, logout, ready: privyReady, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [pendingSessionVerification, setPendingSessionVerification] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const verifyingSession = useRef(false);
  const { login } = useLogin({
    onComplete: () => {
      setPendingSessionVerification(true);
    },
    onError: () => {
      setPendingSessionVerification(false);
      setStatus("Wallet login was cancelled or could not be completed.");
    },
  });
  const linkedSolanaAddress = solanaAddressFromPrivyUser(user);
  const verificationAddress = sessionAddress ?? linkedSolanaAddress ?? wallets[0]?.address ?? null;
  const wallet = verificationAddress ? (wallets.find((entry) => entry.address === verificationAddress) ?? null) : (wallets[0] ?? null);
  const isEmbeddedWallet = isEmbeddedPrivyWallet(wallet);
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

  const verifyWalletSession = useCallback(async () => {
    if (verifyingSession.current) return null;
    verifyingSession.current = true;
    setStatus(null);

    try {
      if (!verificationAddress) {
        setStatus("Connect a Solana wallet in Privy to continue.");
        return null;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Privy session is not ready. Please try signing in again.");
      const identityToken = await getIdentityToken();

      await postJson("/api/auth/privy", { address: verificationAddress }, { authorization: `Bearer ${accessToken}`, ...(identityToken ? { "privy-id-token": identityToken } : {}) });
      setSessionAddress(verificationAddress);
      setPendingSessionVerification(false);
      setStatus("Wallet verified.");
      return verificationAddress;
    } catch (error) {
      setPendingSessionVerification(false);
      setStatus(error instanceof Error ? error.message : "Wallet verification could not be completed. Please try again.");
      return null;
    } finally {
      verifyingSession.current = false;
    }
  }, [getAccessToken, verificationAddress]);

  useEffect(() => {
    if (!pendingSessionVerification || !privyReady || !privyAuthenticated) return;
    if (!verificationAddress) {
      setStatus("Finishing wallet connection...");
      return;
    }

    void verifyWalletSession();
  }, [pendingSessionVerification, privyAuthenticated, privyReady, verificationAddress, verifyWalletSession]);

  const signIn = useCallback(async () => {
    setStatus(null);
    if (!privyReady) {
      setStatus("Loading wallet session. Please try again in a moment.");
      return null;
    }
    if (!privyAuthenticated) {
      setPendingSessionVerification(true);
      login();
      setStatus("Choose a Solana wallet to finish signing in.");
      return null;
    }

    return verifyWalletSession();
  }, [login, privyAuthenticated, privyReady, verifyWalletSession]);

  const signOut = useCallback(async () => {
    await postJson("/api/auth/logout");
    setSessionAddress(null);
    setStatus(null);
    await logout();
    window.location.assign("/missions");
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

      const useGasSponsorship = shouldUseGasSponsorship({ wallet, kind: transaction.kind });
      const useServerFeeSponsorship = shouldUseServerFeeSponsorship({
        wallet,
        kind: transaction.kind,
        sponsorFees: transaction.sponsorFees,
      });
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const preparedTransactions = transaction.transactions?.length ? transaction.transactions : [{ transactionBase64: transaction.transactionBase64 }];
      const signatures: string[] = [];
      const { blockhash } = await connection.getLatestBlockhash("confirmed");

      for (const [index, prepared] of preparedTransactions.entries()) {
        setStatus(prepared.label || `Approve transaction ${index + 1} of ${preparedTransactions.length}.`);
        let transactionBase64 = prepared.transactionBase64;
        if (transaction.kind !== "mission-launch") {
          transactionBase64 = refreshPreparedTransactionBlockhash({
            transactionBase64,
            recentBlockhash: blockhash,
          });
        }
        const transactionBytes = bytesFromBase64(transactionBase64);

        if (useServerFeeSponsorship) {
          const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);

          if (transaction.kind === "mission-launch") {
            if (!transaction.launchId) {
              throw new Error("Mission launch fee sponsorship requires a launch id.");
            }

            if (isRequiredTransactionSigner(versionedTransaction, wallet.address)) {
              setStatus(prepared.label || "Approve the launch transaction in your wallet...");
              const { signature: userSignature } = await wallet.signMessage({
                message: versionedTransaction.message.serialize(),
              });
              versionedTransaction.addSignature(new PublicKey(wallet.address), userSignature);
            } else {
              setStatus(prepared.label || "Submitting sponsored launch transaction...");
            }

            const sponsored = await postJson<{ signature: string }>("/api/transactions/sponsor-mission-launch-step", {
              launchId: transaction.launchId,
              stepIndex: index,
              transactionBase64: base64FromBytes(versionedTransaction.serialize()),
            });
            signatures.push(sponsored.signature);
            continue;
          }

          if (transaction.kind === "council-candidate-register") {
            if (!transaction.missionId) {
              throw new Error("Council registration fee sponsorship requires a mission id.");
            }

            setStatus(prepared.label || "Approve council registration in your wallet...");
            const { signature: userSignature } = await wallet.signMessage({
              message: versionedTransaction.message.serialize(),
            });
            versionedTransaction.addSignature(new PublicKey(wallet.address), userSignature);

            const sponsored = await postJson<{ signature: string }>("/api/transactions/sponsor-council-candidate-register", {
              missionId: transaction.missionId,
              transactionBase64: base64FromBytes(versionedTransaction.serialize()),
            });
            signatures.push(sponsored.signature);
            continue;
          }
        }

        if (useGasSponsorship) {
          await postJson("/api/transactions/sponsor-preflight", {
            kind: transaction.kind,
            transactionBase64,
          });

          const sponsored = await signAndSendTransaction({
            transaction: transactionBytes,
            wallet,
            options: { sponsor: true },
          }).catch((error: unknown) => {
            throw new Error(privyTransactionErrorMessage(error));
          });

          const signature = bs58.encode(sponsored.signature);
          signatures.push(signature);
          await postJson("/api/transactions/sponsor-record", {
            kind: transaction.kind,
            signature,
          });
          continue;
        }

        const versionedTransaction = VersionedTransaction.deserialize(transactionBytes);
        const signed = await signTransaction({ transaction: versionedTransaction.serialize(), wallet });
        const signedBytes = "signedTransaction" in signed ? signed.signedTransaction : signed;
        const rawTransaction = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes as ArrayBuffer);
        const submitted = await connection.sendRawTransaction(rawTransaction, { skipPreflight: false }).catch(async (error: unknown) => {
          throw await formatSendTransactionError(error, connection, transaction.kind);
        });
        signatures.push(submitted);
        const confirmation = await connection.confirmTransaction(submitted, "confirmed");
        if (confirmation.value.err) {
          throw new Error("The on-chain transaction failed. No changes were saved.");
        }
      }

      const signature = signatures.at(-1) || null;
      setStatus(signature ? `Transaction submitted: ${signature}` : "Transaction was not submitted.");
      return signature;
    },
    [sessionAddress, signIn, signAndSendTransaction, signTransaction, wallet],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      ready,
      authenticated,
      address,
      isEmbeddedWallet,
      status,
      signIn,
      signOut,
      sendPreparedTransaction,
    }),
    [address, authenticated, isEmbeddedWallet, ready, sendPreparedTransaction, signIn, signOut, status],
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
      isEmbeddedWallet: false,
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
