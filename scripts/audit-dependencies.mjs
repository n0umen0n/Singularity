import { spawnSync } from "node:child_process";

const allowlistedAdvisories = new Set([
  // Solana JS stack advisories are inherited through @solana/spl-token and Meteora SDKs.
  // The affected parsing helpers are not fed attacker-controlled binary layouts in this app.
  "GHSA-3gc7-fjrx-p6mg",
  // Mocha is test-only and locked with a direct serialize-javascript@7.0.5 dependency.
  // npm still attributes the advisory to Mocha's broad dependency range.
  "GHSA-5c6j-r48x-rmvq",
  "GHSA-qj8w-gfj5-8c6v",
  // esbuild/Vite dev-server exposure. Local dev scripts bind to 127.0.0.1 and this is not shipped.
  "GHSA-67mh-4wv8-2f99",
]);

function advisoryId(url = "") {
  return url.split("/").at(-1) || "";
}

const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
const report = JSON.parse(result.stdout || "{}");
const vulnerabilities = report.vulnerabilities || {};

const blocking = [];
const allowed = [];

function directAdvisories(vulnerability, seen = new Set()) {
  if (!vulnerability || seen.has(vulnerability.name)) return [];
  seen.add(vulnerability.name);

  return (vulnerability.via || []).flatMap((via) => {
    if (typeof via === "object") return [via];
    return directAdvisories(vulnerabilities[via], seen);
  });
}

for (const vulnerability of Object.values(vulnerabilities)) {
  const advisories = directAdvisories(vulnerability);
  const severities = [vulnerability.severity, ...advisories.map((via) => via.severity)].filter(Boolean);
  const hasHigh = severities.includes("high") || severities.includes("critical");
  if (!hasHigh) continue;

  const allAdvisoriesAllowlisted = advisories.length > 0 && advisories.every((via) => allowlistedAdvisories.has(advisoryId(via.url)));
  if (allAdvisoriesAllowlisted) {
    allowed.push(vulnerability.name);
    continue;
  }

  blocking.push(vulnerability);
}

if (allowed.length) {
  console.log(`Allowed high-severity advisories after review: ${Array.from(new Set(allowed)).sort().join(", ")}`);
}

if (blocking.length) {
  console.error(
    `Blocking dependency audit findings: ${blocking
      .map((vulnerability) => `${vulnerability.name} (${vulnerability.severity})`)
      .sort()
      .join(", ")}`,
  );
  process.exit(1);
}

console.log("Dependency audit passed with reviewed allowlist.");
