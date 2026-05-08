import { PrivyClient, verifyIdentityToken } from "@privy-io/node";
import type { User } from "@privy-io/node";
import { createRemoteJWKSet } from "jose";

let client: PrivyClient | null = null;

function privyAppId() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is required to verify Privy sessions.");
  return appId;
}

function privyAppSecret() {
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appSecret) throw new Error("PRIVY_APP_SECRET is required to verify Privy sessions.");
  return appSecret;
}

function privyJwtVerificationKey() {
  const value = process.env.PRIVY_JWT_VERIFICATION_KEY?.trim();
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return undefined;
  return value.replace(/\\n/g, "\n");
}

function privyJwks() {
  const configured = process.env.PRIVY_JWT_VERIFICATION_KEY?.trim();
  const url =
    configured?.startsWith("http://") || configured?.startsWith("https://")
      ? configured
      : `https://auth.privy.io/api/v1/apps/${privyAppId()}/jwks.json`;
  return createRemoteJWKSet(new URL(url));
}

function privyClient() {
  if (!client) {
    client = new PrivyClient({
      appId: privyAppId(),
      appSecret: privyAppSecret(),
      jwtVerificationKey: privyJwtVerificationKey(),
    });
  }

  return client;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme.toLowerCase() !== "bearer" || !token) throw new Error("Privy access token is required.");
  return token;
}

function identityToken(request: Request) {
  return request.headers.get("privy-id-token") || null;
}

function hasLinkedSolanaWallet(user: User, address: string) {
  return user.linked_accounts.some((account) => account.type === "wallet" && account.chain_type === "solana" && account.address === address);
}

export async function verifyPrivyWalletSession(request: Request, address?: string) {
  if (!address) throw new Error("address is required.");

  let user: User;
  const idToken = identityToken(request);
  if (idToken) {
    try {
      user = await verifyIdentityToken({
        identity_token: idToken,
        app_id: privyAppId(),
        verification_key: privyJwks(),
      });
    } catch (error) {
      console.error("Privy identity token verification failed", error);
      throw new Error("Privy identity token could not be verified. Make sure identity tokens are enabled in the Privy dashboard.");
    }
  } else {
    try {
      const claims = await privyClient().utils().auth().verifyAccessToken(bearerToken(request));
      user = await privyClient().users()._get(claims.user_id);
    } catch (error) {
      console.error("Privy session verification failed", error);
      throw new Error("Privy session could not be verified. Check PRIVY_APP_SECRET and restart the dev server.");
    }
  }

  if (!hasLinkedSolanaWallet(user, address)) {
    throw new Error("The selected wallet is not linked to the current Privy user.");
  }

  return {
    address,
    privyUserId: user.id,
  };
}
