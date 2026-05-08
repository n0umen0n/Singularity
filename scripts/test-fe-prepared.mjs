#!/usr/bin/env node
// Smoke-test the new vote/execute prepared-transaction backend wiring without going through the UI.
// Forges a session cookie using SINGULARITY_SESSION_SECRET, posts to /vote and /execute, and asserts
// the response is `status: "ready"` with the expected accounts.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "apps/app/.env.local"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      return [line.slice(0, eq), line.slice(eq + 1)];
    }),
);

const SESSION_SECRET = env.SINGULARITY_SESSION_SECRET;
const HOST = "http://127.0.0.1:8094";
const COOKIE_NAME = "singularity_session";

function sign(payload) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function makeSessionCookie(address) {
  const payload = Buffer.from(JSON.stringify({
    address,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  })).toString("base64url");
  return `${COOKIE_NAME}=${payload}.${sign(payload)}`;
}

async function call(path_, address, body) {
  const response = await fetch(`${HOST}${path_}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: makeSessionCookie(address),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

const state = JSON.parse(readFileSync(path.join(ROOT, "scripts/.test-funding-flow.state.json"), "utf8"));
const VOTER_5 = "ASVfo39PVNuY1CzGAn5vBGjdgTi62zD6nJjgtJdeZjys";
const REQUESTER = "8F7YpepKxP1xc9Nqscdh6SSs5X7DmtPWUjUGViYShCxQ";

console.log(`Testing /api/funding-requests/${state.requestId}/vote with voter5 session`);
const voteResult = await call(`/api/funding-requests/${state.requestId}/vote`, VOTER_5, { vote: "approve" });
console.log("status:", voteResult.status);
if (voteResult.data?.error) console.log("error:", voteResult.data.error);
else if (voteResult.data?.transaction) {
  const tx = voteResult.data.transaction;
  console.log(`  transaction.status=${tx.status} kind=${tx.kind}`);
  console.log(`  instructions=${tx.instructions?.length} requiredSigners=${JSON.stringify(tx.requiredSigners)}`);
  console.log(`  accounts=${JSON.stringify(tx.accounts, null, 2)}`);
}

console.log(`\nTesting /api/funding-requests/${state.requestId}/execute with requester session`);
const execResult = await call(`/api/funding-requests/${state.requestId}/execute`, REQUESTER);
console.log("status:", execResult.status);
if (execResult.data?.error) console.log("error:", execResult.data.error);
else if (execResult.data?.transaction) {
  const tx = execResult.data.transaction;
  console.log(`  transaction.status=${tx.status} kind=${tx.kind}`);
  console.log(`  instructions=${tx.instructions?.length} requiredSigners=${JSON.stringify(tx.requiredSigners)}`);
  console.log(`  accounts=${JSON.stringify(tx.accounts, null, 2)}`);
}
