#!/usr/bin/env node
/**
 * Refreshes apps/landing/public/og-image.png by fetching the hero OG image
 * rendered by the Next.js app. The Next.js dev or production server must be
 * running locally for this to work.
 *
 * Usage: node scripts/refresh-og.mjs [--url=http://127.0.0.1:8094/api/og/landing]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const arg = process.argv.find((a) => a.startsWith("--url="));
const url = arg
  ? arg.slice("--url=".length)
  : process.env.OG_URL ||
    "http://127.0.0.1:8094/api/og/landing";

const output = resolve(__dirname, "../public/og-image.png");

console.log(`Fetching landing OG from ${url}`);

const res = await fetch(url);
if (!res.ok) {
  console.error(`Failed: HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

const ct = res.headers.get("content-type") || "";
if (!ct.includes("image/png")) {
  console.error(`Unexpected content-type: ${ct}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, buf);
console.log(`Wrote ${output} (${buf.length} bytes)`);
