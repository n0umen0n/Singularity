import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export type Session = {
  address: string;
  issuedAt: number;
  expiresAt: number;
};

const cookieName = "singularity_session";
const maxAgeSeconds = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SINGULARITY_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("SINGULARITY_SESSION_SECRET is required in production.");
  }
  return "local-singularity-session-secret";
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function parseCookies(header: string | null) {
  const entries = new Map<string, string>();
  for (const part of (header || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (!name || !value.length) continue;
    entries.set(name, decodeURIComponent(value.join("=")));
  }
  return entries;
}

function verifyToken(token: string): Session | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
  if (!session.address || session.expiresAt <= Date.now()) return null;
  return session;
}

export function createSessionToken(address: string) {
  const session: Session = {
    address,
    issuedAt: Date.now(),
    expiresAt: Date.now() + maxAgeSeconds * 1000,
  };
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function getSession(request: Request): Session | null {
  const token = parseCookies(request.headers.get("cookie")).get(cookieName);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function requireSession(request: Request): Session {
  const session = getSession(request);
  if (!session) throw new Error("Authentication is required.");
  return session;
}

export function setSessionCookie(response: NextResponse, address: string) {
  response.cookies.set(cookieName, createSessionToken(address), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.delete(cookieName);
}
